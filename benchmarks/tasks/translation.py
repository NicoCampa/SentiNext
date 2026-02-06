from __future__ import annotations

import json
import random
from string import Template
from typing import Any

from .base import Dataset, TaskItem, ValidationResult, read_prompt_file, sanitize_text, select_balanced_reviews


class TranslationToEnglishTask:
    name = "translation_to_english"
    response_mime_type = None  # plain text output, not JSON
    response_json_schema = None

    expected_schema = "<translated text in English>"

    constraints = (
        "- Output ONLY the translated text, nothing else\n"
        "- Preserve original formatting and tone\n"
        "- If text is already in English, return it unchanged\n"
    )

    def __init__(self) -> None:
        self._template = Template(read_prompt_file("translation_to_english_v1.txt"))

    def build_items(
        self,
        *,
        dataset: Dataset,
        suite: str,
        rng: random.Random,
        reference_labels: dict[str, dict[str, Any]] | None = None,
    ) -> list[TaskItem]:
        totals = {"quick": 8, "core": 20, "full": 50}
        total_needed = totals.get(suite, 20)

        non_en = [r for r in dataset.reviews if str(r.get("language") or "").lower() not in {"english", "en"}]
        selected = select_balanced_reviews(non_en, n=total_needed, rng=rng)

        items: list[TaskItem] = []
        for r in selected:
            review_id = str(r.get("review_id") or "")
            items.append(
                TaskItem(
                    id=review_id,
                    payload={
                        "review_id": review_id,
                        "language": str(r.get("language") or "unknown"),
                        "text": sanitize_text(str(r.get("review") or ""), max_chars=400).replace("\n", " ").strip(),
                    },
                )
            )
        return items

    def build_prompt(self, *, item: TaskItem, dataset: Dataset) -> str:
        return self._template.substitute(text=str(item.payload.get("text") or ""))

    def validate(self, *, output_text: str, item: TaskItem, dataset: Dataset) -> ValidationResult:
        errors: list[str] = []
        text = (output_text or "").strip()
        if not text:
            errors.append("empty_translation")

        ok = not errors
        return ValidationResult(ok=ok, errors=errors, parsed={"translation": text} if ok else None)

    def build_judge_input(self, *, item: TaskItem, dataset: Dataset) -> dict[str, Any]:
        return {
            "review_id": str(item.payload.get("review_id") or ""),
            "source_language": str(item.payload.get("language") or "unknown"),
            "source_text": str(item.payload.get("text") or ""),
        }
