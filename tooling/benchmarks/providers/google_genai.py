from __future__ import annotations

import copy
import logging
import time
from dataclasses import dataclass
from typing import Any

from .base import ProviderError, ProviderResponse, TokenUsage

logger = logging.getLogger(__name__)


def _strip_enums(schema: dict) -> dict:
    """Deep-copy a JSON schema and remove all 'enum' keys from string items.

    Gemini's constrained decoding can reject schemas with large enums
    (e.g. 60-value enum × 9 arrays in a batch schema exceeds state limits).
    Stripping enums lets the call succeed with weaker constraints.
    """
    schema = copy.deepcopy(schema)
    _walk_strip_enum(schema)
    return schema


def _walk_strip_enum(node: Any) -> None:
    if not isinstance(node, dict):
        return
    if node.get("type") == "string" and "enum" in node:
        del node["enum"]
    for v in node.values():
        if isinstance(v, dict):
            _walk_strip_enum(v)
        elif isinstance(v, list):
            for item in v:
                _walk_strip_enum(item)


@dataclass(frozen=True)
class GoogleGenAIProvider:
    api_key: str

    def generate(
        self,
        *,
        prompt: str,
        model: str,
        temperature: float,
        max_tokens: int,
        timeout_s: int,
        retries: int,
        response_mime_type: str | None = None,
        response_json_schema: dict | None = None,
    ) -> ProviderResponse:
        try:
            from google import genai  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise ProviderError("google-genai is not installed", provider="google", model=model) from exc

        client = genai.Client(api_key=self.api_key)
        last_exc: Exception | None = None
        schema_stripped = False
        for attempt in range(1, int(retries) + 2):
            t0 = time.perf_counter()
            try:
                config: dict[str, Any] = {
                    "temperature": float(temperature),
                    "max_output_tokens": int(max_tokens),
                }
                if response_mime_type:
                    config["response_mime_type"] = response_mime_type
                if response_json_schema:
                    config["response_json_schema"] = response_json_schema
                resp = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config,
                )
                latency_ms = int((time.perf_counter() - t0) * 1000)
                text = getattr(resp, "text", None)
                if not isinstance(text, str) or not text.strip():
                    raise ProviderError("Empty content returned", provider="google", model=model)

                usage_md = getattr(resp, "usage_metadata", None)
                usage = None
                if usage_md is not None:
                    usage = TokenUsage(
                        prompt_tokens=getattr(usage_md, "prompt_token_count", None),
                        completion_tokens=getattr(usage_md, "response_token_count", None),
                        total_tokens=getattr(usage_md, "total_token_count", None),
                    )
                return ProviderResponse(
                    provider="google",
                    model=model,
                    text=text,
                    latency_ms=latency_ms,
                    usage=usage,
                    raw=resp,
                )
            except Exception as exc:  # pragma: no cover
                last_exc = exc
                err_str = str(exc).lower()

                # Schema too complex — strip enums and retry immediately
                if not schema_stripped and response_json_schema and "too many states" in err_str:
                    logger.warning("Gemini schema too complex; stripping enum constraints and retrying")
                    response_json_schema = _strip_enums(response_json_schema)
                    schema_stripped = True
                    continue

                # Retry only for obvious transient errors
                if attempt <= retries and any(token in err_str for token in ["429", "rate", "timeout", "temporar", "unavailable", "503"]):
                    time.sleep(min(10.0, 0.5 * (2 ** max(0, attempt - 1))))
                    continue
                raise ProviderError(f"Gemini call failed: {exc}", provider="google", model=model) from exc

        raise ProviderError(f"Gemini call failed: {last_exc}", provider="google", model=model)

