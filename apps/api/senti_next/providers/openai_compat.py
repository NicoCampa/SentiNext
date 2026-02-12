"""OpenAI-compatible LLM provider (supports OpenAI and Ollama)."""
from __future__ import annotations

import json
import logging
import os
import random
import time
from typing import Any, Dict, List, Optional

from .base import LLMProvider

logger = logging.getLogger(__name__)

OPENAI_TIMEOUT_SECONDS = int(os.getenv("SENTINEXT_LLM_TIMEOUT", "30"))
OLLAMA_TIMEOUT_SECONDS = int(os.getenv("SENTINEXT_OLLAMA_TIMEOUT", "120"))
LLM_MAX_RETRIES = int(os.getenv("SENTINEXT_LLM_MAX_RETRIES", "3"))

def _default_ollama_url() -> str:
    """Return the default Ollama base URL, auto-detecting Docker environments."""
    # Inside Docker, localhost doesn't reach the host — use host.docker.internal
    if os.path.exists("/.dockerenv"):
        return "http://host.docker.internal:11434/v1"
    return "http://localhost:11434/v1"


def _calculate_retry_delay(attempt: int, error_type: str) -> float:
    base_delay = 2.0
    if error_type == "rate_limited":
        base_delay = 20.0
    elif error_type == "server_error":
        base_delay = 5.0
    delay = base_delay * (2 ** (attempt - 1))
    jitter = random.uniform(0, delay * 0.1)
    return min(delay + jitter, 60.0)


