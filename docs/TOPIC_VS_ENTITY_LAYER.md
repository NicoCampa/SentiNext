# Topic vs Entity Routing Layer

## 🎯 Problem Solved

**Before:** Everything was treated as keyword search
- "show me reviews about bugs" → Search for word "bugs" ❌
- "what do people think of Sonic?" → Search for word "Sonic" ✓

**Issue:** You already have high-quality LLM classifications! Why search for "bugs" when you can filter by `technical/bugs` subcategory?

**After:** Smart routing based on semantic understanding
- "show me reviews about bugs" → Filter by `technical/bugs` label ✅
- "what do people think of Sonic?" → Search for word "Sonic" ✅

---

## 🧠 How It Works

### Three Types of Questions:

#### 1. **TOPIC_EXAMPLES** (Use LLM Subcategory Labels)
Questions about **categories already in your taxonomy**:
- "show me reviews about bugs" → `technical/bugs`
- "what do people say about AI?" → `ai` subcategory
- "find performance complaints" → `technical/performance`
- "reviews about gameplay" → `gameplay/*`

**Retrieval:** Query `review_labels` table for reviews with matching subcategory

#### 2. **ENTITY_EXAMPLES** (Use Keyword Search)
Questions about **specific names/characters/items not in taxonomy**:
- "what do people think of Sonic?" → FTS for "Sonic"
- "reviews mentioning Super Mario" → FTS for "Super Mario"
- "find Keanu Reeves mentions" → FTS for "Keanu Reeves"
- "talk about Geralt" → FTS for "Geralt"

**Retrieval:** Full-text search in review text

#### 3. **AGGREGATION** (Use SQL - already implemented)
Statistical questions:
- "what percentage mention bugs?" → SQL aggregation (can use topic filter)
- "how many reviews talk about Sonic?" → SQL aggregation (can use entity filter)

---

## 📊 Detection Logic

### Step 1: Extract the Search Term

```python
extract_topic_or_entity(message) → (term, is_entity)
```

**Examples:**
- `'show me reviews about bugs'` → `("bugs", False)` ← topic
- `'what do people think of "Sonic"?'` → `("Sonic", True)` ← entity (quoted)
- `'reviews mentioning Super Mario'` → `("Super Mario", True)` ← entity (capitalized)
- `'what about AI?'` → `("ai", False)` ← topic (known category)

### Step 2: Classification Rules

1. **Quoted terms** → Entity
   - `"Sonic"`, `'Super Mario'` → entities

2. **Capitalized proper nouns** → Entity
   - `Sonic`, `Mario`, `Geralt`, `Keanu Reeves` → entities

3. **Known taxonomy topics** → Topic
   - Lowercase: `bugs`, `performance`, `gameplay`
   - Acronyms: `AI`, `UI`, `UX`
   - Multi-word: `level design`, `quality of life`

4. **Intent + Term** → Route
   - Examples + Topic → `TOPIC_EXAMPLES`
   - Examples + Entity → `ENTITY_EXAMPLES`
   - Aggregation + (any) → `AGGREGATION`

---

## 🗄️ SQL Queries

### Topic-Based Retrieval (NEW!)

```sql
-- "show me reviews about bugs"
SELECT DISTINCT r.data
FROM reviews r
JOIN review_labels rl ON r.review_id = rl.review_id AND r.app_id = rl.app_id
WHERE r.app_id = 1091500
  AND r.timestamp_created > (NOW() - INTERVAL '30 days')
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(rl.payload->'subcategories') AS subcat
      WHERE LOWER(subcat) LIKE '%bugs%'
  )
ORDER BY (r.data->>'votes_up')::int DESC
LIMIT 50
```

**Benefits:**
- ✅ Only reviews **actually classified as bugs** by LLM
- ✅ High precision (no false positives from "bugs" appearing randomly)
- ✅ Uses your expensive LLM labels efficiently

### Entity-Based Retrieval (Existing FTS)

```sql
-- "what do people think of Sonic?"
SELECT data
FROM reviews
WHERE app_id = 1091500
  AND search_vector @@ to_tsquery('english', 'Sonic')
ORDER BY (data->>'votes_up')::int DESC
LIMIT 50
```

