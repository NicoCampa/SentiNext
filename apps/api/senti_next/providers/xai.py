"""xAI (Grok) LLM provider using xai-sdk."""
from __future__ import annotations

import logging
import os
import random
import time
from typing import Any, Dict, List, Optional

from .base import LLMProvider

logger = logging.getLogger(__name__)

LLM_TIMEOUT_SECONDS = int(os.getenv("SENTINEXT_LLM_TIMEOUT", "30"))
LLM_MAX_RETRIES = int(os.getenv("SENTINEXT_LLM_MAX_RETRIES", "3"))
LLM_BASE_RETRY_DELAY = float(os.getenv("SENTINEXT_LLM_RETRY_DELAY", "2.0"))


def _calculate_retry_delay(attempt: int, error_type: str) -> float:
    base_delay = LLM_BASE_RETRY_DELAY
    if error_type == "rate_limited":
        base_delay = 20.0
    elif error_type == "server_error":
        base_delay = 5.0
    delay = base_delay * (2 ** (attempt - 1))
    jitter = random.uniform(0, delay * 0.1)
    return min(delay + jitter, 60.0)


class XAIProvider(LLMProvider):
    """xAI (Grok) provider using xai_sdk."""

    def __init__(self, model_name: str | None = None):
        self._model = model_name or os.getenv(
            "SENTINEXT_XAI_MODEL", "grok-4-1-fast-non-reasoning"
        )
        self._reasoning_model = os.getenv(
            "SENTINEXT_XAI_MODEL_REASONING", "grok-4-1-fast-reasoning"
        )

    @property
    def name(self) -> str:
        return "xai"

    @property
    def model(self) -> str:
        return self._model

    @property
    def reasoning_model(self) -> str:
        return self._reasoning_model

    def _get_api_key(self) -> str:
        key = os.getenv("XAI_API_KEY", "")
        if not key:
            raise RuntimeError("XAI_API_KEY is not set.")
        return key

    # ---- core generation ----

    def generate(
        self,
        prompt: str,
        system: str | None = None,
        response_schema: dict | None = None,
        temperature: float = 0.0,
    ) -> str:
        return self._call_xai(prompt, self._model)

    def generate_structured(
        self,
        prompt: str,
        response_schema: dict,
        system: str | None = None,
        temperature: float = 0.0,
    ) -> dict:
        import json
        raw = self._call_xai(prompt, self._model)
        return json.loads(raw)

    def generate_with_pydantic(
        self,
        prompt: str,
        parse_model: type,
        system: str | None = None,
        temperature: float = 0.0,
    ) -> str:
        """xAI supports native Pydantic parsing via chat.parse()."""
        return self._call_xai(prompt, self._model, parse_model=parse_model)

    def generate_with_pydantic_model(
        self,
        prompt: str,
        parse_model: type,
        model: str,
    ) -> str:
        """Call a specific xAI model with Pydantic parsing."""
        return self._call_xai(prompt, model, parse_model=parse_model)

    async def generate_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        system: str | None = None,
        temperature: float = 0.0,
    ) -> dict:
        """xAI does not currently support tool calling. Raise NotImplementedError."""
        raise NotImplementedError("xAI provider does not support tool calling yet.")

    # ---- internal call with retry logic ----

    def _call_xai(
        self,
        prompt: str,
        model: str,
        *,
        parse_model: type | None = None,
    ) -> str:
        """Run xAI API call with timeout and retry handling."""
        from xai_sdk import Client as XaiClient
        from xai_sdk.chat import user as xai_user

        api_key = self._get_api_key()
        start_time = time.time()
        logger.info("Starting xAI API call with model %s", model)

        attempt = 0
        while attempt < LLM_MAX_RETRIES:
            attempt += 1
            try:
                client = XaiClient(api_key=api_key, timeout=LLM_TIMEOUT_SECONDS)
                create_kwargs: Dict[str, Any] = {
                    "model": model,
                    "temperature": 0.1,
                    "max_tokens": 8192,
                }
                if parse_model is None:
                    create_kwargs["response_format"] = "json_object"
                chat = client.chat.create(**create_kwargs)
                chat.append(xai_user(prompt))

                if parse_model is not None:
                    response, _parsed = chat.parse(parse_model)
                else:
                    response = chat.sample()

                content = response.content
                elapsed = time.time() - start_time
                logger.info("xAI API call completed in %.2fs (attempt %d)", elapsed, attempt)

                if not content or not content.strip():
                    raise RuntimeError("Empty response from xAI.")

                # Record token usage
                self._record_usage(response, model)
                return content

            except RuntimeError:
                raise
            except Exception as e:
                error_str = str(e).lower()
                is_transient = any(
                    tok in error_str
                    for tok in ("timeout", "429", "rate", "temporar", "unavailable", "503", "502", "500")
                )

                logger.warning("xAI API error: %s (attempt %d/%d)", e, attempt, LLM_MAX_RETRIES)

                if not is_transient:
                    raise RuntimeError(f"xAI API error (non-retryable): {e}") from e

                if attempt < LLM_MAX_RETRIES:
                    if "429" in str(e) or "rate" in error_str:
                        delay = _calculate_retry_delay(attempt, "rate_limited")
                    else:
                        delay = _calculate_retry_delay(attempt, "server_error")
                    logger.info("Retrying in %.1fs...", delay)
                    time.sleep(delay)
                    continue

                raise RuntimeError(f"xAI API error after {LLM_MAX_RETRIES} attempts: {e}") from e

        raise RuntimeError(f"xAI API call failed after {LLM_MAX_RETRIES} attempts")

    def _record_usage(self, response: Any, model: str) -> None:
        """Best-effort usage logging."""
        try:
            from ..llm import _record_llm_usage, _safe_int
            usage = response.usage
            if usage is not None:
                _record_llm_usage(
                    None,
                    model,
                    provider="xai",
                    prompt_tokens=_safe_int(getattr(usage, "prompt_tokens", None)),
                    response_tokens=_safe_int(getattr(usage, "completion_tokens", None)),
                    total_tokens=_safe_int(getattr(usage, "total_tokens", None)),
                )
        except Exception:
            pass
