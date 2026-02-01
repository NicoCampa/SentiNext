"""Intent classification for chat questions."""
from __future__ import annotations

import re
from enum import Enum
from typing import Tuple, Optional, List


class ChatIntent(Enum):
    """Intent type for chat questions."""
    AGGREGATION = "aggregation"        # Chart, stats, metrics, trends
    TOPIC_EXAMPLES = "topic_examples"  # Reviews from LLM subcategory (bugs, AI, performance)
    ENTITY_EXAMPLES = "entity_examples" # Reviews mentioning specific entities (Sonic, Mario)
    MIXED = "mixed"                    # Both analytics + examples


def classify_intent(message: str) -> Tuple[ChatIntent, Optional[str], bool]:
    """Classify user intent from their message.

    Args:
        message: User's question

    Returns:
        Tuple of (intent, search_term, is_entity)
        - intent: ChatIntent enum value
        - search_term: Extracted topic/entity to search for (None if not applicable)
        - is_entity: True if search_term is an entity, False if it's a topic

    Examples:
        "create a pie chart of recommendation rates" → (AGGREGATION, None, False)
        "show me reviews about bugs" → (TOPIC_EXAMPLES, "bugs", False)
        'what do people think of "Sonic"?' → (ENTITY_EXAMPLES, "Sonic", True)
        "what percentage mention Super Mario?" → (AGGREGATION, "Super Mario", True)
    """
    normalized = message.lower()

    # AGGREGATION indicators (charts, stats, metrics, trends)
    aggregation_patterns = [
        r'\b(chart|pie|bar|graph|plot|visualization|visualize)\b',
        r'\b(rate|percentage|percent|ratio|split|distribution)\b',
        r'\b(how many|count|total|number of)\b',
        r'\b(trend|over time|timeline|temporal)\b',
        r'\b(compare|comparison|versus|vs)\b',
        r'\b(average|median|mean|aggregate)\b',
        r'\b(statistics|stats|metrics|analytics)\b',
    ]

    # EXAMPLES indicators (specific reviews, quotes, drill-down)
    examples_patterns = [
        r'\b(show|give|find|list|quote)\s+(me\s+)?(reviews|examples|instances)\b',
        r'\b(what (are|do) (players|reviewers|people) (say|think))\b',
        r'\b(mention|talk about|discuss|complain|praise)\b',
        r'\b(evidence|proof|citations)\b',
    ]

    # Mixed indicators
    mixed_patterns = [
        r'\b(why|reason|cause|driving|behind)\b.*\b(show|example|quote)\b',
        r'\b(example|quote)\b.*\b(why|reason|cause)\b',
    ]

    # Count matches
    aggregation_matches = sum(
        1 for pattern in aggregation_patterns
        if re.search(pattern, normalized)
    )
    examples_matches = sum(
        1 for pattern in examples_patterns
        if re.search(pattern, normalized)
    )
    has_mixed = any(re.search(pattern, normalized) for pattern in mixed_patterns)

    # Extract topic or entity
    search_term, is_entity = extract_topic_or_entity(message)

    # Decision logic
    if has_mixed or (aggregation_matches > 0 and examples_matches > 0):
        return (ChatIntent.MIXED, search_term, is_entity)
    elif aggregation_matches > 0:
        # Aggregation intent - might also have a search term for filtering
        return (ChatIntent.AGGREGATION, search_term, is_entity)
    elif examples_matches > 0:
        # Examples intent - distinguish between topic and entity
        if search_term:
            if is_entity:
                return (ChatIntent.ENTITY_EXAMPLES, search_term, is_entity)
            else:
                return (ChatIntent.TOPIC_EXAMPLES, search_term, is_entity)
        else:
            # No specific term found, default to entity search (keyword-based)
            return (ChatIntent.ENTITY_EXAMPLES, None, False)
    else:
        # Default heuristics
        stat_words = [
            'recommendation', 'positive', 'negative', 'sentiment',
            'opinion', 'reception', 'feedback', 'review'
        ]
        if any(word in normalized for word in stat_words):
            return (ChatIntent.AGGREGATION, search_term, is_entity)

        # Check if we detected a topic or entity
        if search_term:
            if is_entity:
                return (ChatIntent.ENTITY_EXAMPLES, search_term, is_entity)
            else:
                return (ChatIntent.TOPIC_EXAMPLES, search_term, is_entity)

        # Final fallback: entity search
        return (ChatIntent.ENTITY_EXAMPLES, None, False)