**Benefits:**
- ✅ Finds reviews mentioning specific entities
- ✅ Works for names/characters not in taxonomy
- ✅ Broadest coverage

---

## 🎨 Known Topics List

Topics are things **already in your LLM taxonomy**:

### Technical
- `bug`, `bugs`, `crash`, `crashes`, `performance`, `fps`, `optimization`
- `glitch`, `lag`, `networking`, `multiplayer`, `server`, `loading`

### Gameplay
- `gameplay`, `mechanics`, `controls`, `difficulty`, `balance`, `combat`, `progression`

### Content/Design
- `story`, `narrative`, `plot`, `writing`, `character`, `characters`
- `level design`, `map`, `quest`, `mission`, `replayability`, `content`

### UI/UX
- `ui`, `ux`, `interface`, `menu`, `hud`, `accessibility`, `quality of life`, `qol`

### Monetization
- `price`, `dlc`, `microtransactions`, `mtx`, `pay to win`, `p2w`, `value`

### General
- `issue`, `problem`, `complaint`, `request`, `feature`, `improvement`
- `ai`, `graphics`, `audio`, `sound`, `music`, `voice acting`

**You can extend this list** to match your specific taxonomy!

---

## 📝 Example Conversations

### Example 1: Topic Question

**User:** "show me reviews about bugs"

**System:**
1. Classify: `TOPIC_EXAMPLES`
2. Extract: `("bugs", False)` ← topic
3. Query: `get_reviews_by_subcategory(app_id, "bugs")`
4. SQL: Filter by `technical/bugs` label
5. Result: 23 reviews actually classified as bug-related

