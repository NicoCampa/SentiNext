from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class ModelPrice:
    input_per_million: float
    output_per_million: float


class PriceTable:
    def __init__(self, prices: dict[str, ModelPrice], *, as_of: str | None = None) -> None:
        self._prices = prices
        self.as_of = as_of

    @classmethod
    def load(cls, path: Path) -> "PriceTable":
        raw = json.loads(path.read_text(encoding="utf-8"))
        models = raw.get("models") or {}
        if not isinstance(models, dict):
            raise ValueError("pricing table must contain 'models' dict")
        prices: dict[str, ModelPrice] = {}
        for model_id, entry in models.items():
            if not isinstance(entry, dict):
                continue
            prices[str(model_id)] = ModelPrice(
                input_per_million=float(entry.get("input_per_million", 0.0)),
                output_per_million=float(entry.get("output_per_million", 0.0)),
            )
        return cls(prices, as_of=str(raw.get("as_of")) if raw.get("as_of") else None)

    def estimate_cost_usd(
        self,
        *,
        model_id: str,
        prompt_tokens: Optional[int],
        completion_tokens: Optional[int],
    ) -> Optional[float]:
        if prompt_tokens is None or completion_tokens is None:
            return None
        price = self._prices.get(model_id)
        if not price:
            return None
        return (prompt_tokens / 1_000_000.0) * price.input_per_million + (completion_tokens / 1_000_000.0) * price.output_per_million