def should_use_sql_aggregation(intent: ChatIntent) -> bool:
    """Determine if SQL aggregation should be used for this intent.

    Args:
        intent: Classified intent

    Returns:
        True if SQL aggregation should be used
    """
    return intent in (ChatIntent.AGGREGATION, ChatIntent.MIXED)


# Known topic keywords that map to LLM subcategories
# These are things that are ALREADY CLASSIFIED in your taxonomy
KNOWN_TOPICS = {
    # Technical
    "bug", "bugs", "crash", "crashes", "performance", "fps", "optimization",
    "glitch", "glitches", "lag", "networking", "network", "multiplayer",
    "server", "servers", "loading", "framerate",

    # Gameplay
    "gameplay", "mechanic", "mechanics", "control", "controls", "difficulty",
    "balance", "combat", "progression", "pacing",

    # Content/Design
    "story", "narrative", "plot", "writing", "character", "characters",
    "level design", "map", "maps", "quest", "quests", "mission", "missions",
    "replayability", "content", "variety",

    # UI/UX
    "ui", "ux", "interface", "menu", "menus", "hud", "accessibility",
    "quality of life", "qol", "settings",

    # Monetization
    "price", "pricing", "dlc", "microtransaction", "microtransactions",
    "mtx", "pay to win", "p2w", "value",

    # General sentiment topics
    "issue", "issues", "problem", "problems", "complaint", "complaints",
    "request", "requests", "feature", "features", "improvement", "improvements",

    # Domain-specific (add your specific taxonomy terms)
    "ai", "graphics", "audio", "sound", "music", "voice acting",
}


def extract_quoted_terms(message: str) -> List[str]:
    """Extract terms in quotes from the message.

    Args:
        message: User's question

    Returns:
        List of quoted terms

    Examples:
        'what do people think of "Sonic" character?' → ['Sonic']
        "reviews mentioning 'Super Mario'" → ['Super Mario']
    """
    # Match single or double quoted strings
    quoted = re.findall(r'"([^"]+)"|\'([^\']+)\'', message)
    return [q[0] or q[1] for q in quoted if q[0] or q[1]]


def is_likely_entity(term: str) -> bool:
    """Check if a term is likely a named entity (proper noun).

    Args:
        term: The term to check

    Returns:
        True if likely an entity (proper noun)

    Examples:
        'Sonic' → True (capitalized, not a topic)
        'Mario' → True
        'bugs' → False (lowercase topic)
        'AI' → False (known topic)
    """
    # Check if quoted (strong signal for entity)
    # Check if starts with capital letter and not a known topic
    term_lower = term.lower()

    # Known topics are NOT entities
    if term_lower in KNOWN_TOPICS:
        return False

    # All caps acronyms that are topics
    if term.isupper() and len(term) <= 4 and term_lower in KNOWN_TOPICS:
        return False

    # Capitalized words are likely entities (unless they're sentence-initial)
    if term[0].isupper() and len(term) > 1:
        return True

    return False


def extract_topic_or_entity(message: str) -> Tuple[Optional[str], bool]:
    """Extract the main topic or entity being asked about.

    Args:
        message: User's question

    Returns:
        Tuple of (term, is_entity)
        - term: The extracted topic/entity (None if not found)
        - is_entity: True if it's an entity, False if it's a topic

    Examples:
        'what do people think of "Sonic"?' → ('Sonic', True)
        'show me reviews about bugs' → ('bugs', False)
        'what percentage mention Super Mario?' → ('Super Mario', True)
        'reviews about AI' → ('AI', False)
    """
    # First check for quoted terms (highest priority)
    quoted = extract_quoted_terms(message)
    if quoted:
        # Quoted terms are entities unless they're known topics
        term = quoted[0]
        is_entity = is_likely_entity(term)
        return (term, is_entity)

    # Look for patterns: "about X", "mention X", "of X"
    patterns = [
        r'\b(?:about|regarding|concerning)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',  # about Sonic
        r'\b(?:mention|mentions|mentioning)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',  # mention Mario
        r'\bof\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',  # of Sonic, of the character
        r'\b(?:about|regarding)\s+(\w+)',  # about bugs (lowercase topic)
    ]

    for pattern in patterns:
        match = re.search(pattern, message)
        if match:
            term = match.group(1)
            is_entity = is_likely_entity(term)
            return (term, is_entity)

    # Check for known topics in the message
    message_lower = message.lower()
    for topic in KNOWN_TOPICS:
        # Word boundary matching to avoid partial matches
        if re.search(r'\b' + re.escape(topic) + r'\b', message_lower):
            return (topic, False)

    return (None, False)