**Response:**
> "Here are 23 reviews mentioning bugs, based on our classification:
>
> [Review #123] 'Game crashes on startup...'
> [Review #456] 'Too many glitches in multiplayer...'
> ..."

---

### Example 2: Entity Question

**User:** 'what do people think of "Sonic" character?'

**System:**
1. Classify: `ENTITY_EXAMPLES`
2. Extract: `("Sonic", True)` ← entity (quoted)
3. Query: `search_reviews_with_date_filter(query="Sonic")`
4. FTS: Search for keyword "Sonic"
5. Result: 12 reviews mentioning Sonic

**Response:**
> "Found 12 reviews mentioning Sonic:
>
> [Review #789] 'Sonic's design is amazing...'
> [Review #234] 'Loved seeing Sonic in this game...'
> ..."

---

### Example 3: Mixed Analytical

**User:** "what percentage of reviews mention bugs? show examples"

**System:**
1. Classify: `MIXED`
2. Extract: `("bugs", False)` ← topic
3. SQL: Count reviews with `technical/bugs` label
4. Sample: Get 5 representative bug reviews
5. Result: 342/1000 (34.2%) + 5 examples

**Response:**
> "34.2% of reviews (342 out of 1000) mention bugs. Here are some examples:
>
> [Review #111] 'Constant crashes...'
> [Review #222] 'Game-breaking bug in chapter 5...'
> ..."

---

## 🔧 Code Changes Summary

### 1. **intent.py** (NEW)
- `classify_intent()` → Returns `(intent, search_term, is_entity)`
- `extract_topic_or_entity()` → Extracts term and detects type
- `is_likely_entity()` → Checks if capitalized/quoted
- `KNOWN_TOPICS` → List of taxonomy categories

### 2. **storage.py** (ADDED)
- `get_reviews_by_subcategory()` → SQL join with review_labels
  - Filters by subcategory in JSONB payload
  - Supports partial matching ("bugs" → "technical/bugs")
  - Date filtering + helpful ordering

### 3. **chat.py** (MODIFIED)
- Updated routing logic:
  - `TOPIC_EXAMPLES` → Call `get_reviews_by_subcategory()`
  - `ENTITY_EXAMPLES` → Call `search_reviews_with_date_filter()`
  - `AGGREGATION` → Call `get_recommendation_split()` (existing)

---

## 🎯 Benefits

### 1. **Higher Precision**
- Topic questions use LLM labels (already classified!)
- No false positives from word appearing randomly

### 2. **Better UX**
- Users can ask naturally: "show me bug reports"
- System understands intent, not just keywords

### 3. **Efficient Use of LLM Labels**
- You paid for those classifications - use them!
- Filter by semantic category, not text search

### 4. **Flexible Entity Search**
- Still works for characters, names, items
- Anything not in taxonomy → keyword search

---

## 🧪 Test Cases

### Topics (Use LLM Labels)
✅ "show me reviews about bugs" → `technical/bugs`
✅ "what do people say about AI?" → `ai` subcategory
✅ "find performance issues" → `technical/performance`
✅ "gameplay complaints" → `gameplay/*`
✅ "reviews about crashes" → `technical/stability_crashes`

### Entities (Use Keyword Search)
✅ 'what do people think of "Sonic"?' → FTS "Sonic"
✅ "reviews mentioning Super Mario" → FTS "Super Mario"
✅ "find Keanu Reeves" → FTS "Keanu Reeves"
✅ "talk about Geralt" → FTS "Geralt"

### Aggregation
✅ "what percentage mention bugs?" → SQL + topic filter
✅ "how many reviews talk about Sonic?" → SQL + entity filter
✅ "create a pie chart of recommendation rates" → SQL (no filter)

---

## 🚀 Usage Examples

### Backend Code

```python
# Example 1: Topic-based retrieval
reviews = storage.get_reviews_by_subcategory(
    app_id=1091500,
    subcategory="bugs",
    date_filter="30d",
    limit=20
)
# Returns reviews labeled with technical/bugs from last 30 days

# Example 2: Entity-based retrieval
reviews = storage.search_reviews_with_date_filter(
    app_id=1091500,
    query="Sonic",
    date_filter="30d",
    limit=20
)
# Returns reviews containing the word "Sonic"
```

### User Questions → Routing

```python
from senti_next.intent import classify_intent

# Topic
intent, term, is_entity = classify_intent("show me reviews about bugs")
# → (TOPIC_EXAMPLES, "bugs", False)

# Entity
intent, term, is_entity = classify_intent("what do people think of Sonic?")
# → (ENTITY_EXAMPLES, "Sonic", True)

# Aggregation
intent, term, is_entity = classify_intent("what percentage mention bugs?")
# → (AGGREGATION, "bugs", False)
```

---

## 📈 Performance Impact

### Topic-Based Retrieval
- **Query complexity:** JOIN + JSONB filtering
- **Performance:** Fast with proper indexes
- **Accuracy:** ⭐⭐⭐⭐⭐ (uses LLM labels)
- **Coverage:** Only classified reviews

### Entity-Based Retrieval
- **Query complexity:** FTS with GIN index
- **Performance:** Very fast
- **Accuracy:** ⭐⭐⭐ (depends on keyword)
- **Coverage:** All reviews (if they mention the entity)

---

## 🎓 Recommended Index

Add this index for optimal topic-based retrieval:

```sql
-- Index for subcategory filtering in review_labels
CREATE INDEX idx_review_labels_subcategories
ON review_labels USING GIN ((payload->'subcategories'));

-- Composite index for joins
CREATE INDEX idx_review_labels_app_review
ON review_labels(app_id, review_id);
```

---

## 🔮 Future Enhancements

1. **Fuzzy Topic Matching**
   - "show me bug reports" → match "bugs", "crash", "glitch"
   - Use embeddings for semantic similarity

2. **Multi-Topic Queries**
   - "show reviews about bugs AND performance"
   - Combine multiple subcategory filters

3. **Entity Recognition**
   - Use NER to auto-detect entities in questions
   - More robust than capitalization heuristics

4. **Smart Fallbacks**
   - If topic search returns 0 results → try entity search
   - If entity search returns 0 results → suggest similar topics

---

## ✅ Summary

This layer adds **semantic understanding** to your chat:

1. **Topics** → Use your LLM labels (high precision)
2. **Entities** → Use keyword search (broad coverage)
3. **Analytics** → Use SQL aggregation (accurate stats)

**Result:** Users get more relevant results, and you leverage your expensive LLM classifications efficiently!
