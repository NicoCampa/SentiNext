"""Topic vs entity detection diagnostic."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.senti_next.intent import classify_intent, ChatIntent, extract_topic_or_entity


def test_topic_vs_entity() -> None:
    """Test topic vs entity classification."""
    test_cases = [
        # TOPIC_EXAMPLES (use LLM subcategory labels)
        ("show me reviews about bugs", ChatIntent.TOPIC_EXAMPLES, "bugs", False),
        ("what do people say about AI?", ChatIntent.TOPIC_EXAMPLES, "ai", False),
        ("find reviews mentioning performance issues", ChatIntent.TOPIC_EXAMPLES, "performance", False),
        ("show me gameplay complaints", ChatIntent.TOPIC_EXAMPLES, "gameplay", False),
        ("reviews about crashes", ChatIntent.TOPIC_EXAMPLES, "crashes", False),

        # ENTITY_EXAMPLES (use keyword search)
        ('what do people think of "Sonic" character?', ChatIntent.ENTITY_EXAMPLES, "Sonic", True),
        ("show me reviews mentioning Super Mario", ChatIntent.ENTITY_EXAMPLES, "Super Mario", True),
        ("find mentions of Keanu Reeves", ChatIntent.ENTITY_EXAMPLES, "Keanu Reeves", True),
        ("reviews about Geralt", ChatIntent.ENTITY_EXAMPLES, "Geralt", True),

        # AGGREGATION with topic/entity
        ("what percentage of reviews mention bugs?", ChatIntent.AGGREGATION, "bugs", False),
        ('what percentage mention "Sonic"?', ChatIntent.AGGREGATION, "Sonic", True),
        ("how many reviews complain about AI?", ChatIntent.AGGREGATION, "ai", False),

        # MIXED
        ("why do people hate the AI? show examples", ChatIntent.MIXED, "ai", False),
    ]

    print("Testing Topic vs Entity Detection\n" + "="*80)
    print(f"{'Question':<50} {'Expected':<20} {'Got':<20} {'Term':<15} {'Status'}")
    print("="*80)

    correct = 0
    total = len(test_cases)

    for question, expected_intent, expected_term, expected_is_entity in test_cases:
        detected_intent, search_term, is_entity = classify_intent(question)

        # Check if intent matches
        intent_match = detected_intent == expected_intent

        # Check if term matches (case-insensitive)
        term_match = True
        if expected_term and search_term:
            term_match = search_term.lower() == expected_term.lower()
        elif expected_term is None and search_term is None:
            term_match = True
        else:
            term_match = False

        # Check if entity flag matches
        entity_match = is_entity == expected_is_entity

        # Overall match
        matches = intent_match and term_match and entity_match
        if matches:
            correct += 1

        status = "✓" if matches else "✗"

        # Truncate question for display
        q_display = question[:47] + "..." if len(question) > 50 else question

        print(f"{q_display:<50} {expected_intent.value:<20} {detected_intent.value:<20} "
              f"{search_term or 'None':<15} {status}")

        if not matches:
            print(f"  Expected: intent={expected_intent.value}, term={expected_term}, entity={expected_is_entity}")
            print(f"  Got:      intent={detected_intent.value}, term={search_term}, entity={is_entity}")

    print("="*80)
    print(f"Results: {correct}/{total} ({100*correct/total:.1f}%)")
    print()


def test_extraction() -> None:
    """Test topic/entity extraction logic."""
    test_cases = [
        ('what do people think of "Sonic"?', "Sonic", True),
        ("show me reviews about bugs", "bugs", False),
        ("reviews mentioning Super Mario", "Super Mario", True),
        ("what about AI?", "ai", False),
        ("find Geralt mentions", "Geralt", True),
        ("performance issues", "performance", False),
        ("talk about Keanu Reeves", "Keanu Reeves", True),
    ]

    print("Testing Extraction Logic\n" + "="*60)
    for message, expected_term, expected_entity in test_cases:
        term, is_entity = extract_topic_or_entity(message)
        match_term = term and term.lower() == expected_term.lower() if expected_term else term is None
        match_entity = is_entity == expected_entity
        status = "✓" if match_term and match_entity else "✗"

        print(f"{status} '{message}'")
        print(f"  Expected: {expected_term} (entity={expected_entity})")
        print(f"  Got:      {term} (entity={is_entity})")
        print()


def main() -> int:
    test_extraction()
    print()
    test_topic_vs_entity()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
