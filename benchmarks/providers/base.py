from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Protocol


@dataclass(frozen=True)
class TokenUsage:
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None


@dataclass(frozen=True)
class ProviderResponse:
    provider: str
    model: str
    text: str
    latency_ms: int
    usage: TokenUsage | None = None
    raw: Any | None = None


class ProviderError(RuntimeError):
    def __init__(self, message: str, *, provider: str, model: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.provider = provider
        self.model = model
        self.status_code = status_code


class Provider(Protocol):
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
    ) -> ProviderResponse: ...

