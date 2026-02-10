"""Gemini LLM provider using google-genai SDK."""
from __future__ import annotations

import asyncio
import copy
import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional

from .base import LLMProvider

logger = logging.getLogger(__name__)

# Reuse timeout/retry config from environment
LLM_TIMEOUT_SECONDS = int(os.getenv("SENTINEXT_LLM_TIMEOUT", "30"))
LLM_MAX_RETRIES = int(os.getenv("SENTINEXT_LLM_MAX_RETRIES", "3"))
LLM_BASE_RETRY_DELAY = float(os.getenv("SENTINEXT_LLM_RETRY_DELAY", "2.0"))


def strip_schema_enums(schema: dict) -> dict:
    """Deep-copy a JSON schema and remove all 'enum' keys from string items.

    Gemini's constrained decoding can reject schemas with large enums
    (e.g. 60-value enum repeated across batch properties exceeds state limits).
    """
    def _walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "string" and "enum" in node:
            del node["enum"]
        for v in node.values():
            if isinstance(v, dict):
                _walk(v)
            elif isinstance(v, list):
                for item in v:
                    _walk(item)

    result = copy.deepcopy(schema)
    _walk(result)
    return result


def _extract_status_code(error: Exception) -> Optional[int]:
    """Extract HTTP status code from a Gemini ClientError."""
    status_code = getattr(error, "status_code", None)
    if status_code is None:
        status_code = getattr(error, "status", None)
    if status_code is None:
        status_code = getattr(error, "code", None)
    if status_code is None:
        match = re.search(r"code[\"']?\s*:\s*(\d{3})", str(error))
        if match:
            try:
                status_code = int(match.group(1))
            except ValueError:
                pass
    return status_code


def _extract_retry_delay(error: Exception, default: float = 20) -> float:
    """Extract retry delay from a Gemini error message."""
    try:
        raw_message = getattr(error, "message", None)
        raw_text = str(raw_message) if raw_message is not None else str(error)
        match = re.search(r"retry in ([\d.]+)s", raw_text, flags=re.IGNORECASE)
        if match:
            return float(match.group(1)) + 1
    except Exception:
        pass
    return default


def _classify_error(status_code: Optional[int], error_message: str = "") -> tuple[str, bool]:
    """Classify error and return (error_type, is_retryable)."""
    if status_code == 400:
        return "bad_request", False
    elif status_code == 429:
        return "rate_limited", True
    elif status_code is not None and 500 <= status_code <= 504:
        return "server_error", True
    elif "timeout" in error_message.lower() or "timed out" in error_message.lower():
        return "timeout", True
    return "unknown", True


def _calculate_retry_delay(attempt: int, error_type: str, extracted_delay: Optional[float] = None) -> float:
    """Calculate retry delay with exponential backoff."""
    import random
    if extracted_delay is not None:
        return extracted_delay + 1

    base_delay = LLM_BASE_RETRY_DELAY
    if error_type == "rate_limited":
        base_delay = 20.0
    elif error_type == "server_error":
        base_delay = 5.0

    delay = base_delay * (2 ** (attempt - 1))
    jitter = random.uniform(0, delay * 0.1)
    return min(delay + jitter, 60.0)


