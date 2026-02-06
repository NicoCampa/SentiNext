from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

from .base import ProviderError, ProviderResponse, TokenUsage


def _safe_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except Exception:
        return None


def _pydantic_model_from_json_schema(schema: dict) -> Any:
    """Dynamically create a Pydantic model from a JSON schema dict.

    The xAI SDK's chat.parse() requires a Pydantic BaseModel class.
    We create a minimal model that wraps the JSON schema so the SDK
    can use it for structured output.
    """
    from pydantic import BaseModel, Field
    from pydantic import create_model as pydantic_create_model

    # For simple object schemas with known properties, build fields directly.
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))

    if properties:
        field_defs: dict[str, Any] = {}
        for name, prop in properties.items():
            field_type = _json_type_to_python(prop)
            if name in required:
                field_defs[name] = (field_type, Field(description=prop.get("description", "")))
            else:
                field_defs[name] = (field_type, Field(default=None, description=prop.get("description", "")))
        return pydantic_create_model("DynamicModel", **field_defs)

    # For schemas with additionalProperties (dynamic keys like review_ids),
    # use a model with a single __root__ / model that wraps a dict.
    # Fall back to returning None so caller uses chat.sample() instead.
    return None


def _json_type_to_python(prop: dict) -> Any:
    """Map a JSON schema property to a Python type annotation."""
    from typing import Dict, List, Literal, Optional

    t = prop.get("type", "string")
    if t == "string":
        enum_values = prop.get("enum")
        if enum_values and isinstance(enum_values, list):
            return Literal[tuple(enum_values)]
        return str
    elif t == "integer":
        return int
    elif t == "number":
        return float
    elif t == "boolean":
        return bool
    elif t == "array":
        items = prop.get("items", {})
        item_type = _json_type_to_python(items)
        return List[item_type]
    elif t == "object":
        # For objects with additionalProperties, use Dict[str, ...]
        additional = prop.get("additionalProperties")
        if additional and isinstance(additional, dict):
            val_type = _json_type_to_python(additional)
            return Dict[str, val_type]
        # For objects with fixed properties, use Dict[str, Any]
        return Dict[str, Any]
    return Any


@dataclass(frozen=True)
class XaiSdkProvider:
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
            from xai_sdk import Client  # type: ignore
            from xai_sdk.chat import user  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise ProviderError("xai-sdk is not installed. Run: pip install xai-sdk", provider="xai", model=model) from exc

        # Build a Pydantic model from the schema for chat.parse()
        pydantic_model = None
        if response_json_schema and response_mime_type == "application/json":
            pydantic_model = _pydantic_model_from_json_schema(response_json_schema)

        client = Client(api_key=self.api_key, timeout=timeout_s)
        last_exc: Exception | None = None

        for attempt in range(1, int(retries) + 2):
            t0 = time.perf_counter()
            try:
                chat = client.chat.create(model=model)
                chat.append(user(prompt))

                if pydantic_model is not None:
                    # Use structured output via chat.parse()
                    response, parsed = chat.parse(pydantic_model)
                    text = response.content if isinstance(getattr(response, "content", None), str) else json.dumps(parsed.model_dump(), ensure_ascii=False)
                else:
                    # Fall back to chat.sample()
                    try:
                        response = chat.sample(temperature=float(temperature), max_tokens=int(max_tokens))
                    except TypeError:
                        try:
                            response = chat.sample(temperature=float(temperature))
                        except TypeError:
                            response = chat.sample()
                    text = None

                latency_ms = int((time.perf_counter() - t0) * 1000)

                if text is None:
                    content = getattr(response, "content", None)
                    if content is None or (isinstance(content, str) and not content.strip()):
                        raise ProviderError("Empty content returned", provider="xai", model=model)
                    text = content if isinstance(content, str) else str(content)

                usage = None
                usage_obj = getattr(response, "usage", None)
                if usage_obj is not None:
                    usage = TokenUsage(
                        prompt_tokens=_safe_int(getattr(usage_obj, "prompt_tokens", None)),
                        completion_tokens=_safe_int(getattr(usage_obj, "completion_tokens", None)),
                        total_tokens=_safe_int(getattr(usage_obj, "total_tokens", None)),
                    )

                return ProviderResponse(
                    provider="xai",
                    model=model,
                    text=text,
                    latency_ms=latency_ms,
                    usage=usage,
                    raw=response,
                )
            except Exception as exc:
                last_exc = exc
                # Retry only on likely transient errors.
                if attempt <= retries and any(token in str(exc).lower() for token in ["timeout", "429", "rate", "temporar", "unavailable", "503"]):
                    time.sleep(min(10.0, 0.5 * (2 ** max(0, attempt - 1))))
                    continue
                raise ProviderError(f"xAI SDK call failed: {exc}", provider="xai", model=model) from exc

        raise ProviderError(f"xAI SDK call failed: {last_exc}", provider="xai", model=model)

