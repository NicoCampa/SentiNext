"""Intent-based chat routing diagnostic."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.senti_next.intent import classify_intent, ChatIntent


def main() -> int:
    """Test intent classification with various questions."""
    test_cases = [
        # AGGREGATION
        ("create me a pie chart that reflects recommendation rate", ChatIntent.AGGREGATION),
        ("what percentage of reviews are positive?", ChatIntent.AGGREGATION),
        ("show me a bar chart of sentiment over time", ChatIntent.AGGREGATION),
        ("how many reviews mention bugs?", ChatIntent.AGGREGATION),
        ("compare cyberpunk vs elden ring recommendation rates", ChatIntent.AGGREGATION),
        ("what's the average playtime for negative reviews?", ChatIntent.AGGREGATION),

        # EXAMPLES
        ("show me reviews about performance issues", ChatIntent.EXAMPLES),
        ("what do players say about the story?", ChatIntent.EXAMPLES),
        ("find reviews that mention crashes", ChatIntent.EXAMPLES),
        ("give me examples of negative feedback", ChatIntent.EXAMPLES),
        ("quote some reviews about the graphics", ChatIntent.EXAMPLES),

        # MIXED
        ("what's the main complaint? give me examples", ChatIntent.MIXED),
        ("why are players unhappy? show some reviews", ChatIntent.MIXED),
        ("what percentage complain about bugs? show examples", ChatIntent.MIXED),
    ]

    print("Testing Intent Classification\n" + "=" * 60)

    for question, expected_intent in test_cases:
        detected_intent, _term, _is_entity = classify_intent(question)
        status = "✓" if detected_intent == expected_intent else "✗"
        print(f"{status} '{question[:50]}...'")
        print(f"  Expected: {expected_intent.value}, Got: {detected_intent.value}")
        if detected_intent != expected_intent:
            print("  ⚠️  MISMATCH!")
        print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
