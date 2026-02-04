"""Intent classification for chat questions."""
from __future__ import annotations

import re
from enum import Enum
from typing import Tuple, Optional, List, Dict, Any


class ChatIntent(Enum):
    """Intent type for chat questions."""
    AGGREGATION = "aggregation"        # Chart, stats, metrics, trends
    TOPIC_EXAMPLES = "topic_examples"  # Reviews from LLM subcategory (bugs, AI, performance)
    ENTITY_EXAMPLES = "entity_examples" # Reviews mentioning specific entities (Sonic, Mario)
    MIXED = "mixed"                    # Both analytics + examples
    # New intents for advanced queries
    TREND = "trend"                    # Time-based queries (sentiment over time, since launch)
    SEGMENT = "segment"                # Playtime/experience-based queries (veterans vs newcomers)
    COMPARISON = "comparison"          # Before/after comparisons (EA vs release, patches)
    RISK = "risk"                      # Refund risk, churn, retention analysis
    FEATURE_REQUESTS = "feature_requests"  # What players want (most requested features)
    LANGUAGE = "language"              # Language-based queries (issues by language, sentiment by region)


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
        "how has sentiment changed since launch?" → (TREND, None, False)
        "what do veterans complain about?" → (SEGMENT, None, False)
        "compare early access vs release" → (COMPARISON, None, False)
        "what's the refund risk?" → (RISK, None, False)
        "what features do players want?" → (FEATURE_REQUESTS, None, False)
        "what issues are German players having?" → (LANGUAGE, None, False)
    """
    normalized = message.lower()

    # NEW: LANGUAGE indicators (language/region-based queries)
    language_patterns = [
        r'\b(by language|per language|by region|per region)\b',
        r'\b(language|languages)\s*(breakdown|distribution|split)\b',
        r'\b(english|german|french|spanish|russian|chinese|japanese|korean|brazilian|portuguese|italian|polish|turkish)\s+(player|players|reviewer|reviewers|review|reviews|user|users)\b',
        r'\b(player|players|reviewer|reviewers|user|users)\s+(from|in|speaking)\s+(english|german|french|spanish|russian|chinese|japan|korea|brazil|portugal|italy|poland|turkey)\b',
        r'\b(what).*(issues|problems|complaints|feedback).*(language|region|country|english|german|french|spanish|russian|chinese|japanese)\b',
        r'\b(different languages|different regions|various languages)\b',
        r'\b(international|localization|non.?english)\s+(player|players|review|reviews|user|users|feedback)\b',
    ]

    # NEW: TREND indicators (time-based queries)
    trend_patterns = [
        r'\b(trend|trending|over time|since launch|since release)\b',
        r'\b(changed|changing|evolution|evolved|history|historical)\b',
        r'\b(last (week|month|year|patch)|recent(ly)?|lately)\b',
        r'\b(weekly|monthly|yearly|daily)\b',
        r'\b(past (\d+|few|several) (days?|weeks?|months?|years?))\b',
        r'\b(did the (last )?patch|after the (update|patch|fix))\b',
        r'\b(before|after) (the )?(update|patch|release|launch)\b',
    ]

    # NEW: SEGMENT indicators (playtime/experience-based queries)
    segment_patterns = [
        r'\b(veteran|veterans|newcomer|newcomers|newbie|newbies)\b',
        r'\b(playtime|play time|hours played|hours of play)\b',
        r'\b(\d+\+?\s*h(ours?)?|hours?\s*(of|with))\b',
        r'\b(casual|hardcore|experienced|inexperienced)\b',
        r'\b(new player|long.?time (player|fan)|first.?time)\b',
        r'\b(by (playtime|experience|hours))\b',
        r'\b(low playtime|high playtime|little playtime)\b',
    ]

    # NEW: COMPARISON indicators (before/after, EA vs release, time periods)
    comparison_patterns = [
        r'\b(early access|ea)\s*(vs?|versus|compared to|vs\.?)\s*(release|full|1\.0)\b',
        r'\b(release|full|1\.0)\s*(vs?|versus|compared to|vs\.?)\s*(early access|ea)\b',
        r'\b(compare|comparing|comparison)\s+.*(release|launch|patch|update)\b',
        r'\b(before|after)\s+(release|launch|patch|update|1\.0)\b',
        r'\b(pre.?release|post.?release|pre.?launch|post.?launch)\b',
        r'\b(difference|differences) between\b.*\b(early|release|patch)\b',
        r'\b(divide|split|break down|segment)\s+(reviews|data)\s+(into|in|by)\b',
        r'\b(first|last)\s+\d+\s+(days?|weeks?)\s+(vs?|versus|compared to)\s+(second|last|next)\b',
        r'\b(category|period|segment)\s+\d+.*category\s+\d+\b',
        r'\b(compare|comparison)\s+(first|last)\s+\d+',
    ]

    # NEW: RISK indicators (refund risk, churn, retention)
    risk_patterns = [
        r'\b(refund|refunds|refunded|refunding)\b',
        r'\b(churn|churning|retention|retain)\b',
        r'\b(risk|risky|at.?risk)\b',
        r'\b(disappointment|disappointed|regret)\b',
        r'\b(abandon|abandoned|quit|quitting|stopped playing)\b',
        r'\b(buyer.?s? remorse|money back)\b',
    ]

    # NEW: FEATURE_REQUESTS indicators (what players want)
    feature_request_patterns = [
        r'\b(feature|features)\s*(request|requests|requested|wanted|want)\b',
        r'\b(request|requests|requested|requesting)\s*(feature|features)?\b',
        r'\b(players?|users?|people)\s*(want|wish|hope|desire|ask for)\b',
        r'\b(most (requested|wanted|desired))\b',
        r'\b(wish(list|es)?|suggestions?)\b',
        r'\b(should (add|have|include)|need to add)\b',
        r'\b(missing (feature|functionality|content))\b',
    ]

    # AGGREGATION indicators (charts, stats, metrics)
    aggregation_patterns = [
        r'\b(chart|pie|bar|graph|plot|visualization|visualize)\b',
        r'\b(rate|percentage|percent|ratio|split|distribution)\b',
        r'\b(how many|count|total|number of)\b',
        r'\b(average|median|mean|aggregate)\b',
        r'\b(statistics|stats|metrics|analytics)\b',
        r'\b(breakdown|summary|overview)\b',
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

    # Count matches for each intent type
    def count_matches(patterns: List[str]) -> int:
        return sum(1 for pattern in patterns if re.search(pattern, normalized))

    language_matches = count_matches(language_patterns)
    trend_matches = count_matches(trend_patterns)
    segment_matches = count_matches(segment_patterns)
    comparison_matches = count_matches(comparison_patterns)
    risk_matches = count_matches(risk_patterns)
    feature_request_matches = count_matches(feature_request_patterns)
    aggregation_matches = count_matches(aggregation_patterns)
    examples_matches = count_matches(examples_patterns)
    has_mixed = any(re.search(pattern, normalized) for pattern in mixed_patterns)

    # Extract topic or entity
    search_term, is_entity = extract_topic_or_entity(message)

    # Decision logic - prioritize specific new intents first
    # LANGUAGE: Language-based queries have high priority when detected
    if language_matches >= 1:
        return (ChatIntent.LANGUAGE, search_term, is_entity)

    # TREND: Time-based queries have highest priority when detected
    if trend_matches >= 1:
        return (ChatIntent.TREND, search_term, is_entity)

    # SEGMENT: Playtime/experience-based queries
    if segment_matches >= 1:
        return (ChatIntent.SEGMENT, search_term, is_entity)

    # COMPARISON: Before/after, EA vs release comparisons
    if comparison_matches >= 1:
        return (ChatIntent.COMPARISON, search_term, is_entity)

    # RISK: Refund risk, churn analysis
    if risk_matches >= 1:
        return (ChatIntent.RISK, search_term, is_entity)

    # FEATURE_REQUESTS: What players want
    if feature_request_matches >= 1:
        return (ChatIntent.FEATURE_REQUESTS, search_term, is_entity)

    # Original logic for other intents
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
    return intent in (
        ChatIntent.AGGREGATION,
        ChatIntent.MIXED,
        ChatIntent.TREND,
        ChatIntent.SEGMENT,
        ChatIntent.COMPARISON,
        ChatIntent.RISK,
        ChatIntent.FEATURE_REQUESTS,
        ChatIntent.LANGUAGE,
    )


def should_load_full_insights(intent: ChatIntent) -> bool:
    """Determine if full insights data should be loaded for this intent.

    Args:
        intent: Classified intent

    Returns:
        True if full insights should be loaded (subcategory breakdown, etc.)
    """
    return intent in (
        ChatIntent.AGGREGATION,
        ChatIntent.MIXED,
        ChatIntent.TREND,
        ChatIntent.SEGMENT,
        ChatIntent.COMPARISON,
        ChatIntent.RISK,
        ChatIntent.FEATURE_REQUESTS,
        ChatIntent.LANGUAGE,
    )


def extract_time_comparison_params(message: str) -> Optional[Dict[str, int]]:
    """Extract time period comparison parameters from a message.

    Args:
        message: User's question

    Returns:
        Dict with keys days_ago_start, days_ago_end, num_periods, or None

    Examples:
        "divide last 30 days into 2 periods" → {"days_ago_start": 30, "days_ago_end": 0, "num_periods": 2}
        "first 15 days vs second 15 days of last 30 days" → {"days_ago_start": 30, "days_ago_end": 0, "num_periods": 2}
        "compare last 7 days to previous 7 days" → {"days_ago_start": 14, "days_ago_end": 0, "num_periods": 2}
    """
    normalized = message.lower()

    # Pattern 1: "divide/split last X days into Y periods"
    match = re.search(r'\b(?:last|past)\s+(\d+)\s+days?\s+(?:into|in)\s+(\d+)\s+(?:periods?|parts?|categories?|segments?)', normalized)
    if match:
        days = int(match.group(1))
        periods = int(match.group(2))
        return {"days_ago_start": days, "days_ago_end": 0, "num_periods": periods}

    # Pattern 2: "first X days vs second X days" (implies 2X total days)
    match = re.search(r'\bfirst\s+(\d+)\s+days?\s+(?:vs?|versus|compared to|category \d+).*(?:second|last)\s+(\d+)\s+days?', normalized)
    if match:
        days1 = int(match.group(1))
        days2 = int(match.group(2))
        total_days = days1 + days2
        return {"days_ago_start": total_days, "days_ago_end": 0, "num_periods": 2}

    # Pattern 3: "last X days vs previous X days"
    match = re.search(r'\blast\s+(\d+)\s+days?\s+(?:vs?|versus|compared to).*previous\s+(\d+)\s+days?', normalized)
    if match:
        days1 = int(match.group(1))
        days2 = int(match.group(2))
        total_days = days1 + days2
        return {"days_ago_start": total_days, "days_ago_end": 0, "num_periods": 2}

    # Pattern 4: "of last X days" with period splitting
    match = re.search(r'\b(?:of|in|within)\s+(?:the\s+)?last\s+(\d+)\s+days?', normalized)
    if match and re.search(r'\b(divide|split|category|period|segment)\b', normalized):
        days = int(match.group(1))
        # Look for number of periods
        period_match = re.search(r'\b(?:into|in)\s+(\d+)\s+(?:periods?|parts?|categories?|segments?)', normalized)
        if period_match:
            periods = int(period_match.group(1))
            return {"days_ago_start": days, "days_ago_end": 0, "num_periods": periods}
        # Default to 2 periods if not specified
        return {"days_ago_start": days, "days_ago_end": 0, "num_periods": 2}

    return None


def detect_sort_preference(message: str) -> Optional[str]:
    """Detect preferred sorting method for subcategory results.

    Args:
        message: User's question

    Returns:
        Sort preference string or None:
        - "issue_count": Sort by most issues (bugs, problems)
        - "request_count": Sort by most requests (features wanted)
        - "recommendation_rate_asc": Sort by lowest recommendation rate
        - "recommendation_rate_desc": Sort by highest recommendation rate
        - "count": Sort by total mentions
        - None: Use default sorting
    """
    normalized = message.lower()

    # Issue-focused queries: sort by issue_count
    issue_patterns = [
        r'\b(top|worst|main|biggest|most)\s*(issues?|bugs?|problems?|complaints?)\b',
        r'\b(issues?|bugs?|problems?)\s*(players?|users?)?\s*(are|is)?\s*(reporting|mentioning|having)\b',
        r'\b(what.*(broken|buggy|issues|problems))\b',
    ]
    for pattern in issue_patterns:
        if re.search(pattern, normalized):
            return "issue_count"

    # Request-focused queries: sort by request_count
    request_patterns = [
        r'\b(most|top)\s*(requested|wanted|desired)\b',
        r'\b(feature|features)\s*(request|requests|wanted)\b',
        r'\b(players?|users?)\s*(want|wish|ask|request)\b',
        r'\b(what.*(players?|users?)\s*want)\b',
    ]
    for pattern in request_patterns:
        if re.search(pattern, normalized):
            return "request_count"

    # Negative sentiment queries: sort by lowest recommendation rate
    negative_patterns = [
        r'\b(worst|lowest)\s*(rated|rated|recommendation|sentiment)\b',
        r'\b(driving|causing)\s*(negative|bad)\s*(reviews?|sentiment)\b',
        r'\b(why|what).*(negative|bad|poor)\s*(reviews?|sentiment|reception)\b',
        r'\b(unhappy|disappointed|frustrated)\b',
    ]
    for pattern in negative_patterns:
        if re.search(pattern, normalized):
            return "recommendation_rate_asc"

    # Positive queries: sort by highest recommendation rate
    positive_patterns = [
        r'\b(best|highest|top)\s*(rated|recommendation|sentiment)\b',
        r'\b(what.*(players?|users?)\s*love)\b',
        r'\b(positive|good|great)\s*(aspects?|things?|reviews?)\b',
    ]
    for pattern in positive_patterns:
        if re.search(pattern, normalized):
            return "recommendation_rate_desc"

    # Default: None (use count/mentions)
    return None


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


# Follow-up Detection for Conversation Memory

FOLLOW_UP_PATTERNS = [
    # Direct follow-ups
    r"^(and|also|what about|how about|tell me more)",
    r"^(why|how come|explain|elaborate)",
    r"^(compared to|versus|vs|vs\.)",
    r"^(the same for|same question for|same thing for)",
    r"^(more|show more|any more|see more)",
    r"^(details?|more details?|specifics?)",

    # Implicit follow-ups (assume context from previous turn)
    r"^(what else|anything else|other)",
    r"^(examples?|show me|give me)",
    r"^(positive ones?|negative ones?)",
    r"^(recent ones?|older ones?)",

    # References to previous content
    r"\b(those|these|that|this)\s+(issue|issues|problem|review|reviews|topic|category)\b",
    r"\b(the same|same thing)\b",
    r"\b(mentioned|said|showed|listed)\s+(earlier|before|above)\b",
]


def is_follow_up(message: str, turn_count: int = 0) -> bool:
    """Check if a message is a follow-up to a previous conversation turn.

    Args:
        message: The user's message
        turn_count: Number of previous turns in conversation (0 = first message)

    Returns:
        True if this appears to be a follow-up question

    Examples:
        "And what about performance?" → True
        "Tell me more" → True
        "What are the main issues?" → False (standalone question)
        "Show me examples of those" → True (references previous)
    """
    # First message can't be a follow-up
    if turn_count == 0:
        return False

    normalized = message.strip().lower()

    # Short messages without specific content are likely follow-ups
    if len(normalized.split()) <= 3 and not re.search(r'\b(what|how|why|when|where|who)\b.*\b(is|are|do|does|did)\b', normalized):
        return True

    # Check follow-up patterns
    for pattern in FOLLOW_UP_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE):
            return True

    return False


def resolve_follow_up_context(
    message: str,
    last_intent: Optional[str],
    last_subcategories: Optional[List[str]],
    accumulated_facts: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Resolve context for a follow-up question.

    Given a follow-up message and previous conversation context, determine
    what the user is likely asking about.

    Args:
        message: The user's follow-up message
        last_intent: Intent from previous turn
        last_subcategories: Subcategories discussed in previous turn
        accumulated_facts: Facts accumulated during conversation

    Returns:
        Dict with resolved context:
        - resolved_subcategories: List of subcategories to focus on
        - resolved_sentiment: "positive", "negative", or None
        - drill_down: True if user wants more detail on same topic
        - compare: True if user wants comparison

    Examples:
        message="Show me positive ones" + last_subcategories=["technical/bugs"]
        → {"resolved_subcategories": ["technical/bugs"], "resolved_sentiment": "positive"}

        message="And performance?" + last_intent="TOPIC_EXAMPLES"
        → {"resolved_subcategories": ["technical/performance"], "drill_down": False}
    """
    normalized = message.strip().lower()
    result: Dict[str, Any] = {
        "resolved_subcategories": [],
        "resolved_sentiment": None,
        "drill_down": False,
        "compare": False,
    }

    # Detect sentiment filter requests
    if re.search(r"\b(positive|good|happy)\s*(ones?|reviews?|examples?)?\b", normalized):
        result["resolved_sentiment"] = "positive"
    elif re.search(r"\b(negative|bad|unhappy|critical)\s*(ones?|reviews?|examples?)?\b", normalized):
        result["resolved_sentiment"] = "negative"

    # Detect drill-down requests
    if re.search(r"\b(more|details?|specifics?|elaborate|examples?|evidence|quotes?)\b", normalized):
        result["drill_down"] = True

    # Detect comparison requests
    if re.search(r"\b(compare|versus|vs\.?|compared to|difference)\b", normalized):
        result["compare"] = True

    # Check if user is asking about a new topic
    _, is_entity = extract_topic_or_entity(message)
    search_term, _ = extract_topic_or_entity(message)

    if search_term and not is_entity:
        # User mentioned a new topic - this overrides previous context
        # Try to map to a subcategory
        topic_mappings = {
            "performance": "technical/performance",
            "bugs": "technical/bugs",
            "crashes": "technical/stability_crashes",
            "ai": "gameplay/ai",
            "difficulty": "gameplay/difficulty",
            "controls": "gameplay/controls",
            "story": "content_design/narrative_characters",
            "price": "monetization_value/pricing",
            "dlc": "monetization_value/dlc",
        }
        if search_term.lower() in topic_mappings:
            result["resolved_subcategories"] = [topic_mappings[search_term.lower()]]
        else:
            # Use partial matching
            for key, subcat in topic_mappings.items():
                if key in search_term.lower() or search_term.lower() in key:
                    result["resolved_subcategories"] = [subcat]
                    break

    # If no new topic, use previous subcategories
    if not result["resolved_subcategories"] and last_subcategories:
        result["resolved_subcategories"] = list(last_subcategories)

    return result


