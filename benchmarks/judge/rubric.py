from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LabelBand:
    label: str
    min_score: int
    max_score: int
    description: str


LABEL_BANDS: list[LabelBand] = [
    LabelBand(
        label="unacceptable",
        min_score=0,
        max_score=49,
        description="Wrong/misleading/unusable; significant hallucination; not actionable.",
    ),
    LabelBand(
        label="acceptable",
        min_score=50,
        max_score=69,
        description="Meets minimum; some gaps/vagueness; minor issues.",
    ),
    LabelBand(
        label="good",
        min_score=70,
        max_score=84,
        description="Solid, mostly faithful, specific, actionable; minor omissions.",
    ),
    LabelBand(
        label="excellent",
        min_score=85,
        max_score=100,
        description="Highly faithful, precise, strongly actionable, complete within constraints.",
    ),
]

LABELS = {b.label for b in LABEL_BANDS}

CRITERIA_WEIGHTS = {
    "faithfulness": 0.40,
    "usefulness": 0.30,
    "completeness": 0.20,
    "format": 0.10,
}


def label_for_score(score: int) -> str:
    score = max(0, min(100, int(score)))
    for band in LABEL_BANDS:
        if band.min_score <= score <= band.max_score:
            return band.label
    return "unacceptable"

