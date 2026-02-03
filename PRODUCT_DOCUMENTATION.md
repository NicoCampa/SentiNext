# SentiNext - Product Documentation

**Version:** 1.0
**Last Updated:** February 2026
**Document Type:** Comprehensive Product & Technical Specification

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Overview](#product-overview)
3. [How It Works](#how-it-works)
4. [Core Features](#core-features)
5. [Technical Architecture](#technical-architecture)
6. [Pricing & Monetization](#pricing--monetization)
7. [Target Customers](#target-customers)
8. [User Workflows](#user-workflows)
9. [Analytics & Insights](#analytics--insights)
10. [Competitive Advantages](#competitive-advantages)
11. [Development Pipeline](#development-pipeline)
12. [Business Model](#business-model)
13. [Technical Specifications](#technical-specifications)

---

## Executive Summary

**SentiNext** is an AI-powered sentiment analysis platform designed specifically for Steam game developers and publishers. It transforms raw player review data into actionable business intelligence by automatically classifying, categorizing, and analyzing tens of thousands of reviews using Large Language Models (LLMs).

### Key Value Proposition
- **Automate** the manual process of reading thousands of reviews
- **Identify** top player issues and feature requests with statistical significance
- **Track** sentiment trends over time to measure update impact
- **Compare** your game's reception against competitors
- **Chat** with your review data using natural language queries

### Market Position
SentiNext sits at the intersection of game analytics, customer feedback management, and AI-powered insights. It's specifically tailored for the Steam ecosystem, leveraging Steam's review infrastructure to provide developers with unprecedented visibility into player sentiment.

---

## Product Overview

### What Problem Does It Solve?

**The Manual Review Analysis Problem:**
- Large games receive 10,000+ reviews, making manual analysis impossible
- Critical issues get buried under positive/negative ratio
- No way to track sentiment evolution after updates
- Feature requests scattered across thousands of reviews
- Competing priorities unclear without quantitative data

**SentiNext's Solution:**
Automatically processes every review using Google Gemini LLM to:
1. Extract specific issues and feature requests
2. Categorize feedback into 30+ subcategories
3. Aggregate patterns across thousands of reviews
4. Surface actionable insights with statistical backing
5. Enable natural language queries about player sentiment

### Core Use Cases

1. **Post-Launch Monitoring**
   - Track initial player reception
   - Identify game-breaking bugs immediately
   - Prioritize patch development based on complaint frequency

2. **Update Impact Analysis**
   - Compare sentiment before/after major patches
   - Validate whether fixes resolved player concerns
   - Measure community response to new features

3. **Competitive Intelligence**
   - Compare your game's issues vs. similar titles
   - Benchmark sentiment scores against genre leaders
   - Identify feature gaps competitors have filled

4. **Product Roadmap Planning**
   - Quantify feature request demand
   - Identify most impactful improvements
   - Balance player desires with development capacity

5. **Community Management**
   - Understand player segment preferences (newcomers vs. veterans)
   - Detect emerging issues before they explode
   - Generate data-driven responses to criticism

---

## How It Works

### End-to-End Data Flow

```
Steam API → Review Ingestion → LLM Classification → Storage → Analytics → Insights
```

#### Step 1: Review Ingestion
**Input:** Steam App ID
**Process:**
- Fetches reviews via Steam Web API (`/appreviews` endpoint)
- Supports pagination for games with 100,000+ reviews
- Retrieves metadata: playtime, recommendation, helpfulness votes, language
- Stores raw review text and author info in PostgreSQL

**Configuration:**
- User selects review count: 100, 500, 1000, 2500, 5000, or "All"
- Date filtering: Last 30/90/365 days or all-time
- Language filtering available

#### Step 2: LLM Classification
**Engine:** Google Gemini (configurable: Flash Lite, Flash, Pro)
**Process:**
- Reviews batched in groups of 3 for API efficiency
- Each batch analyzed against comprehensive taxonomy
- LLM extracts:
  - Main categories (gameplay, technical, content, etc.)
  - Subcategories (e.g., "technical/performance", "gameplay/balance")
  - Issues vs. Praise distinction
  - Feature requests
  - Evidence quotes (verbatim text supporting classification)

**Quality Control:**
- Taxonomy validation ensures only predefined categories
- Evidence extraction provides audit trail
- Prompt versioning allows reanalysis when taxonomy evolves
- Results cached to avoid redundant LLM calls

**Cost Management:**
- Credit system tracks LLM usage
- Estimates shown before analysis
- Batch processing optimizes API calls
- Tool result caching reduces repeated calls

#### Step 3: Storage & Indexing
**Database:** PostgreSQL
**Schema:**
- `reviews` - Raw review data with Steam metadata
- `review_labels` - LLM classification results with evidence
- `starred_games` - User's analyzed game library
- `analysis_results` - Pre-computed insights for fast retrieval
- `progress` - Real-time analysis status tracking

**Indexing:**
- Full-text search on review content (PostgreSQL FTS)
- B-tree indexes on app_id, timestamp, votes_up
- Subcategory filtering optimized

#### Step 4: Analytics Engine
**Real-time Computation:**
- Recommendation rate by category/subcategory
- Issue frequency ranking
- Feature request prioritization
- Player segment analysis (newcomers vs. veterans based on playtime)
- Sentiment trend calculation (weekly buckets)

**Filtering:**
- Global filters apply across all views
- Date range filtering
- Sentiment (positive/negative only)
- Language filtering
- Player segment filtering

#### Step 5: Insight Presentation
**Dashboards:**
- Overview metrics (total reviews, recommendation %, top categories)
- Category breakdown with recommendation rates
- Top Issues list with count + evidence snippets
- Top Requests with community demand metrics
- Player segment analysis

**Interactive Exploration:**
- Drill into subcategories for detailed stats
- View sample reviews for any category
- Export filtered review sets to CSV
- Generate executive summary PDFs

**AI Chat Interface:**
- Natural language queries about review data
- Tool-calling agent retrieves relevant reviews
- Answers backed by actual review quotes
- Follow-up question suggestions
- Transparency via source review widget

---

## Core Features

### 1. Game Analysis Dashboard

**Purpose:** Primary workspace for analyzing a single game's reviews

**Components:**
- **Search Bar:** Find games via Steam API, supports name + App ID
- **Review Count Selector:** 100 to "All reviews" with credit estimates
- **Analysis Trigger:** One-click analysis with progress tracking
- **Metrics Overview:**
  - Total reviews analyzed
  - Overall recommendation rate
  - LLM coverage percentage
  - Risk indicators (refund risk, core fan disappointment)

**Advanced Filtering:**
- Date range: Last 30/90/365 days or all-time
- Sentiment: Positive/negative/all
- Language: Filter to specific languages
- Player segments: Newcomers (0-5h), Casual (5-20h), Experienced (20-100h), Veterans (100h+)

**Visualizations:**
- Category recommendation rate breakdown
- Issue frequency distribution
- Request demand metrics
- Sentiment trend over time (weekly buckets)

**Actions:**
- Star/unstar games to build library
- Export reviews to CSV
- Generate PDF reports
- Share insights (future feature)

### 2. Review Database Explorer

**Purpose:** Full-text search and exploration of all analyzed reviews

**Features:**
- **Multi-Game View:** Browse reviews across all starred games
- **Advanced Filtering:**
  - Keyword search with PostgreSQL full-text search
  - Subcategory filtering (e.g., show only "technical/bugs")
  - Sentiment filtering
  - Date range
  - Helpfulness threshold (min votes_up)
  - Playtime buckets
  - Language
  - Has issue/request flags

- **Sorting:**
  - By helpfulness (votes_up)
  - By date (newest/oldest)
  - By playtime

- **Review Cards:**
  - Full review text
  - Recommendation (thumbs up/down)
  - Playtime hours
  - Helpfulness votes
  - Classified categories
  - Evidence quotes extracted by LLM

- **Bulk Export:**
  - CSV export with filters applied
  - Admin: JSON export for data science
  - Preview before download

**Use Cases:**
- Find all mentions of specific features (e.g., "multiplayer")
- Research what veterans say about endgame
- Identify common complaints in negative reviews
- Audit LLM classification quality

### 3. Game Comparison Tool

**Purpose:** Side-by-side analysis of 2 games

**Comparison Metrics:**
- Overall recommendation rates
- Category-by-category breakdown
- Subcategory performance (top issues/requests)
- Player segment preferences

**AI-Powered Comparison:**
- Click "AI Comparison" for natural language summary
- LLM analyzes up to 30 reviews per game
- Identifies key differences in reception
- Highlights competitive advantages/disadvantages
- Costs 2 credits per comparison

**Visualizations:**
- Side-by-side metric cards
- Category grids showing winner/loser per category
- Subcategory drill-downs with sample reviews

**Use Cases:**
- Benchmark against direct competitors
- Understand why Competitor X has higher rating
- Identify feature gaps in your game
- Validate design decisions based on similar titles

### 4. AI Chat Interface

**Purpose:** Natural language Q&A about review data

**Capabilities:**
- **Agentic Tool-Calling:**
  - LLM autonomously selects appropriate tools
  - Retrieves statistics, reviews, trends
  - Combines multiple data sources
  - Up to 5 tool iterations per query

- **Available Tools:**
  - `get_game_overview` - Overall stats
  - `get_top_issues` - Most complained-about problems
  - `get_feature_requests` - Most requested features
  - `search_reviews` - Find reviews by keyword/subcategory (up to 100)
  - `get_subcategory_stats` - Detailed metrics for specific category
  - `compare_games` - Metric comparison between 2 games
  - `get_sentiment_trend` - Sentiment over time
  - `compare_time_windows` - Before/after update analysis

- **Response Features:**
  - Markdown formatting
  - Chart.js visualizations (pie, bar, line charts)
  - Citation system (links to specific reviews)
  - Source review widget (shows all 100 reviews used in context)
  - Suggested follow-up questions
  - Conversation history (last 20 messages)

- **Example Queries:**
  - "What are the top 3 technical issues?"
  - "Show me what players say about multiplayer"
  - "How has sentiment changed in the last 30 days?"
  - "Compare performance complaints between Game A and Game B"
  - "What do veterans complain about most?"

**Transparency:**
- Every response shows source citations
- Expandable widget displays all 100+ reviews used
- Reviews ordered by helpfulness (votes_up)
- Clear indication when data is limited

**Cost:** 3 credits per message

### 5. Executive Summary Reports

**Purpose:** Generate professional PDF reports for stakeholders

**Report Scope:**
- Single game, single month
- Uses existing analyzed data (no additional LLM costs)

**Report Contents (6 pages):**
1. **Cover & Overview**
   - Game title, report period
   - Key metrics summary (total reviews, rec rate, avg sentiment, median playtime)

2. **Sentiment Analysis**
   - Positive/negative share
   - Risk metrics (refund risk, core fan disappointment)
   - Weekly recommendation rate trends

3. **Top Issues**
   - Top 5 issues by frequency
   - Recommendation rate per issue
   - Evidence snippets (2 quotes per issue)

4. **Top Feature Requests**
   - Top 5 requests
   - Community demand metrics
   - Evidence snippets

5. **Player Segments**
   - Newcomers/Casual/Experienced/Veterans breakdown
   - Recommendation rate by segment
   - Top issue per segment

6. **Executive Recommendations**
   - Auto-generated takeaways
   - Highest priority issue
   - Most requested feature
   - At-risk player segment
   - Positive highlight

**Generation:**
- Select game from starred library
- Choose month from available data
- Preview stats before download
- One-click PDF generation
- Filename: `ExecutiveSummary_GameName_MonthYear.pdf`

**Styling:**
- Dark theme matching UI
- Professional tables with borders
- Color-coded sentiment indicators
- Branded with SentiNext footer

**Use Cases:**
- Monthly stakeholder reports
- Post-mortem analysis
- Investor/publisher updates
- Team alignment documentation

### 6. Admin Panel

**Purpose:** Platform management and analytics (admin users only)

**Features:**
- **User Management:**
  - View all registered users
  - Check credit balances
  - Manually adjust credits
  - Monitor usage patterns

- **System Monitoring:**
  - Total reviews in database
  - Total classifications performed
  - LLM API usage stats
  - Database size metrics

- **Data Management:**
  - Bulk operations on reviews
  - Reanalyze with updated taxonomy
  - Database maintenance tools

- **Billing Integration:**
  - Stripe subscription management
  - Payment history
  - Failed payment alerts

**Access Control:**
- Requires `SENTINEXT_ADMIN_USER_IDS` environment variable
- Or valid `SENTINEXT_ADMIN_TOKEN`

---

## Technical Architecture

### Deployment Modes

SentiNext supports 3 deployment configurations:

#### 1. Local Desktop App (Primary)
**Target:** Indie developers, small teams
**Stack:**
- **Backend:** FastAPI bundled with PyInstaller
- **Frontend:** Next.js static export (HTML/CSS/JS)
- **Wrapper:** Tauri (Rust-based Electron alternative)
- **Database:** Bundled PostgreSQL instance

**Characteristics:**
- Single executable, no cloud dependencies
- Data stored locally, full privacy
- No authentication required (`user_id="local"`)
- Auto-starts backend on launch
- System tray integration

**Build Process:**
```bash
cd frontend && SENTINEXT_STATIC_EXPORT=true npm run build
cd ../desktop && ./build.sh  # Creates .app/.exe
```

#### 2. Local Web (Development)
**Target:** Development and testing
**Stack:**
- Backend: `uvicorn backend.local_app:app --reload --port 8000`
- Frontend: Served as static files from `frontend/out/`
- Single server at `http://localhost:8000`

**Characteristics:**
- Hot reload for backend changes
- Frontend must be rebuilt for changes
- Same features as desktop app
- Faster iteration than full desktop builds

#### 3. Cloud/SaaS Deployment
**Target:** Enterprise customers, SaaS offering
**Stack:**
- **Backend:** FastAPI on cloud server (AWS/GCP/Azure)
- **Frontend:** Next.js server (separate domain)
- **Database:** Managed PostgreSQL (RDS/Cloud SQL)
- **Authentication:** Clerk.dev integration
- **Storage:** User data isolated by `user_id`

**Characteristics:**
- Multi-tenant architecture
- Clerk JWT validation
- License key verification
- Subscription management via Stripe
- Admin panel for operations

**Environment:**
```bash
SENTINEXT_AUTH_ENABLED=1
SENTINEXT_CLERK_JWKS_URL=https://...
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=sk_live_...
```

### Backend Architecture

**Framework:** FastAPI (Python 3.10+)
**API Endpoints:** ~50 RESTful endpoints

**Core Modules:**

1. **main.py** (~2000 lines)
   - API route definitions
   - Request validation (Pydantic models)
   - Authentication middleware
   - Credit checking decorators
   - Error handling

2. **storage.py** (~2500 lines)
   - PostgreSQL connection pooling
   - CRUD operations for all entities
   - Full-text search implementation
   - Query optimization
   - Data aggregation functions

3. **llm.py** (~1500 lines)
   - Google Gemini API integration
   - Batch processing (3 reviews per call)
   - Retry logic with exponential backoff
   - Error classification (rate limits, timeouts)
   - Response parsing and validation
   - Tool-calling support for chat agent

4. **chat_agent.py** (~840 lines)
   - Agentic chat loop (max 5 iterations)
   - Tool selection and execution
   - Session context management
   - Follow-up question generation
   - Graceful degradation on errors

5. **chat_tools.py** (~2600 lines)
   - 14 tool implementations
   - Result caching to reduce LLM calls
   - Subcategory disambiguation
   - Evidence extraction
   - Pagination support

6. **insights.py** (~800 lines)
   - Metric calculations
   - Player segment analysis
   - Risk score computation
   - Trend analysis

7. **reports.py** (~600 lines)
   - PDF generation with ReportLab
   - Month filtering
   - Template rendering
   - Chart creation

8. **steam_api.py** (~400 lines)
   - Steam Web API wrapper
   - Review fetching with pagination
   - Game metadata retrieval
   - Rate limiting compliance

**Database Schema:**

```sql
-- Core tables
reviews (
  review_id BIGINT PRIMARY KEY,
  app_id INT,
  author_steamid VARCHAR(255),
  review TEXT,
  voted_up BOOLEAN,
  votes_up INT,
  timestamp_created BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  playtime_forever INT,
  language VARCHAR(50),
  search_vector TSVECTOR  -- Full-text search
)

review_labels (
  id SERIAL PRIMARY KEY,
  review_id BIGINT REFERENCES reviews,
  app_id INT,
  user_id VARCHAR(255),
  prompt_version VARCHAR(50),
  llm_categories TEXT[],
  llm_subcategories TEXT[],
  llm_issue_subcategories TEXT[],
  llm_request_subcategories TEXT[],
  llm_has_issue BOOLEAN,
  llm_has_request BOOLEAN,
  evidence JSONB,  -- Extracted quotes
  created_at TIMESTAMP DEFAULT NOW()
)

starred_games (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  app_id INT,
  game_name TEXT,
  metadata JSONB,  -- Steam metadata
  sample JSONB,  -- Cached review subset
  starred_at TIMESTAMP DEFAULT NOW()
)

analysis_results (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  app_id INT,
  insights JSONB,  -- Pre-computed metrics
  created_at TIMESTAMP DEFAULT NOW()
)

progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  app_id INT,
  total INT,
  classified INT,
  status VARCHAR(50),  -- "in_progress", "completed"
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Credits system
user_credits (
  user_id VARCHAR(255) PRIMARY KEY,
  balance INT DEFAULT 0,
  tier VARCHAR(50),
  stripe_customer_id VARCHAR(255),
  subscription_id VARCHAR(255),
  subscription_status VARCHAR(50)
)

credit_transactions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  amount INT,  -- Negative for deductions
  operation VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
)
```

**Performance Optimizations:**
- Connection pooling (SQLAlchemy engine)
- Prepared statements
- Index usage for common queries
- JSONB for flexible metadata storage
- Background job processing for analysis
- Result caching in analysis_results table

### Frontend Architecture

**Framework:** Next.js 14 (App Router)
**Language:** TypeScript
**Styling:** Tailwind CSS

**Directory Structure:**
```
src/
├── app/                    # Pages (Next.js App Router)
│   ├── dashboard/         # Main analysis dashboard
│   ├── chat/              # AI chat interface
│   ├── compare/           # Game comparison
│   ├── database/          # Review explorer
│   ├── reports/           # PDF report generation
│   ├── settings/          # User settings
│   └── admin/             # Admin panel
├── components/            # React components
│   ├── ui/               # Reusable UI primitives
│   ├── chat/             # Chat-specific components
│   ├── compare/          # Comparison components
│   ├── database/         # Database explorer components
│   └── reports/          # Report components
├── contexts/             # React Context providers
│   ├── AnalysisContext   # Analysis state management
│   ├── GameContext       # Selected game state
│   ├── GlobalFiltersContext  # Cross-page filters
│   ├── CreditsContext    # Credit balance
│   ├── LanguageContext   # i18n
│   └── UiPreferencesContext  # Theme, settings
├── lib/                  # Utilities
│   ├── api.ts           # Backend API client
│   ├── reviewFilters.ts # Filter logic
│   ├── derivedInsights.ts  # Client-side calculations
│   └── taxonomyLabels.ts   # Category display names
└── types.ts             # TypeScript interfaces
```

**State Management:**
- React Context for global state (no Redux/Zustand)
- `useState` + `useEffect` for component-local state
- Context providers:
  - Analysis: Tracks current analysis progress
  - Game: Selected game across pages
  - Filters: Global date/sentiment/language filters
  - Credits: User credit balance
  - Language: i18n locale
  - UI Preferences: Theme, compact mode

**API Client Pattern:**
```typescript
// lib/api.ts
export async function authFetch(url: string, options?: RequestInit) {
  // Inject Clerk auth token if enabled
  // Handle errors uniformly
  // Parse JSON responses
}

export async function analyzeGame(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await authFetch(apiUrl('/analyze'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}
```

**Component Patterns:**
- Functional components with hooks
- TypeScript interfaces for props
- Tailwind for styling (no CSS modules)
- Chart.js for visualizations
- ReactMarkdown for chat responses
- Headless UI for accessible components

**Build Modes:**
1. **Development:** `npm run dev` (Next.js dev server)
2. **Static Export:** `SENTINEXT_STATIC_EXPORT=true npm run build` (for desktop)
3. **Production:** `npm run build && npm start` (for cloud deployment)

### LLM Integration

**Provider:** Google Gemini API
**Models:**
- `gemini-flash-lite-latest` (default, cost-optimized)
- `gemini-flash-latest` (balanced)
- `gemini-pro-latest` (highest quality)

**Taxonomy Structure:**

```
Main Categories (10):
├── gameplay
│   ├── mechanics
│   ├── difficulty
│   ├── balance
│   ├── progression
│   ├── controls
│   └── ai
├── technical
│   ├── performance
│   ├── bugs
│   ├── crashes
│   ├── networking
│   └── optimization
├── content_design
│   ├── level_design
│   ├── narrative
│   ├── replayability
│   ├── variety
│   └── pacing
├── ui_ux_accessibility
│   ├── menus
│   ├── quality_of_life
│   ├── accessibility
│   └── customization
├── presentation
│   ├── graphics
│   ├── audio
│   └── art_style
├── online_community
│   ├── multiplayer
│   ├── matchmaking
│   ├── community
│   └── social_features
├── monetization_value
│   ├── price
│   ├── dlc
│   ├── microtransactions
│   └── pay_to_win_grind
├── developer_updates
│   ├── patches
│   ├── communication
│   └── support
├── onboarding
│   ├── tutorial
│   └── learning_curve
└── other
    └── general
```

**Prompt Engineering:**
- System prompt defines taxonomy and output format
- Few-shot examples for edge cases
- JSON schema validation
- Evidence extraction instructions
- Batch processing format (3 reviews per prompt)

**Response Parsing:**
```json
{
  "reviews": [
    {
      "review_index": 0,
      "categories": ["gameplay", "technical"],
      "subcategories": ["gameplay/balance", "technical/performance"],
      "has_issue": true,
      "has_request": false,
      "issue_subcategories": ["technical/performance"],
      "request_subcategories": [],
      "evidence": {
        "technical/performance": "The game runs at 20 FPS on my RTX 3080"
      }
    }
  ]
}
```

**Quality Assurance:**
- Validate all categories against allowed list
- Reject responses with hallucinated categories
- Retry on parse errors (max 3 attempts)
- Store prompt version for reanalysis capability
- Cache results to avoid redundant calls

---

## Pricing & Monetization

### Credit System

**Unit:** 1 Credit = 1 LLM API call (approximately)

**Credit Costs:**
| Operation | Credits | Notes |
|-----------|---------|-------|
| Classify 3 reviews | 1 | Batch processing |
| Chat message | 3 | Includes tool calls + response generation |
| AI comparison (2 games) | 2 | Analyzes 30 reviews total |
| PDF report generation | 0 | Uses cached data, no LLM calls |

**Estimation:**
- Analyzing 1,000 reviews ≈ 334 credits
- Analyzing 10,000 reviews ≈ 3,334 credits
- 30-minute chat session (~20 messages) ≈ 60 credits

### Subscription Tiers

#### Free Tier
**Price:** $0/month
**Credits:** 100 credits/month
**Use Case:** Trial, small indie developers
**Limits:**
- Analyze ~300 reviews/month
- 30-40 chat messages
- 3 games max in library
- Basic features only

#### Starter Tier
**Price:** $29/month
**Credits:** 1,000 credits/month
**Use Case:** Indie developers with 1-2 games
**Includes:**
- Analyze ~3,000 reviews/month
- 300+ chat messages
- 10 games in library
- PDF reports
- Email support

#### Professional Tier
**Price:** $99/month
**Credits:** 5,000 credits/month
**Use Case:** Small studios, multiple titles
**Includes:**
- Analyze ~15,000 reviews/month
- 1,600+ chat messages
- Unlimited games
- Priority support
- API access (future)
- Custom reports

#### Enterprise Tier
**Price:** Custom
**Credits:** Custom pool
**Use Case:** Publishers, large studios
**Includes:**
- Dedicated instance
- White-label options
- SSO integration
- SLA guarantees
- Premium support
- Custom taxonomy
- Bulk operations

### Revenue Model

**Primary Revenue:** Monthly recurring subscriptions

**Secondary Revenue:**
- One-time credit packs (e.g., 1,000 credits for $25)
- Annual subscriptions (20% discount)
- Enterprise contracts

**Conversion Funnel:**
1. Free tier onboarding (100 credits)
2. Email nurture (analysis insights, tips)
3. Usage alerts ("80% credits used")
4. Upgrade prompts at credit exhaustion
5. Feature gating (comparison, advanced filters)

**Retention Strategy:**
- Auto-renew subscriptions
- Credit rollover (up to 50% of monthly allowance)
- Usage analytics dashboard
- Success stories & case studies

**Churn Prevention:**
- Downgrade options before cancellation
- Pause subscription (retain data)
- Win-back campaigns (special offers)

### Payment Processing

**Provider:** Stripe
**Supported Methods:**
- Credit cards (Visa, Mastercard, Amex)
- ACH (US customers)
- SEPA (EU customers)

**Billing Cycle:**
- Monthly on signup anniversary
- Annual (paid upfront, 20% discount)
- Failed payment retries (3 attempts over 7 days)

**Tax Handling:**
- VAT for EU customers
- Sales tax for US states (Stripe Tax)
- Invoice generation

---

## Target Customers

### Primary Personas

#### 1. Indie Game Developer (Solo/Small Team)
**Profile:**
- 1-5 person team
- Released 1-2 games on Steam
- 1,000 - 50,000 reviews per game
- Limited resources for community management
- Actively patching based on feedback

**Pain Points:**
- Overwhelmed by review volume
- Can't prioritize which issues to fix first
- Unsure if updates are actually improving sentiment
- Competes with larger studios, needs every advantage

**Value Delivered:**
- Automate review reading (save 10+ hours/week)
- Data-driven prioritization (fix what matters most)
- Update impact measurement (validate dev effort)
- Competitive benchmarking (punch above weight)

**Willingness to Pay:** $29-99/month
**Decision Criteria:** ROI on time saved, ease of use
**Acquisition Channels:** Steam developer forums, indie game subreddits, GameDev.tv

#### 2. Studio Product Manager
**Profile:**
- Works at 10-100 person studio
- Manages 1-3 live service games
- 50,000 - 500,000 reviews per title
- Reports to leadership on player satisfaction
- Coordinates with dev, marketing, community teams

**Pain Points:**
- Leadership demands quantitative player feedback
- Manual review analysis doesn't scale
- Quarterly reports require sentiment metrics
- Cross-functional teams need shared insights

**Value Delivered:**
- Executive-ready reports (PDF exports)
- Quantitative sentiment metrics (KPIs)
- Trend analysis (quarter-over-quarter)
- Stakeholder alignment (shared data source)

**Willingness to Pay:** $99-499/month
**Decision Criteria:** Professional presentation, integration with workflow
**Acquisition Channels:** GDC, LinkedIn, gaming industry newsletters

#### 3. Community Manager
**Profile:**
- Dedicated community/social role at studio
- Monitors player sentiment daily
- Engages with vocal minority on forums/Discord
- Needs to identify escalating issues quickly

**Pain Points:**
- Vocal minority doesn't represent majority
- Issues raised on Discord != what reviews say
- Reactively addressing complaints, not proactively
- No hard data to push back on anecdotal claims

**Value Delivered:**
- Ground truth on player sentiment (beyond vocal minority)
- Early warning system (detect issues at 5% mention rate)
- Data-backed responses ("Only 2% mention this")
- Community pulse check (daily sentiment monitoring)

**Willingness to Pay:** $29-99/month
**Decision Criteria:** Real-time alerts, mobile access
**Acquisition Channels:** Community management Discord servers, CMX events

#### 4. Publisher Portfolio Manager
**Profile:**
- Oversees 5-20 games from different studios
- Evaluates which titles to greenlight for sequels/DLC
- Allocates marketing budget across portfolio
- Needs comparable metrics across titles

**Pain Points:**
- Inconsistent feedback formats from studios
- Can't compare apples-to-apples across games
- Gut decisions on which games to invest in
- No standardized sentiment measurement

**Value Delivered:**
- Standardized metrics across portfolio (compare any 2 games)
- Portfolio dashboard (all titles at a glance)
- Investment prioritization (identify high-potential titles)
- Risk assessment (detect failing games early)

**Willingness to Pay:** $499-2,000/month (enterprise)
**Decision Criteria:** Multi-game support, API access, white-labeling
**Acquisition Channels:** Direct sales, publishing conferences

#### 5. Market Research Analyst (Gaming)
**Profile:**
- Works at agency or consultancy
- Researches player preferences for clients
- Produces reports on genre trends
- Needs qualitative data at scale

**Pain Points:**
- Manual review reading is billable hours
- Clients want quantitative + qualitative insights
- Genre trend reports require analyzing 100+ games
- No tool bridges qual/quant divide

**Value Delivered:**
- Bulk analysis (research 50 games in a day)
- Category-level insights (what do players want in roguelikes?)
- Export capabilities (integrate into client reports)
- Historical trend analysis (sentiment evolution)

**Willingness to Pay:** $199-999/month
**Decision Criteria:** Bulk export, API access, white-label reports
**Acquisition Channels:** Market research conferences, industry analyst networks

### Secondary Personas

- **Investor/VC:** Due diligence on game studios (player sentiment as leading indicator)
- **Journalist/Content Creator:** Data-driven stories about industry trends
- **Academic Researcher:** Studying player behavior, sentiment analysis methods
- **QA Lead:** Prioritizing bug fixes based on player reports

### Market Size (TAM/SAM/SOM)

**TAM (Total Addressable Market):**
- 50,000+ games on Steam
- ~10,000 new games released per year
- If every developer paid $50/month → $30M/month = $360M/year

**SAM (Serviceable Addressable Market):**
- Games with 1,000+ reviews (meaningful analysis)
- Estimate: 5,000 games
- Average customer pays $100/month → $500K/month = $6M/year

**SOM (Serviceable Obtainable Market - Year 1):**
- 5% market penetration of SAM
- 250 paying customers × $100/month = $25K/month = $300K/year

**Growth Projections:**
- Year 1: 250 customers, $300K revenue
- Year 2: 750 customers, $900K revenue (3x growth)
- Year 3: 2,000 customers, $2.4M revenue (2.7x growth)
- Year 5: 5,000 customers, $6M revenue (saturate SAM)

---

## User Workflows

### Workflow 1: First-Time Analysis

**Goal:** Developer wants to understand player sentiment for their new game

**Steps:**
1. **Sign Up** (if SaaS) or **Download Desktop App**
   - Create account / Install app
   - Verify email / Launch app
   - Claim 100 free credits

2. **Search for Game**
   - Navigate to Dashboard
   - Enter game name in search bar
   - Select correct title from autocomplete

3. **Configure Analysis**
   - Choose review count (default: 1,000)
   - View credit estimate (~334 credits)
   - Click "Analyze Reviews"

4. **Monitor Progress**
   - Real-time progress bar (e.g., "453/1000 reviews classified")
   - Estimated completion time
   - Can navigate away, returns to dashboard

5. **Explore Results**
   - View overview metrics (recommendation rate, top categories)
   - Drill into "Top Issues" (e.g., "technical/performance - 23% of reviews")
   - Read evidence snippets ("Game crashes on startup")
   - Check "Top Requests" (e.g., "Add co-op mode - 45 requests")

6. **Take Action**
   - Star game to add to library
   - Export issues to CSV for bug tracker
   - Share metrics with team

**Time to Value:** 15 minutes (5 min setup + 10 min analysis)

### Workflow 2: Post-Update Impact Analysis

**Goal:** Measure if recent patch improved player sentiment

**Steps:**
1. **Navigate to Analyzed Game**
   - Click game from starred library
   - Filters auto-apply from last session

2. **Set Date Range Filter**
   - Open global filters
   - Select "Last 30 days" (post-patch period)
   - Apply filter

3. **Compare Metrics**
   - Note current recommendation rate (e.g., 85%)
   - Change filter to "90-120 days ago" (pre-patch)
   - Compare recommendation rate (e.g., was 78%)
   - **Insight:** Patch improved sentiment by 7%

4. **Drill into Specific Issue**
   - Find "technical/performance" in Top Issues
   - Note it dropped from #1 (18% mention) to #3 (8% mention)
   - Read new reviews to confirm fix

5. **Generate Report**
   - Navigate to Reports page
   - Select game + month
   - Download PDF
   - Share with team in Slack

**Time to Insight:** 5 minutes

### Workflow 3: Competitive Benchmarking

**Goal:** Understand why competitor has higher rating

**Steps:**
1. **Analyze Competitor**
   - Search for competitor's game
   - Analyze with same review count as your game
   - Star competitor game

2. **Open Comparison Tool**
   - Navigate to Compare page
   - Select your game + competitor game

3. **Review Metrics**
   - Overall recommendation: You 82%, Them 91%
   - Category breakdown:
     - gameplay/balance: You 75%, Them 88% ← **Key difference**
     - technical/performance: You 85%, Them 84%
   - Top Issues:
     - Your game: "Balance issues" (34 mentions)
     - Their game: "Learning curve" (12 mentions)

4. **Deep Dive**
   - Click "AI Comparison" button
   - LLM analyzes 30 reviews from each game
   - Summary: "Competitor has better weapon balance, players feel all loadouts are viable"

5. **Action Items**
   - Flag "balance" as priority for next patch
   - Research their balance approach
   - Set reminder to re-compare after balance update

**Time to Insight:** 10 minutes

### Workflow 4: Daily Community Pulse Check

**Goal:** Community manager monitors daily sentiment

**Steps:**
1. **Morning Routine**
   - Open SentiNext dashboard
   - Check all starred games
   - Apply "Last 24 hours" filter

2. **Scan for Issues**
   - Look for new spikes in Top Issues
   - Notice "technical/crashes" jumped from 5% to 15% mentions
   - **Alert:** Potential breaking bug in yesterday's patch

3. **Investigate**
   - Navigate to Database Explorer
   - Filter: Last 24h + "technical/crashes"
   - Sort by helpfulness
   - Read top 5 reviews: "Game crashes when opening inventory"

4. **Respond**
   - Alert dev team on Slack: "Inventory crash affecting 15% of new reviews"
   - Post on Steam forums: "We're aware of inventory crash, fix coming today"
   - Create bug ticket with review links as evidence

5. **Follow-Up**
   - After hotfix deployed, monitor for 24h
   - Crashes drop back to 5% mention rate
   - Mark issue as resolved

**Time to Insight:** 5 minutes/day

### Workflow 5: Product Roadmap Planning

**Goal:** Prioritize Q2 features based on player demand

**Steps:**
1. **Export Feature Requests**
   - Navigate to Database Explorer
   - Filter: Has Request = True
   - Sort by votes_up (most helpful)
   - Export to CSV

2. **Analyze in Spreadsheet**
   - Import CSV to Google Sheets
   - Count request frequency by subcategory
   - Top 3:
     1. "online_community/matchmaking" - 234 requests
     2. "content_design/variety" - 189 requests
     3. "ui_ux_accessibility/quality_of_life" - 156 requests

3. **Cross-Reference with Insights**
   - Back in SentiNext, check "Top Requests" page
   - Matchmaking: 12% of reviews mention, 68% are negative
   - Variety: 8% of reviews, 45% negative
   - QoL: 7% of reviews, 30% negative

4. **Prioritization Matrix**
   - High impact + High frequency → **Matchmaking (Priority 1)**
   - Medium impact + High frequency → Variety (Priority 2)
   - Low impact + Medium frequency → QoL (Priority 3)

5. **Stakeholder Alignment**
   - Generate PDF report with evidence snippets
   - Present at roadmap planning meeting
   - Unanimous agreement: Matchmaking is Q2 focus

**Time to Decision:** 30 minutes

---

## Analytics & Insights

### Key Metrics Tracked

#### 1. Recommendation Rate
**Definition:** % of reviews that are thumbs up
**Granularity:**
- Overall (all reviews)
- By category (e.g., gameplay: 85%, technical: 72%)
- By subcategory (e.g., technical/performance: 68%)
- By player segment (newcomers: 90%, veterans: 75%)
- By time period (weekly buckets)

**Use Cases:**
- Primary health metric for game
- Identify weak categories (focus area)
- Track improvement over time
- Segment analysis (who's unhappy?)

**Visualization:**
- Gauge charts (overall)
- Bar charts (category comparison)
- Line charts (trend over time)

#### 2. Issue Frequency
**Definition:** Number of reviews mentioning each issue subcategory
**Ranking:** Sorted by count, descending
**Top Issues List:** Shows top 10 with:
- Subcategory name (e.g., "technical/bugs")
- Count (e.g., 234 reviews)
- % of total reviews (e.g., 23.4%)
- Recommendation rate for reviews with this issue (e.g., 45%)
- Sample evidence snippets (2-3 quotes)

**Use Cases:**
- Bug triage (which bugs affect most players?)
- Patch prioritization (fix high-frequency issues first)
- Community management (address top complaints)

**Visualization:**
- Horizontal bar chart (count)
- Table with sortable columns

#### 3. Feature Request Demand
**Definition:** Number of reviews requesting each feature
**Ranking:** Sorted by count + helpfulness votes
**Top Requests List:** Shows top 10 with:
- Subcategory (e.g., "online_community/co-op")
- Request count
- Average helpfulness (votes_up) of requests
- Sentiment of requesters (positive/negative)
- Evidence snippets

**Use Cases:**
- Roadmap planning (what do players want?)
- DLC ideation (monetizable features)
- Community engagement (acknowledge top requests)

**Visualization:**
- Horizontal bar chart
- Bubble chart (size = count, color = sentiment)

#### 4. Player Segment Analysis
**Definition:** Breakdown by playtime categories
**Segments:**
- Newcomers: 0-5 hours
- Casual: 5-20 hours
- Experienced: 20-100 hours
- Veterans: 100+ hours

**Metrics per Segment:**
- Count of reviews
- Recommendation rate
- Top issue for this segment
- Top request for this segment

**Use Cases:**
- Retention analysis (why do newcomers quit?)
- Endgame content (what do veterans want?)
- Onboarding (newcomer pain points)
- Marketing (which segment is most satisfied?)

**Visualization:**
- Stacked bar chart (count by segment)
- Table with segment rows

#### 5. Sentiment Trend
**Definition:** Recommendation rate over time
**Granularity:** Weekly buckets
**Calculation:**
- Group reviews by week of `timestamp_created`
- Calculate % positive per week
- Plot as line chart

**Annotations:**
- Major updates (user can add)
- Significant events (sale periods, content drops)

**Use Cases:**
- Update impact measurement
- Long-term health monitoring
- Seasonal patterns detection
- Crisis identification (sudden drops)

**Visualization:**
- Line chart with date on x-axis
- Moving average (4-week)
- Confidence intervals

#### 6. Risk Indicators
**Custom Metrics:**

**Refund Risk:**
- % of reviews mentioning "refund" in text
- Higher = more players requesting refunds
- Typical: 2-5%, Warning: >10%

**Core Fan Disappointment:**
- Recommendation rate among veterans (100+ hours)
- Drop indicates losing dedicated playerbase
- Critical if veterans <70% positive

**Early Abandonment:**
- % of negative reviews from newcomers (0-5h)
- High rate indicates onboarding problems
- Warning: >40% of newcomers negative

**Technical Debt:**
- % of reviews mentioning technical issues
- Indicates infrastructure problems
- Warning: >30% mention technical

**Use Cases:**
- Early warning system
- Stakeholder alerts
- Prioritization (address risks first)

**Visualization:**
- Gauge charts with red/yellow/green zones
- Trend lines (is risk increasing?)

### Derived Insights

#### Category Recommendation Rates
**Calculation:**
```python
category_reviews = reviews with category in llm_categories
positive_count = count(category_reviews where voted_up = true)
rate = positive_count / len(category_reviews)
```

**Example:**
- Gameplay: 1,234 reviews → 1,050 positive → 85% rate
- Technical: 890 reviews → 641 positive → 72% rate

#### Subcategory Evidence
**Extraction:**
- LLM returns `evidence` dict: `{"technical/performance": "quote"}`
- Stored in JSONB column
- Retrieved for display in UI

**Aggregation:**
- For each subcategory, fetch all evidence snippets
- Sort by review helpfulness (votes_up)
- Display top 3-5 in UI

#### Comparison Deltas
**Calculation:**
- Fetch metric for Game A and Game B
- Delta = A - B
- Display with color coding (green = advantage, red = disadvantage)

**Example:**
- Game A recommendation: 85%
- Game B recommendation: 78%
- Delta: +7% (green, you're winning)

#### Monthly Report Data
**Filtering:**
```python
month_reviews = reviews where:
  EXTRACT(YEAR FROM to_timestamp(timestamp_created)) = year
  AND EXTRACT(MONTH FROM to_timestamp(timestamp_created)) = month
```

**Aggregation:**
- Calculate all metrics for month_reviews subset
- Generate top issues/requests for month
- Compute trends (compare to previous month)

---

## Competitive Advantages

### 1. Steam-Native Integration
**Advantage:** Deep integration with Steam's review infrastructure
**Benefit:** No manual data entry, instant access to all public reviews
**Competitor Weakness:** Generic sentiment tools require CSV uploads or manual tagging

### 2. LLM-Powered Classification
**Advantage:** Automatically categorizes reviews without training data
**Benefit:** Works for any game genre, adapts to new feedback types
**Competitor Weakness:** Rule-based systems miss nuance, require manual keyword lists

### 3. Developer-Centric Taxonomy
**Advantage:** 30+ subcategories designed for game development (gameplay/balance, technical/performance, etc.)
**Benefit:** Insights map directly to dev workflows (programming, design, QA)
**Competitor Weakness:** Generic sentiment (positive/negative/neutral) doesn't guide action

### 4. Evidence Extraction
**Advantage:** LLM pulls verbatim quotes supporting each classification
**Benefit:** Developers see actual player language, can quote in patch notes
**Competitor Weakness:** Summaries lose player voice, lack credibility

### 5. Privacy-First (Desktop App)
**Advantage:** All data stored locally, no cloud required
**Benefit:** Appeals to privacy-conscious developers, no data sovereignty concerns
**Competitor Weakness:** SaaS-only tools require trusting third party with player data

### 6. Agentic Chat Interface
**Advantage:** Natural language queries about review data, autonomous tool selection
**Benefit:** Non-technical stakeholders (marketing, execs) can self-serve insights
**Competitor Weakness:** Static dashboards require SQL knowledge or data analyst

### 7. Comparison Tooling
**Advantage:** Side-by-side analysis of 2 games with AI-generated summary
**Benefit:** Competitive intelligence, benchmarking, market positioning
**Competitor Weakness:** Most tools analyze 1 game at a time

### 8. Transparent Sourcing
**Advantage:** Every chat answer shows all 100 source reviews
**Benefit:** Users can verify AI claims, trust insights
**Competitor Weakness:** Black-box AI provides summaries without evidence

### 9. Pricing Model
**Advantage:** Credit-based system aligns cost with value (pay per analysis)
**Benefit:** Low barrier to entry (free tier), predictable costs
**Competitor Weakness:** Flat monthly fees for unlimited use incentivize spam, or per-seat pricing excludes small teams

### 10. Speed to Insight
**Advantage:** 10,000 review analysis completes in ~30 minutes
**Benefit:** Actionable insights same-day, not weeks later
**Competitor Weakness:** Manual analysis takes days, traditional NLP requires model training

---

## Development Pipeline

### Completed Features (v1.0)

✅ **Core Analysis Engine**
- Steam API integration
- LLM-powered classification (Google Gemini)
- Batch processing (3 reviews per call)
- Evidence extraction
- Result caching

✅ **Dashboard & Insights**
- Game search
- Analysis configuration
- Progress tracking
- Overview metrics
- Category breakdown
- Top issues/requests
- Player segments
- Sentiment trends

✅ **Review Database Explorer**
- Full-text search
- Advanced filtering (20+ filters)
- Review cards with LLM labels
- CSV export
- Pagination (load more)

✅ **Game Comparison**
- Side-by-side metrics
- Category comparison
- Subcategory drill-down
- AI-powered comparison summaries

✅ **AI Chat Interface**
- Agentic tool-calling loop
- 14 specialized tools
- Natural language queries
- Chart generation
- Citation system
- Source review widget
- Conversation history
- Suggested follow-up questions

✅ **Executive Reports**
- PDF generation (ReportLab)
- Monthly filtering
- 6-page professional reports
- Dark theme styling
- Evidence snippets

✅ **Credits System**
- Tiered subscriptions
- Credit tracking
- Usage estimation
- Stripe integration
- Transaction history

✅ **Desktop App**
- Tauri wrapper
- PyInstaller backend bundle
- Static frontend export
- Single executable

✅ **Multi-Language Support**
- i18n framework (English, Italian, French, German)
- Language context provider
- Translatable UI strings

✅ **Authentication & Admin**
- Clerk.dev integration (SaaS)
- Local mode (desktop)
- Admin panel
- User management

### In Development (v1.1 - Next 3 Months)

🚧 **Enhanced Filtering**
- Saved filter presets
- Quick filters (1-click common combinations)
- Filter history (recent filters)

🚧 **Alerts & Notifications**
- Email alerts for sentiment drops
- Slack/Discord webhooks
- Custom alert rules (e.g., "Notify if crashes >10%")

🚧 **Collaboration Features**
- Team workspaces
- Shared game libraries
- Comments on insights
- @mentions in discussions

🚧 **API Access**
- RESTful API for Pro+ users
- Webhook integrations
- Zapier connector
- Python SDK

🚧 **Advanced Visualizations**
- Heatmaps (issues over time)
- Sankey diagrams (player journey)
- Network graphs (topic relationships)
- Custom dashboards (drag-and-drop widgets)

### Roadmap (v2.0 - 6-12 Months)

📋 **Multi-Platform Support**
- Epic Games Store integration
- GOG.com reviews
- Itch.io reviews
- Mobile app stores (iOS/Android)

📋 **Advanced LLM Features**
- Sentiment intensity (1-10 scale beyond thumbs up/down)
- Emotion detection (frustration, excitement, disappointment)
- Sarcasm detection
- Language translation (analyze non-English reviews)

📋 **Predictive Analytics**
- Forecast future sentiment based on trends
- Predict review volume after updates
- Identify leading indicators of churn

📋 **Review Response Generator**
- AI-drafted responses to common complaints
- Tone customization (professional, casual, empathetic)
- Bulk response templates

📋 **Community Health Score**
- Composite metric (sentiment + toxicity + engagement)
- Benchmarking against similar games
- Historical tracking

📋 **Integration Ecosystem**
- JIRA/Linear (auto-create tickets from issues)
- Confluence/Notion (sync reports)
- Google Analytics (correlate with player metrics)
- Unity/Unreal Analytics

📋 **White-Label Solution**
- Custom branding for enterprise
- Embedded widgets for publisher portals
- SSO integration

### Research & Exploration

🔬 **Experimental Features**
- Voice-of-customer extraction (key phrases)
- Topic modeling (unsupervised clustering)
- Review authenticity detection (filter fake reviews)
- Competitor sentiment tracking (auto-analyze competitors)
- Player persona generation (LLM-created archetypes)

🔬 **Performance Optimizations**
- Incremental analysis (only new reviews)
- Streaming LLM responses (faster perceived speed)
- Distributed processing (parallel analysis)
- Edge caching (CDN for static assets)

🔬 **Cost Optimizations**
- Model distillation (fine-tune smaller models)
- Prompt optimization (reduce token usage)
- Result summarization (compress evidence)

---

## Business Model

### Revenue Streams

#### 1. SaaS Subscriptions (Primary - 80%)
**Monthly Recurring Revenue (MRR):**
- Free tier: $0 (acquisition channel)
- Starter: $29/month
- Professional: $99/month
- Enterprise: $499+/month (custom)

**Target Distribution:**
- 60% Starter tier (volume)
- 30% Professional tier (value)
- 10% Enterprise tier (revenue concentration)

**Customer Lifetime Value (LTV):**
- Starter: $29/month × 18 months avg = $522
- Professional: $99/month × 24 months avg = $2,376
- Enterprise: $499/month × 36 months avg = $17,964

**Churn Rate Target:** <5% monthly (industry standard: 3-7%)

#### 2. Credit Top-Ups (Secondary - 15%)
**One-Time Purchases:**
- 500 credits: $15 (10% bulk discount)
- 1,000 credits: $25 (17% bulk discount)
- 5,000 credits: $100 (33% bulk discount)

**Use Cases:**
- Seasonal spikes (before major updates)
- One-off deep dives (analyzing backlog)
- Trial users testing before subscribing

**Conversion Strategy:**
- Offer top-up when credits exhausted
- "Buy once" → "Save with subscription" messaging

#### 3. Enterprise Contracts (Tertiary - 5%)
**Custom Deals:**
- White-label instances ($10,000+/year)
- Dedicated support ($5,000/year add-on)
- Custom taxonomy development ($15,000 one-time)
- API overage fees ($0.01/call above quota)

**Target Customers:**
- Publishers with 10+ game portfolio
- Market research agencies
- Large studios (500+ employees)

### Cost Structure

#### Variable Costs (Scale with Usage)

**LLM API Costs:**
- Google Gemini Flash Lite: ~$0.0001/review
- 1,000 reviews analyzed = $0.10 LLM cost
- Average customer analyzes 3,000 reviews/month = $0.30/month
- **Margin:** 99% (customer pays $29-99, cost is $0.30)

**Payment Processing:**
- Stripe: 2.9% + $0.30 per transaction
- $29 subscription → $1.14 fee = 3.9% of revenue
- $99 subscription → $3.17 fee = 3.2% of revenue

**Hosting (Cloud Deployment):**
- AWS/GCP compute: $100/month (scales with users)
- Database (RDS): $50/month for 50GB (grows with data)
- CDN (CloudFront): $20/month for static assets
- Total: ~$170/month for first 100 customers

#### Fixed Costs (Monthly)

**Engineering:**
- 2 full-time engineers @ $120k/year = $20k/month
- 1 part-time designer @ $60k/year = $5k/month

**Operations:**
- Customer support (contract): $2k/month
- Marketing tools (Mailchimp, SEO): $500/month
- Business software (Slack, Notion, etc.): $300/month

**Total Fixed:** ~$28k/month

### Unit Economics

**Starter Tier:**
- Revenue: $29/month
- LLM cost: $0.30/month (1,000 credits = 3,000 reviews)
- Stripe fee: $1.14/month
- Gross profit: $27.56/month
- **Gross margin:** 95%

**Professional Tier:**
- Revenue: $99/month
- LLM cost: $1.50/month (5,000 credits = 15,000 reviews)
- Stripe fee: $3.17/month
- Gross profit: $94.33/month
- **Gross margin:** 95%

**Break-Even Analysis:**
- Fixed costs: $28,000/month
- Average revenue per customer: $60/month (blended)
- **Break-even customers:** 467

### Growth Projections

**Year 1:**
- Q1: 50 customers, $3k MRR
- Q2: 150 customers, $9k MRR
- Q3: 300 customers, $18k MRR
- Q4: 500 customers, $30k MRR
- **Year 1 Total:** $360k ARR

**Year 2:**
- Grow to 1,500 customers (3x)
- Average $75/month (tier migration)
- **Year 2 Total:** $1.35M ARR

**Year 3:**
- Grow to 3,000 customers (2x)
- Average $90/month (more Pro users)
- **Year 3 Total:** $3.24M ARR

**Profitability:**
- Year 1: -$100k (R&D investment)
- Year 2: +$200k (30% net margin)
- Year 3: +$800k (35% net margin)

### Go-to-Market Strategy

#### Phase 1: Indie Developer Acquisition (Months 1-6)

**Channels:**
- **Reddit:** r/gamedev, r/indiedev, genre-specific subs
- **Twitter:** #gamedev, #indiedev hashtags
- **Discord:** GameDev.tv, Brackeys, Unity/Unreal servers
- **Forums:** Steam developer forums, TIGSource

**Tactics:**
- Case studies (before/after sentiment analysis)
- Free tier → frictionless trial
- Content marketing (blog posts on "How to analyze Steam reviews")
- Twitter threads showing real examples

**Budget:** $2k/month (mostly content creation)

**Target:** 50 customers by Month 6

#### Phase 2: Studio Expansion (Months 6-12)

**Channels:**
- **LinkedIn:** Target product managers, community managers
- **GDC:** Booth, swag, demos
- **Industry newsletters:** GameDiscoverCo, Game Developer Magazine
- **Webinars:** "Data-Driven Game Development" (lead gen)

**Tactics:**
- Free professional tier for GDC attendees (30-day trial)
- Partnership with analytics platforms (GameAnalytics, Unity Analytics)
- PR push (TechCrunch, VentureBeat coverage)

**Budget:** $10k/month (events, partnerships, PR)

**Target:** 500 customers by Month 12

#### Phase 3: Enterprise Sales (Year 2+)

**Channels:**
- **Direct sales:** Hire 2 BDRs (business development reps)
- **Publisher conferences:** Gamescom, E3 successor events
- **Industry associations:** IGDA, ESA

**Tactics:**
- Account-based marketing (target top 50 publishers)
- Custom demos for enterprise prospects
- RFP responses
- Case studies with tier-1 studios (under NDA)

**Budget:** $50k/month (salaries + events)

**Target:** 10 enterprise deals by Year 2 ($5k/month avg)

### Customer Acquisition Cost (CAC)

**Blended CAC Target:** $150/customer

**Calculation:**
- Year 1 marketing spend: $72k ($6k/month avg)
- Year 1 customers acquired: 500
- CAC: $72k / 500 = $144

**CAC by Channel:**
- Organic (SEO, word-of-mouth): $0
- Reddit/forums: $50 (time cost)
- LinkedIn ads: $200/customer
- GDC booth: $300/customer (amortized over leads)
- Direct sales (enterprise): $1,000/customer (justified by LTV)

**CAC Payback Period:**
- Starter tier: 5 months ($29 × 5 = $145)
- Professional tier: 2 months ($99 × 2 = $198)
- Enterprise tier: 2 months ($499 × 2 = $998)

**LTV:CAC Ratio Target:** 3:1
- Starter: $522 / $150 = 3.5:1 ✓
- Professional: $2,376 / $200 = 11.9:1 ✓✓
- Enterprise: $17,964 / $1,000 = 18:1 ✓✓✓

### Retention & Expansion

**Churn Reduction:**
- Onboarding emails (drip campaign)
- Success milestones (first analysis, first export)
- Proactive support (reach out at 50% credit usage)
- Feature announcements (keep product top-of-mind)

**Expansion Revenue:**
- Tier upgrades (Starter → Pro when hitting credit limits)
- Annual plan conversion (20% discount incentive)
- Credit top-up sales (upsell at exhaustion)

**Net Revenue Retention Target:** 110%
- 95% gross retention (5% churn)
- 15% expansion (tier upgrades + top-ups)
- NRR = 95% + 15% = 110%

---

## Technical Specifications

### System Requirements

#### Desktop App
**Minimum:**
- OS: Windows 10, macOS 11, Ubuntu 20.04
- RAM: 4GB
- Disk: 500MB (app) + 1GB per 10,000 reviews analyzed
- CPU: Dual-core 2GHz
- Internet: Required for LLM API calls

**Recommended:**
- RAM: 8GB
- Disk: 5GB
- CPU: Quad-core 3GHz
- SSD for database

#### Cloud/SaaS
**Backend Server:**
- 4 vCPU, 8GB RAM (supports 100 concurrent users)
- 100GB SSD (database storage)
- Load balancer for multiple instances

**Database:**
- PostgreSQL 14+
- 50GB for first 100,000 reviews
- Scales linearly (~500MB per 1,000 reviews)

**CDN:**
- CloudFront or similar for static assets
- Global edge locations

### API Specifications

#### Authentication
**SaaS Mode:**
- Clerk JWT tokens in `Authorization: Bearer <token>` header
- Token refresh handled client-side

**Desktop Mode:**
- No authentication, `user_id="local"`

#### Rate Limits (SaaS)
- Free tier: 100 requests/hour
- Starter: 500 requests/hour
- Professional: 2,000 requests/hour
- Enterprise: Custom

#### Endpoints (50+ total)

**Analysis:**
- `POST /analyze` - Start review analysis
- `POST /analyze/estimate` - Get credit estimate
- `GET /progress/{app_id}` - Check analysis status
- `GET /analysis/{app_id}` - Get analysis results
- `DELETE /analysis/{app_id}` - Delete analysis

**Reviews:**
- `GET /database/reviews` - Search reviews (paginated)
- `GET /database/stats` - Get database statistics
- `GET /database/games` - List analyzed games
- `POST /database/export` - Export reviews to CSV

**Chat:**
- `POST /chat/simple` - Send chat message (SSE stream)
- `GET /chat/history` - Get conversation history
- `POST /chat/citation-feedback` - Rate citation helpfulness

**Reports:**
- `GET /reports/available-months/{app_id}` - List reportable months
- `GET /reports/executive-summary/{app_id}` - Generate PDF

**Comparison:**
- `POST /compare/summary` - AI comparison of 2 games

**Credits:**
- `GET /credits/balance` - Get user credit balance
- `GET /credits/transactions` - Get transaction history
- `POST /credits/estimate` - Estimate cost of operation

**Games:**
- `GET /search` - Search Steam games by name
- `GET /starred` - Get user's game library
- `POST /star/{app_id}` - Add game to library
- `DELETE /star/{app_id}` - Remove from library

#### Response Formats

**Success Response:**
```json
{
  "status": "success",
  "data": { ... },
  "timestamp": "2026-02-03T12:34:56Z"
}
```

**Error Response:**
```json
{
  "status": "error",
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "You need 334 credits but have 50.",
    "details": {
      "required": 334,
      "available": 50
    }
  },
  "timestamp": "2026-02-03T12:34:56Z"
}
```

### Data Models

**Review:**
```typescript
{
  review_id: string;
  app_id: number;
  author_steamid: string;
  review: string;
  voted_up: boolean;
  votes_up: number;
  timestamp_created: number;  // Unix timestamp
  playtime_forever: number;   // Minutes
  language: string;
  llm_categories: string[];
  llm_subcategories: string[];
  llm_issue_subcategories: string[];
  llm_request_subcategories: string[];
  llm_has_issue: boolean;
  llm_has_request: boolean;
  evidence: Record<string, string>;
}
```

**Analysis Insights:**
```typescript
{
  total_reviews: number;
  recommendation_rate: number;
  share_positive: number;
  share_negative: number;
  average_compound: number;
  median_playtime_hours: number;
  refund_risk: number;
  core_fan_disappointment: number;
  category_rates: {
    [category: string]: {
      count: number;
      rate: number;
    }
  };
  subcategory_insights: {
    subcategory: string;
    count: number;
    recommendation_rate: number;
    issue_count: number;
    request_count: number;
  }[];
  top_issues: {
    subcategory: string;
    count: number;
    recommendation_rate: number;
    evidence: string[];
  }[];
  top_requests: {
    subcategory: string;
    count: number;
    avg_votes_up: number;
    evidence: string[];
  }[];
  player_segments: {
    newcomers: { count: number; rate: number };
    casual: { count: number; rate: number };
    experienced: { count: number; rate: number };
    veterans: { count: number; rate: number };
  };
}
```

### Security

**Data Encryption:**
- HTTPS for all API traffic (TLS 1.3)
- Database encryption at rest (AES-256)
- Secrets stored in environment variables (never committed)

**Authentication:**
- Clerk JWT validation (SaaS)
- Token expiration: 1 hour, refresh handled automatically
- Admin routes protected by token or user ID whitelist

**Input Validation:**
- Pydantic models for all request bodies
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized markdown rendering)

**Rate Limiting:**
- Per-user limits based on subscription tier
- IP-based limits for unauthenticated endpoints
- Exponential backoff on retries

**Privacy:**
- User data isolated by `user_id`
- No cross-contamination of game libraries
- Steam reviews are public data (no PII concerns)
- GDPR compliance: data export, deletion on request

### Performance

**Response Times (p95):**
- API endpoints: <200ms
- LLM classification: ~2 seconds per batch (3 reviews)
- Analysis of 1,000 reviews: ~10 minutes
- Chat message: <5 seconds (including tool calls)
- PDF generation: <3 seconds

**Scalability:**
- Current: Supports 1,000 concurrent users
- Horizontal scaling: Add FastAPI instances behind load balancer
- Database scaling: Read replicas for analytics queries
- Caching: Redis for session data, analysis results

**Optimization:**
- Database indexes on app_id, timestamp, votes_up
- Connection pooling (SQLAlchemy)
- Lazy loading for large datasets
- Pagination for all list endpoints (default 50 items)

---

## Conclusion

SentiNext is a comprehensive, AI-powered sentiment analysis platform purpose-built for Steam game developers. By automating the manual process of reading and categorizing player reviews, it empowers developers to make data-driven decisions about patches, features, and community management.

**Key Differentiators:**
- Deep Steam integration
- LLM-powered automatic categorization
- Developer-centric taxonomy
- Evidence extraction for credibility
- Privacy-first desktop app option
- Agentic chat for natural language queries
- Transparent AI with source review visibility

**Market Opportunity:**
- 5,000+ games with 1,000+ reviews (serviceable market)
- $6M annual revenue potential at market saturation
- Low customer acquisition cost ($150) vs. high lifetime value ($500-18,000)

**Product Maturity:**
- v1.0 complete with all core features
- Proven technical stack (FastAPI, Next.js, Google Gemini)
- Multiple deployment modes (desktop, local web, cloud SaaS)
- Credit-based monetization with tiered subscriptions

**Next Steps:**
- Scale user acquisition via indie developer communities
- Expand to studio/publisher segments
- Build API ecosystem for integrations
- Explore multi-platform support (Epic, GOG, mobile)

SentiNext is positioned to become the industry-standard tool for game sentiment analysis, much like how Mixpanel defined product analytics or Intercom defined customer messaging.

---

**Document Version:** 1.0
**Last Updated:** February 3, 2026
**Maintained By:** Product Team
**Contact:** [Your contact information]
