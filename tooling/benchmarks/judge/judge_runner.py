from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional

from .rubric import CRITERIA_WEIGHTS, LABELS, label_for_score


@dataclass(frozen=True)
class JudgeOutput:
    overall: int
    label: str
    criteria: dict[str, int]
    notes: str
    failures: list[str]
    raw: dict[str, Any]


def build_judge_prompt(
    *,
    rubric_text: str,
    task_name: str,
    expected_schema: str,
    task_constraints: str,
    input_block: str,
    candidate_output: str,
) -> str:
    return (
        "You are an expert evaluator for LLM outputs.\n\n"
        f"TASK: {task_name}\n\n"
        "EXPECTED OUTPUT SCHEMA (for reference):\n"
        f"{expected_schema}\n\n"
        "TASK CONSTRAINTS:\n"
        f"{task_constraints}\n\n"
        "INPUT (authoritative):\n"
        f"{input_block}\n\n"
        "CANDIDATE OUTPUT:\n"
        f"{candidate_output}\n\n"
        "EVALUATION RUBRIC:\n"
        f"{rubric_text}\n"
    )


def parse_judge_output(text: str) -> JudgeOutput:
    raw: dict[str, Any]
    try:
        raw = json.loads(text)
    except Exception:
        raw = {}

    criteria_raw = raw.get("criteria") if isinstance(raw, dict) else None
    if not isinstance(criteria_raw, dict):
        criteria_raw = {}

    def _to_int(v: Any) -> int:
        try:
            return int(round(float(v)))
        except Exception:
            return 0

    criteria = {k: max(0, min(100, _to_int(criteria_raw.get(k)))) for k in CRITERIA_WEIGHTS.keys()}
    overall = max(0, min(100, _to_int(raw.get("overall") if isinstance(raw, dict) else 0)))

    # Enforce label from band mapping, regardless of judge output.
    label = label_for_score(overall)

    notes = str(raw.get("notes") or "").strip() if isinstance(raw, dict) else ""
    failures_raw = raw.get("failures") if isinstance(raw, dict) else None
    failures: list[str] = []
    if isinstance(failures_raw, list):
        failures = [str(x).strip() for x in failures_raw if str(x).strip()]

    return JudgeOutput(
        overall=overall,
        label=label,
        criteria=criteria,
        notes=notes,
        failures=failures,
        raw=raw if isinstance(raw, dict) else {},
    )