def get_conversation_context_summary(
    turn_count: int,
    last_intent: Optional[str],
    last_subcategories: Optional[List[str]],
    accumulated_facts: Optional[Dict[str, Any]],
) -> str:
    """Generate a context summary for the LLM prompt.

    Args:
        turn_count: Number of turns in conversation
        last_intent: Last detected intent
        last_subcategories: Last discussed subcategories
        accumulated_facts: Accumulated facts

    Returns:
        String summary to include in LLM prompt
    """
    if turn_count == 0:
        return ""

    parts = []

    if last_subcategories:
        subcat_str = ", ".join(last_subcategories[:3])
        parts.append(f"Previously discussed: {subcat_str}")

    if last_intent:
        intent_descriptions = {
            "aggregation": "statistics/metrics",
            "topic_examples": "review examples",
            "trend": "time trends",
            "comparison": "comparisons",
            "feature_requests": "feature requests",
        }
        intent_desc = intent_descriptions.get(last_intent.lower(), last_intent)
        parts.append(f"Last query type: {intent_desc}")

    if accumulated_facts:
        # Include key facts (limit to 3)
        fact_items = list(accumulated_facts.items())[:3]
        facts_str = ", ".join(f"{k}: {v}" for k, v in fact_items)
        if facts_str:
            parts.append(f"Key facts: {facts_str}")

    if parts:
        return "Conversation context:\n- " + "\n- ".join(parts)

    return ""