class GeminiProvider(LLMProvider):
    """Google Gemini provider using google-genai SDK."""

    def __init__(self, model_name: str | None = None):
        self._model = model_name or os.getenv(
            "SENTINEXT_GEMINI_MODEL", "gemini-flash-lite-latest"
        )
        self._cheap_model = os.getenv(
            "SENTINEXT_GEMINI_MODEL_CHEAP", "gemini-flash-lite-latest"
        )

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def model(self) -> str:
        return self._model

    def _get_client(self) -> Any:
        from google import genai

        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY is not set.")
        return genai.Client(api_key=api_key)

    # ---- core generation (synchronous) ----

    def generate(
        self,
        prompt: str,
        system: str | None = None,
        response_schema: dict | None = None,
        temperature: float = 0.0,
    ) -> str:
        return self._call_gemini(
            prompt,
            self._model,
            response_json_schema=response_schema,
            system=system,
            temperature=temperature,
        )

    def generate_structured(
        self,
        prompt: str,
        response_schema: dict,
        system: str | None = None,
        temperature: float = 0.0,
    ) -> dict:
        raw = self._call_gemini(
            prompt,
            self._model,
            response_json_schema=response_schema,
            system=system,
            temperature=temperature,
        )
        return json.loads(raw)

    def generate_with_pydantic(
        self,
        prompt: str,
        parse_model: type,
        system: str | None = None,
        temperature: float = 0.0,
    ) -> str:
        """Gemini uses JSON schema from Pydantic model for structured output."""
        schema = parse_model.model_json_schema()
        return self._call_gemini(
            prompt,
            self._model,
            response_json_schema=schema,
            system=system,
        )

    # ---- tool calling (async) ----

    async def generate_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        system: str | None = None,
        temperature: float = 0.0,
    ) -> dict:
        return await self._call_gemini_with_tools(messages, tools, self._model)

    # ---- cheap model shortcut ----

    def generate_cheap(
        self,
        prompt: str,
        response_schema: dict | None = None,
        response_pydantic: type | None = None,
    ) -> str:
        """Use the cheap/lite model for tasks like translation, summaries."""
        json_schema = response_schema
        if json_schema is None and response_pydantic is not None:
            json_schema = response_pydantic.model_json_schema()
        return self._call_gemini(
            prompt,
            self._cheap_model,
            response_json_schema=json_schema,
        )

    # ---- internal Gemini call with retry logic ----

    def _call_gemini(
        self,
        prompt: str,
        model: str,
        *,
        response_json_schema: Optional[dict] = None,
        system: str | None = None,
        temperature: float = 0.0,
    ) -> str:
        """Call Gemini with retry, schema-stripping fallback, and timeout."""
        from google.genai.errors import ClientError

        client = self._get_client()
        start_time = time.time()
        logger.info("Starting Gemini API call with model %s", model)

        attempt = 0
        schema_stripped = False
        working_schema = response_json_schema

        while attempt < LLM_MAX_RETRIES:
            attempt += 1
            try:
                generate_kwargs: Dict[str, Any] = {
                    "model": model,
                    "contents": prompt,
                }
                if system:
                    generate_kwargs["contents"] = f"{system}\n\n{prompt}"

                config: Dict[str, Any] = {
                    "http_options": {"timeout": LLM_TIMEOUT_SECONDS},
                }
                if working_schema is not None:
                    config["response_mime_type"] = "application/json"
                    config["response_json_schema"] = working_schema
                if temperature > 0:
                    config["temperature"] = temperature
                generate_kwargs["config"] = config

                response = client.models.generate_content(**generate_kwargs)
                content = response.text
                elapsed = time.time() - start_time
                logger.info("Gemini API call completed in %.2fs (attempt %d)", elapsed, attempt)

                if not content:
                    raise RuntimeError("Empty response from Gemini.")

                # Record usage
                self._record_usage(response, model)
                return content

            except ClientError as e:
                status_code = _extract_status_code(e)
                error_type, retryable = _classify_error(status_code, str(e))

                logger.warning(
                    "Gemini API error (status=%s, type=%s): %s (attempt %d/%d)",
                    status_code, error_type, e, attempt, LLM_MAX_RETRIES,
                )

                # Schema too complex - strip enums and retry (doesn't count as an attempt)
                if not schema_stripped and "too many states" in str(e).lower() and working_schema:
                    logger.warning("Gemini schema too complex; stripping enum constraints")
                    working_schema = strip_schema_enums(working_schema)
                    schema_stripped = True
                    attempt -= 1
                    continue

                if not retryable:
                    raise RuntimeError(f"Gemini API error (non-retryable): {e}") from e

                if attempt < LLM_MAX_RETRIES:
                    extracted = _extract_retry_delay(e) if status_code == 429 else None
                    delay = _calculate_retry_delay(attempt, error_type, extracted)
                    logger.info("Retrying in %.1fs...", delay)
                    time.sleep(delay)
                    continue

                if status_code == 429:
                    raise RuntimeError(
                        "Gemini rate limit exceeded. Free tier allows 10 requests/minute."
                    ) from e
                raise RuntimeError(f"Gemini API error after {LLM_MAX_RETRIES} attempts: {e}") from e

        raise RuntimeError(f"Gemini API call failed after {LLM_MAX_RETRIES} attempts")

    # ---- internal tool-calling (async) ----

    async def _call_gemini_with_tools(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        model: str,
    ) -> dict:
        """Call Gemini with function-calling enabled.

        Returns dict with 'content' (str|None) and 'tool_calls' (list[dict]).
        """
        from google.genai import types
        from google.genai.errors import ClientError

        client = self._get_client()
        effective_timeout = LLM_TIMEOUT_SECONDS
        start_time = time.time()
        logger.info("Starting Gemini tool-calling API request with model %s", model)

        gemini_contents = self._convert_messages(messages)

        function_declarations = []
        for tool in tools:
            properties = tool.get("parameters", {}).get("properties", {})
            required = tool.get("parameters", {}).get("required", [])
            gemini_properties = {
                pname: self._to_gemini_schema(pdef) for pname, pdef in properties.items()
            }
            func_decl = types.FunctionDeclaration(
                name=tool["name"],
                description=tool.get("description", ""),
                parameters=types.Schema(
                    type="OBJECT",
                    properties=gemini_properties,
                    required=required if isinstance(required, list) else [],
                ) if gemini_properties else None,
            )
            function_declarations.append(func_decl)

        gemini_tools = [types.Tool(function_declarations=function_declarations)]
        attempt = 0

        while attempt < LLM_MAX_RETRIES:
            attempt += 1
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=model,
                        contents=gemini_contents,
                        config=types.GenerateContentConfig(
                            tools=gemini_tools,
                            tool_config=types.ToolConfig(
                                function_calling_config=types.FunctionCallingConfig(
                                    mode="AUTO",
                                )
                            ),
                        ),
                    ),
                    timeout=effective_timeout,
                )

                elapsed = time.time() - start_time
                logger.info("Gemini tool-calling completed in %.2fs (attempt %d)", elapsed, attempt)

                tool_calls: list[dict] = []
                content: str | None = None

                content_obj = None
                if response.candidates:
                    content_obj = response.candidates[0].content

                if content_obj and content_obj.parts:
                    for part in content_obj.parts:
                        if hasattr(part, "function_call") and part.function_call:
                            fc = part.function_call
                            tool_calls.append({
                                "name": fc.name,
                                "parameters": dict(fc.args) if fc.args else {},
                            })
                        elif hasattr(part, "text") and part.text:
                            content = part.text

                self._record_usage(response, model)
                return {"content": content, "tool_calls": tool_calls, "model": self.model_id()}

            except asyncio.TimeoutError:
                logger.warning(
                    "Gemini tool-calling timed out after %ds (attempt %d/%d)",
                    effective_timeout, attempt, LLM_MAX_RETRIES,
                )
                if attempt < LLM_MAX_RETRIES:
                    delay = _calculate_retry_delay(attempt, "timeout")
                    logger.info("Retrying in %.1fs...", delay)
                    await asyncio.sleep(delay)
                    continue
                raise RuntimeError(
                    f"Gemini tool-calling timed out after {effective_timeout}s"
                )

            except ClientError as e:
                status_code = _extract_status_code(e)
                error_type, retryable = _classify_error(status_code, str(e))

                logger.warning(
                    "Gemini tool-calling error (status=%s): %s (attempt %d/%d)",
                    status_code, e, attempt, LLM_MAX_RETRIES,
                )

                if not retryable:
                    raise RuntimeError(f"Gemini tool-calling error (non-retryable): {e}") from e

                if attempt < LLM_MAX_RETRIES:
                    extracted = _extract_retry_delay(e) if status_code == 429 else None
                    delay = _calculate_retry_delay(attempt, error_type, extracted)
                    logger.info("Retrying in %.1fs...", delay)
                    await asyncio.sleep(delay)
                    continue

                raise RuntimeError(
                    f"Gemini tool-calling error after {LLM_MAX_RETRIES} attempts: {e}"
                ) from e

        raise RuntimeError(f"Gemini tool-calling failed after {LLM_MAX_RETRIES} attempts")

    # ---- helpers ----

    @staticmethod
    def _to_gemini_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
        """Convert JSON-schema-like dict to Gemini schema dict (recursive)."""
        if not isinstance(schema, dict):
            return {"type": "STRING"}

        t = str(schema.get("type") or "string").upper()
        if t == "INT":
            t = "INTEGER"

        out: Dict[str, Any] = {"type": t}

        desc = schema.get("description")
        if isinstance(desc, str) and desc:
            out["description"] = desc

        enum = schema.get("enum")
        if isinstance(enum, list) and enum:
            out["enum"] = enum

        if t == "ARRAY":
            out["items"] = GeminiProvider._to_gemini_schema(schema.get("items") or {})
        elif t == "OBJECT":
            props = schema.get("properties") or {}
            if isinstance(props, dict) and props:
                out["properties"] = {
                    k: GeminiProvider._to_gemini_schema(v) for k, v in props.items()
                }
            required = schema.get("required") or []
            if isinstance(required, list) and required:
                out["required"] = required

        return out

    @staticmethod
    def _convert_messages(messages: List[Dict[str, Any]]) -> list:
        """Convert chat messages to Gemini content format."""
        from google.genai import types

        gemini_contents = []
        system_instruction = None

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                system_instruction = content
                continue

            elif role == "user":
                if system_instruction:
                    content = f"{system_instruction}\n\n{content}"
                    system_instruction = None
                gemini_contents.append(
                    types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=content)],
                    )
                )

            elif role == "assistant":
                tool_calls = msg.get("tool_calls")
                if tool_calls:
                    parts = []
                    for tc in tool_calls:
                        parts.append(
                            types.Part.from_function_call(
                                name=tc.get("name", ""),
                                args=tc.get("parameters", {}),
                            )
                        )
                    gemini_contents.append(types.Content(role="model", parts=parts))
                elif content:
                    gemini_contents.append(
                        types.Content(
                            role="model",
                            parts=[types.Part.from_text(text=content)],
                        )
                    )

            elif role == "tool":
                try:
                    tool_results = json.loads(content) if isinstance(content, str) else content
                    if isinstance(tool_results, list):
                        parts = []
                        for result in tool_results:
                            tool_name = result.get("tool", "unknown")
                            tool_result = result.get("result", {})
                            parts.append(
                                types.Part.from_function_response(
                                    name=tool_name,
                                    response=tool_result,
                                )
                            )
                        gemini_contents.append(types.Content(role="user", parts=parts))
                except (json.JSONDecodeError, TypeError):
                    gemini_contents.append(
                        types.Content(
                            role="user",
                            parts=[types.Part.from_text(text=str(content))],
                        )
                    )

        return gemini_contents

    def _record_usage(self, response: Any, model: str) -> None:
        """Best-effort usage logging via the storage module."""
        try:
            from .. import storage
            from ..llm import _record_llm_usage
            _record_llm_usage(response, model, provider="google")
        except Exception:
            pass
