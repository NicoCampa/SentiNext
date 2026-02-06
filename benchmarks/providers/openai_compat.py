from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Optional

import requests

from .base import ProviderError, ProviderResponse, TokenUsage


def _sleep_backoff(attempt: int) -> None:
    time.sleep(min(10.0, 0.5 * (2 ** max(0, attempt - 1))))


@dataclass(frozen=True)
class OpenAICompatProvider:
    provider_name: str
    base_url: str
    api_key: str | None

    def _url(self) -> str:
        return self.base_url.rstrip("/") + "/chat/completions"

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
        url = self._url()
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        is_openai = self.base_url and "api.openai.com" in self.base_url
        body: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
        }
        # Newer OpenAI models require max_completion_tokens instead of
        # max_tokens.  For non-OpenAI endpoints keep the legacy param.
        if is_openai:
            body["max_completion_tokens"] = int(max_tokens)
        else:
            body["max_tokens"] = int(max_tokens)
        # OpenAI reasoning models (gpt-5-mini, gpt-5-nano, o-series) reject
        # temperature != 1.  Only omit it for those; gpt-5.1 etc. are fine.
        if is_openai and temperature != 1.0:
            # Try sending temperature; if the model rejects it the retry
            # logic below will handle it.  Simpler: just skip it for known
            # reasoning-model name patterns.
            _m = model.lower()
            is_reasoning = any(t in _m for t in ("o1", "o3", "o4", "gpt-5-mini", "gpt-5-nano"))
            if not is_reasoning:
                body["temperature"] = float(temperature)
        else:
            body["temperature"] = float(temperature)
        # Structured output: prefer json_schema when a schema is provided,
        # fall back to json_object for basic JSON mode.
        if response_json_schema and response_mime_type == "application/json":
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "response",
                    "schema": response_json_schema,
                },
            }
        elif response_mime_type == "application/json":
            body["response_format"] = {"type": "json_object"}

        last_exc: Exception | None = None
        for attempt in range(1, int(retries) + 2):
            t0 = time.perf_counter()
            try:
                resp = requests.post(url, headers=headers, json=body, timeout=timeout_s)
                latency_ms = int((time.perf_counter() - t0) * 1000)
                if resp.status_code >= 400:
                    msg = resp.text[:500]
                    if resp.status_code in {429, 500, 502, 503, 504} and attempt <= retries:
                        _sleep_backoff(attempt)
                        continue
                    raise ProviderError(
                        f"HTTP {resp.status_code}: {msg}",
                        provider=self.provider_name,
                        model=model,
                        status_code=resp.status_code,
                    )

                data = resp.json()
                choices = data.get("choices") or []
                if not choices:
                    raise ProviderError("No choices returned", provider=self.provider_name, model=model, status_code=resp.status_code)
                message = choices[0].get("message") or {}
                content = message.get("content")
                if not isinstance(content, str) or not content.strip():
                    raise ProviderError("Empty content returned", provider=self.provider_name, model=model, status_code=resp.status_code)

                usage_raw = data.get("usage") or {}
                usage = None
                if isinstance(usage_raw, dict) and usage_raw:
                    usage = TokenUsage(
                        prompt_tokens=usage_raw.get("prompt_tokens"),
                        completion_tokens=usage_raw.get("completion_tokens"),
                        total_tokens=usage_raw.get("total_tokens"),
                    )
                return ProviderResponse(
                    provider=self.provider_name,
                    model=model,
                    text=content,
                    latency_ms=latency_ms,
                    usage=usage,
                    raw=data,
                )
            except (requests.RequestException, json.JSONDecodeError) as exc:
                last_exc = exc
                if attempt <= retries:
                    _sleep_backoff(attempt)
                    continue
                raise ProviderError(
                    f"Request failed: {exc}",
                    provider=self.provider_name,
                    model=model,
                ) from exc

        raise ProviderError(f"Request failed: {last_exc}", provider=self.provider_name, model=model)