class OpenAICompatProvider(LLMProvider):
    """Provider for OpenAI and Ollama (both use the openai Python SDK).

    Args:
        provider_type: "openai" or "ollama"
        model_name: Model to use (e.g. "gpt-4o-mini" or "llama3.1:8b")
    """

    def __init__(self, provider_type: str = "openai", model_name: str | None = None):
        self._provider_type = provider_type

        if provider_type == "openai":
            from .config import DEFAULT_MODELS
            self._model = model_name or os.getenv("SENTINEXT_OPENAI_MODEL", DEFAULT_MODELS.get("openai", "gpt-4o-mini"))
            self._base_url = "https://api.openai.com/v1"
            self._timeout_seconds = OPENAI_TIMEOUT_SECONDS
        else:
            from .config import DEFAULT_MODELS
            self._model = model_name or os.getenv("SENTINEXT_OLLAMA_MODEL", DEFAULT_MODELS.get("ollama", "llama3.1:8b"))
            self._base_url = os.getenv("SENTINEXT_OLLAMA_BASE_URL", _default_ollama_url())
            self._timeout_seconds = OLLAMA_TIMEOUT_SECONDS

    @property
    def name(self) -> str:
        return self._provider_type

    @property
    def model(self) -> str:
        return self._model

    def _get_api_key(self) -> str:
        """Return the API key, reading from env at call time for OpenAI so runtime key updates work."""
        if self._provider_type == "openai":
            return os.getenv("OPENAI_API_KEY", "")
        return "ollama"  # Ollama doesn't need a real key but the SDK requires one

    def _get_client(self) -> Any:
        """Create a synchronous OpenAI client."""
        from openai import OpenAI
        return OpenAI(
            api_key=self._get_api_key(),
            base_url=self._base_url,
            timeout=self._timeout_seconds,
        )

    def _get_async_client(self) -> Any:
        """Create an async OpenAI client."""
        from openai import AsyncOpenAI
        return AsyncOpenAI(
            api_key=self._get_api_key(),
            base_url=self._base_url,
            timeout=self._timeout_seconds,
        )

    # ---- core generation ----

    def generate(
        self,
        prompt: str,
        system: str | None = None,
        response_schema: dict | None = None,
        temperature: float = 0.0,
    ) -> str:
        messages: List[Dict[str, Any]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        kwargs: Dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
        }

        if response_schema and self._provider_type == "openai":
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "response", "strict": True, "schema": response_schema},
            }
        elif response_schema:
            # Ollama: use JSON mode with schema in the prompt
            kwargs["response_format"] = {"type": "json_object"}
            schema_str = json.dumps(response_schema, indent=2)
            messages[-1]["content"] += f"\n\nRespond with JSON matching this schema:\n{schema_str}"

        return self._call_with_retry(kwargs)

    def generate_structured(
        self,
        prompt: str,
        response_schema: dict,
        system: str | None = None,
        temperature: float = 0.0,
    ) -> dict:
        raw = self.generate(prompt, system=system, response_schema=response_schema, temperature=temperature)
        return json.loads(raw)

    def generate_with_pydantic(
        self,
        prompt: str,
        parse_model: type,
        system: str | None = None,
        temperature: float = 0.0,
    ) -> str:
        """Use JSON schema from Pydantic model for structured output."""
        schema = parse_model.model_json_schema()
        return self.generate(prompt, system=system, response_schema=schema, temperature=temperature)

    async def generate_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        system: str | None = None,
        temperature: float = 0.0,
    ) -> dict:
        """Generate with OpenAI-compatible function calling."""
        client = self._get_async_client()

        # Build messages list
        api_messages: List[Dict[str, Any]] = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "tool":
                # Tool results - parse and add as individual tool messages
                try:
                    tool_results = json.loads(content) if isinstance(content, str) else content
                    if isinstance(tool_results, list):
                        for result in tool_results:
                            api_messages.append({
                                "role": "tool",
                                "tool_call_id": result.get("tool_call_id", result.get("tool", "unknown")),
                                "content": json.dumps(result.get("result", {})),
                            })
                    else:
                        api_messages.append({"role": "tool", "tool_call_id": "unknown", "content": str(content)})
                except (json.JSONDecodeError, TypeError):
                    api_messages.append({"role": "tool", "tool_call_id": "unknown", "content": str(content)})
            elif role == "assistant":
                tool_calls = msg.get("tool_calls")
                if tool_calls:
                    api_messages.append({
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": tc.get("id", tc.get("name", "call")),
                                "type": "function",
                                "function": {
                                    "name": tc.get("name", ""),
                                    "arguments": json.dumps(tc.get("parameters", {})),
                                },
                            }
                            for tc in tool_calls
                        ],
                    })
                else:
                    api_messages.append({"role": role, "content": content})
            else:
                api_messages.append({"role": role, "content": content})

        # Convert tools to OpenAI format
        openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": tool.get("parameters", {}),
                },
            }
            for tool in tools
        ]

        attempt = 0
        while attempt < LLM_MAX_RETRIES:
            attempt += 1
            try:
                response = await client.chat.completions.create(
                    model=self._model,
                    messages=api_messages,
                    tools=openai_tools if openai_tools else None,
                    temperature=temperature,
                )

                choice = response.choices[0]
                content = choice.message.content
                tool_calls_out: List[Dict[str, Any]] = []

                if choice.message.tool_calls:
                    for tc in choice.message.tool_calls:
                        tool_calls_out.append({
                            "name": tc.function.name,
                            "parameters": json.loads(tc.function.arguments) if tc.function.arguments else {},
                        })

                self._record_usage(response)
                return {"content": content, "tool_calls": tool_calls_out, "model": self.model_id()}

            except Exception as e:
                error_str = str(e).lower()
                is_transient = any(
                    tok in error_str
                    for tok in ("timeout", "429", "rate", "temporar", "unavailable", "503", "502", "500", "connection")
                )
                logger.warning("OpenAI-compat tool-calling error: %s (attempt %d/%d)", e, attempt, LLM_MAX_RETRIES)

                if not is_transient or attempt >= LLM_MAX_RETRIES:
                    raise RuntimeError(f"OpenAI-compat tool-calling error: {e}") from e

                import asyncio
                delay = _calculate_retry_delay(attempt, "server_error")
                await asyncio.sleep(delay)

        raise RuntimeError(f"OpenAI-compat tool-calling failed after {LLM_MAX_RETRIES} attempts")

    # ---- internal sync call with retry ----

    def _call_with_retry(self, kwargs: Dict[str, Any]) -> str:
        """Call OpenAI-compatible API with retry logic."""
        client = self._get_client()
        attempt = 0
        start_time = time.time()

        while attempt < LLM_MAX_RETRIES:
            attempt += 1
            try:
                response = client.chat.completions.create(**kwargs)
                content = response.choices[0].message.content
                elapsed = time.time() - start_time
                logger.info(
                    "%s API call completed in %.2fs (attempt %d)",
                    self._provider_type, elapsed, attempt,
                )

                if not content or not content.strip():
                    raise RuntimeError(f"Empty response from {self._provider_type}.")

                self._record_usage(response)
                return content

            except RuntimeError:
                raise
            except Exception as e:
                error_str = str(e).lower()
                is_transient = any(
                    tok in error_str
                    for tok in ("timeout", "429", "rate", "temporar", "unavailable", "503", "502", "500", "connection")
                )

                logger.warning(
                    "%s API error: %s (attempt %d/%d)",
                    self._provider_type, e, attempt, LLM_MAX_RETRIES,
                )

                if not is_transient:
                    raise RuntimeError(f"{self._provider_type} API error: {e}") from e

                if attempt < LLM_MAX_RETRIES:
                    if "429" in str(e) or "rate" in error_str:
                        delay = _calculate_retry_delay(attempt, "rate_limited")
                    else:
                        delay = _calculate_retry_delay(attempt, "server_error")
                    logger.info("Retrying in %.1fs...", delay)
                    time.sleep(delay)
                    continue

                raise RuntimeError(
                    f"{self._provider_type} API error after {LLM_MAX_RETRIES} attempts: {e}"
                ) from e

        raise RuntimeError(f"{self._provider_type} API call failed after {LLM_MAX_RETRIES} attempts")

    def _record_usage(self, response: Any) -> None:
        """Best-effort usage logging."""
        try:
            from ..llm import _record_llm_usage, _safe_int
            usage = response.usage
            if usage:
                _record_llm_usage(
                    None,
                    self._model,
                    provider=self._provider_type,
                    prompt_tokens=_safe_int(getattr(usage, "prompt_tokens", None)),
                    response_tokens=_safe_int(getattr(usage, "completion_tokens", None)),
                    total_tokens=_safe_int(getattr(usage, "total_tokens", None)),
                )
        except Exception:
            pass
