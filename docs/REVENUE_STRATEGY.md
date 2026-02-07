# SentiNext Revenue Strategy

**Version:** 1.0
**Date:** February 2026
**Prepared for:** Internal strategic planning

---

## Table of Contents

1. [Market Definition](#1-market-definition)
2. [Market Sizing (TAM / SAM / SOM)](#2-market-sizing)
3. [Competitive Landscape](#3-competitive-landscape)
4. [Pricing Architecture](#4-pricing-architecture)
5. [Unit Economics](#5-unit-economics)
6. [Growth Model & Funnel](#6-growth-model--funnel)
7. [Revenue Projections (3-Year)](#7-revenue-projections-3-year)
8. [Expansion Strategy](#8-expansion-strategy)
9. [Key Risks & Mitigations](#9-key-risks--mitigations)
10. [Execution Roadmap](#10-execution-roadmap)

---

## 1. Market Definition

### What SentiNext sells

SentiNext is a **review intelligence platform** — it transforms unstructured player reviews into classified, queryable, actionable insights using LLM-powered taxonomy extraction. The product sits at the intersection of:

- **Customer Feedback Management** (CFM) — like Appbot, AppFollow for mobile
- **Game Market Intelligence** — like VGInsights, Gamalytic, GG Insights
- **AI Analytics** — like GameAnalytics, but for qualitative review data instead of in-game telemetry

### The gap SentiNext fills

| Existing tools | What they offer | What's missing |
|---|---|---|
| VGInsights, Gamalytic | Sales estimates, wishlists, CCU | Zero review content analysis |
| SteamDB, SteamSpy | Price history, player counts | No sentiment or issue extraction |
| GameAnalytics | In-game telemetry, retention | Only tracks behavior, not voice-of-player |
| Appbot, AppFollow | Mobile review sentiment | Steam-blind; no structured taxonomy |
| Manual reading | Context, nuance | Doesn't scale beyond ~200 reviews |

**SentiNext is the only tool that structurally classifies Steam reviews into a 30+ subcategory taxonomy and extracts issues, requests, and evidence at scale.**

---

## 2. Market Sizing

### Total Addressable Market (TAM)

**The global game analytics tools market is ~$638M (2025), growing at 5.7% CAGR.**

However, most of that is in-game telemetry (Unity Analytics, GameAnalytics, Firebase). The **review intelligence subset** is nascent — estimated at $15-40M across all platforms (mobile + PC + console).

### Serviceable Addressable Market (SAM)

We scope SAM to **Steam-focused developers and publishers who earn enough revenue to justify a SaaS subscription**.

| Segment | Count | Evidence |
|---|---|---|
| Total devs/publishers on Steam | ~44,000+ | Game Developer (2023 census) |
| Active devs (released a game in last 2 years) | ~25,000-30,000 | ~20,000 releases/year with some multi-title devs |
| Revenue-generating (>$10K lifetime) | ~8,000-12,000 | ~25% of active devs earn meaningful revenue |
| Would pay $8-20/mo for tooling | ~5,000-8,000 | Subset with sufficient revenue + analytics need |
| Mid-size publishers (5+ titles, >$1M) | ~500-800 | Estimated from SteamDB publisher data |
| AA/AAA publishers | ~100-200 | Enterprise custom tier |

**SAM: ~6,000-9,000 accounts representing $1.5M-$3.6M ARR potential** (at blended ARPU of $15-$25/mo).

### Serviceable Obtainable Market (SOM)

Realistic capture over 3 years given a solo-founder GTM:

| Timeframe | Penetration | Paying accounts | ARR |
|---|---|---|---|
| Year 1 | 1-2% of SAM | 80-150 | $15K-$40K |
| Year 2 | 3-5% of SAM | 250-450 | $60K-$130K |
| Year 3 | 6-10% of SAM | 500-900 | $140K-$350K |

---

## 3. Competitive Landscape

### Direct competitors (Steam review analytics)

| Tool | Model | Price | Strength | Weakness |
|---|---|---|---|---|
| **GG Insights** | SaaS | Unknown (free tier + paid) | 1,000+ users, broad game data | No LLM-powered review classification |
| **Gamalytic** | SaaS | Free + paid | Sales/revenue estimates | No review content analysis |
| **VGInsights** | SaaS | ~$20/mo (indie) | 50+ datapoints, 150K games | Market research only, no review AI |
| **Steam Review Explorer** | Free tool | Free | Open, simple | No analysis — just raw browsing |

### Adjacent competitors (mobile review analytics)

| Tool | Price | Relevance |
|---|---|---|
| **Appbot** | $49-$479/mo | Closest analog — sentiment + topic analysis for App Store/Google Play. Proves market exists. |
| **AppFollow** | Custom | Enterprise review management, support workflow integration |
| **AppReviewBot** | $5-$20/mo | Lightweight review monitoring via Slack |

### Key insight

**Appbot's existence at $49-$479/mo for mobile proves that review intelligence is a viable SaaS category.** They serve Fortune 100 companies. SentiNext is the Steam-native equivalent — and currently has no direct competitor doing LLM-powered structured classification of Steam reviews.

---

## 4. Pricing Architecture

### Current pricing

| Tier | Price | Credits | Primary audience |
|---|---|---|---|
| **Free** | $0 | 1,000 trial (one-time) | Leads, evaluation |
| **Indie** | $8/mo | 5,000/mo | Solo devs, small studios |
| **Pro** | $20/mo | 15,000/mo | Active studios, small publishers |
| **Enterprise** | Custom | Custom | Publishers with 10+ titles |

### Recommended pricing changes

#### A. Indie at $8/mo

- **Rationale**: $8 is a strong sub-$10 price point. Single-digit pricing reduces purchase hesitation for indie devs who are notoriously cost-sensitive.
- **Revenue impact**: Lower per-user revenue offset by higher expected conversion at this price point.
- **Margin impact**: Negligible on typical users (~$1.26 COGS). Thin on heavy chat users — acceptable.

#### B. Introduce Annual billing (not yet implemented)

| Tier | Monthly | Annual (per month) | Annual total | Discount |
|---|---|---|---|---|
| Indie | $8 | $6 | $75/yr | 22% off |
| Pro | $20 | $16 | $192/yr | 20% off |

- **Rationale**: Annual commitments reduce churn (lock-in), improve cash flow, and increase LTV.
- **Expected mix**: 30-40% of subscribers choose annual within 6 months of launch.
- **LTV impact**: Annual users churn at ~50% the rate of monthly users.

#### C. Introduce Publisher tier ($49-$99/mo)

| Tier | Price | Credits | Target |
|---|---|---|---|
| **Publisher** | $49/mo | 40,000/mo | Small publishers (5-15 titles) |
| **Publisher Plus** | $99/mo | 100,000/mo | Mid-size publishers (15-50 titles) |

- **Rationale**: The jump from $20 (Pro) to "Custom" (Enterprise) is too wide. Publishers with 5-50 titles need a self-serve option.
- **Revenue impact**: Even 20-30 Publisher accounts = $12K-$36K ARR — high-value segment.

#### D. Proposed pricing grid

| Tier | Monthly | Annual | Credits/mo | Target ARPU (blended) |
|---|---|---|---|---|
| Free | $0 | — | 1,000 trial | $0 |
| Indie | $8 | $75/yr | 5,000 | $7 |
| Pro | $20 | $192/yr | 15,000 | $18 |
| Publisher | $49 | $470/yr | 40,000 | $45 |
| Enterprise | Custom | Custom | Custom | $200+ |

---

## 5. Unit Economics

### LLM COGS per tier (from actual model pricing)

Using production pricing: xAI Grok at ($0.20/$0.50 per 1M tokens) for classify, Gemini flash-lite ($0.10/$0.40) for chat/summarize.

| Tier | Credits | Light COGS | Typical COGS | Heavy COGS |
|---|---|---|---|---|
| Indie ($8) | 5,000 | $1.70 | $1.26 | $3.50 |
| Pro ($20) | 15,000 | $5.10 | $3.78 | $10.50 |
| Publisher ($49) | 40,000 | $13.60 | $10.08 | $28.00 |

*Light = all classify. Typical = 55% classify, 20% chat, 15% summarize, 5% translate, 5% compare. Heavy = all chat_agent.*

### Margin analysis (typical user)

| Tier | Revenue | Stripe fee (~3.2%) | COGS (typical) | Infra (~$1) | Net margin | Margin % |
|---|---|---|---|---|---|---|
| Indie | $8.00 | $0.26 | $1.26 | $1.00 | **$5.48** | 69% |
| Pro | $20.00 | $0.94 | $3.78 | $1.00 | **$14.28** | 71% |
| Publisher | $49.00 | $1.87 | $10.08 | $1.50 | **$35.55** | 73% |
| Enterprise | $200+ | $6.70 | ~$40 | $3.00 | **$150+** | 75%+ |

### Key SaaS metrics targets

| Metric | Target (Year 1) | Benchmark |
|---|---|---|
| **Monthly churn** | <5% | SMB SaaS avg: 3-5%/mo |
| **Annual churn** | <40% | Early-stage SMB SaaS: ~40-50% |
| **Free-to-paid conversion** | 3-5% | Freemium self-serve avg: 3-5% |
| **Trial-to-paid conversion** | 15-20% | B2B SaaS median: 18.5% |
| **CAC** | <$50 | Target at SMB SaaS low-end ($300-$700 avg) |
| **LTV** | $120-$250 | At 6-14 month avg lifetime |
| **LTV:CAC ratio** | >3:1 | Industry standard |
| **ARPU** | $14-$18 | Blended across tiers |
| **Net Revenue Retention** | >90% | Good for SMB; 100%+ with upsells |

---

## 6. Growth Model & Funnel

### Acquisition channels (ranked by expected ROI)

#### Tier 1: Free/organic (months 1-12)

| Channel | Tactic | Expected leads/mo | CAC |
|---|---|---|---|
| **Indie dev communities** | Reddit (r/gamedev, r/indiegaming), Discord servers, itch.io forums | 200-500 signups | ~$0 |
| **SEO / content** | Blog posts: "How to analyze Steam reviews", "Top issues in [genre] games 2026" | 100-300 visits | ~$0 |
| **Product Hunt / Show HN** | One-time launch events | 500-2,000 signups (burst) | ~$0 |
| **Twitter/X gaming dev community** | Sharing example analyses of popular games | 100-200 signups | ~$0 |
| **YouTube / Twitch game dev** | Demo videos, "I analyzed 10,000 reviews of X" | 50-150 signups | ~$0 |

#### Tier 2: Low-cost paid (months 6-18)

| Channel | Tactic | Expected leads/mo | CAC |
|---|---|---|---|
| **Google Ads** | "Steam review analysis", "game review analytics" keywords | 50-100 signups | $20-$50 |
| **Sponsorships** | Game dev newsletters (GameDiscoverCo, How To Market A Game) | 100-300 signups | $15-$30 |
| **Conference presence** | GDC, Gamescom indie sections — demo booth or talk | 30-80 qualified leads | $30-$60 |

#### Tier 3: Enterprise outbound (months 12+)

| Channel | Tactic | Expected leads/mo | CAC |
|---|---|---|---|
| **LinkedIn outreach** | Target community managers, producers at mid-size publishers | 10-20 qualified leads | $100-$300 |
| **Partnership / resell** | Bundle with VGInsights, Gamalytic, or publisher tooling | 5-10 accounts | $50-$100 |

### Conversion funnel model

```
Organic visitors:     1,000/mo
  → Free signups:       200/mo   (20% visitor-to-signup)
  → Activate trial:     120/mo   (60% activation — run first analysis)
  → Convert to paid:     12/mo   (10% of activated, ~6% of signups)
  → Retain 12 months:     7/mo   (58% annual retention)
```

**Steady-state: ~12 new paying customers/month, ~7 net after churn.**

---

## 7. Revenue Projections (3-Year)

### Assumptions

| Parameter | Value | Rationale |
|---|---|---|
| Free-to-paid conversion | 5% (Year 1) → 8% (Year 3) | Product improvements + social proof |
| Monthly churn | 5% (Y1) → 4% (Y2) → 3.5% (Y3) | Annual plans + stickiness |
| Tier mix (Indie/Pro/Pub/Ent) | 65/25/8/2 (Y1) → 45/30/15/10 (Y3) | Shift upmarket over time |
| Blended monthly ARPU | $13 (Y1) → $22 (Y3) | Publisher + Enterprise tiers raise ARPU |
| Monthly new paid customers | 8 (Y1) → 25 (Y3) | Channel scaling |

### Year 1: Product-Market Fit

| Quarter | New customers | Churned | Active paying | MRR | Cumulative ARR |
|---|---|---|---|---|---|
| Q1 | 15 | 2 | 13 | $169 | $2,028 |
| Q2 | 25 | 5 | 33 | $429 | $5,148 |
| Q3 | 30 | 8 | 55 | $715 | $8,580 |
| Q4 | 35 | 10 | 80 | $1,040 | $12,480 |

**Year 1 total revenue: ~$7,000-$12,000 | Exit MRR: ~$1,000 | Exit ARR: ~$12K**

### Year 2: Growth

| Quarter | New customers | Churned | Active paying | MRR | Cumulative ARR |
|---|---|---|---|---|---|
| Q1 | 40 | 12 | 108 | $1,728 | $20,736 |
| Q2 | 50 | 14 | 144 | $2,304 | $27,648 |
| Q3 | 55 | 16 | 183 | $2,928 | $35,136 |
| Q4 | 60 | 18 | 225 | $3,825 | $45,900 |

**Year 2 total revenue: ~$32,000-$45,000 | Exit MRR: ~$3,800 | Exit ARR: ~$46K**

*Key drivers: Annual plans launched (reducing churn), Publisher tier capturing higher ARPU accounts, content marketing matured.*

### Year 3: Scale

| Quarter | New customers | Churned | Active paying | MRR | Cumulative ARR |
|---|---|---|---|---|---|
| Q1 | 70 | 20 | 275 | $5,500 | $66,000 |
| Q2 | 80 | 22 | 333 | $6,660 | $79,920 |
| Q3 | 90 | 24 | 399 | $8,379 | $100,548 |
| Q4 | 100 | 26 | 473 | $10,406 | $124,872 |

**Year 3 total revenue: ~$93,000-$125,000 | Exit MRR: ~$10,400 | Exit ARR: ~$125K**

*Key drivers: Multi-platform expansion (Epic, console), enterprise accounts, partnerships.*

### Aggressive scenario (with platform expansion)

If multi-platform (App Store, Google Play, Epic) launches mid-Year 2, the addressable market expands 3-5x:

| Year | Conservative ARR | Aggressive ARR |
|---|---|---|
| 1 | $12K | $12K |
| 2 | $46K | $80K |
| 3 | $125K | $250K-$350K |

---

## 8. Expansion Strategy

### Phase 1: Deepen Steam (Months 1-12)

**Goal:** Establish SentiNext as the default Steam review analytics tool.

| Initiative | Impact | Effort |
|---|---|---|
| Annual billing | Reduces churn 30-50%, improves cash flow | Medium |
| Publisher tier ($49-$99) | Captures mid-market, +40% ARPU potential | Low |
| Public game analyses | "Top issues in Baldur's Gate 3" — viral content + SEO | Low |
| API access (Pro+) | Enables developer integrations, increases stickiness | Medium |
| Slack/Discord alerts | "New spike in crash reports" — daily value delivery | Medium |

### Phase 2: Multi-Platform (Months 12-24)

**Goal:** Expand beyond Steam to capture the broader game review market.

| Platform | Market size multiplier | Effort | Priority |
|---|---|---|---|
| **Epic Games Store** | 1.2x (smaller catalog, growing) | Low | High |
| **App Store + Google Play** | 3-5x (massive mobile market) | High | High |
| **PlayStation / Xbox** | 1.5x (console market) | Medium | Medium |
| **Metacritic / OpenCritic** | 1.1x (aggregated scores) | Low | Low |

**Mobile is the biggest unlock.** Appbot charges $49-$479/mo for mobile review analytics — proves strong willingness to pay. SentiNext's LLM classification engine is platform-agnostic.

### Phase 3: Beyond Gaming (Months 24-36)

**Goal:** Apply the same LLM taxonomy engine to other review-heavy verticals.

| Vertical | Review sources | Market size | Fit |
|---|---|---|---|
| **SaaS products** | G2, Capterra, Trustpilot | Large | High — same issue/request extraction |
| **E-commerce** | Amazon, Shopify reviews | Very large | Medium — different taxonomy needed |
| **Hospitality** | TripAdvisor, Booking.com | Large | Medium |
| **Consumer apps** | App Store, Google Play (non-gaming) | Very large | High |

This is the path from a ~$125K ARR niche product to a **$1M+ ARR horizontal platform**.

---

## 9. Key Risks & Mitigations

### Risk 1: Small market ceiling

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Steam-only TAM too small to sustain growth | High | High | Execute Phase 2 (multi-platform) by month 18 |

### Risk 2: High churn in indie segment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Indie devs churn after launch window analysis | High | Medium | Annual plans, ongoing alerts, trend tracking, chat value |

Game devs often need analytics intensely for 2-4 weeks around launch, then disengage. Counter with:
- **Automated weekly reports** (no manual action needed — keeps delivering value)
- **Competitor monitoring** ("Your competitor just got a review spike in performance issues")
- **Update impact tracking** ("Your patch improved crash sentiment by 34%")

### Risk 3: Free tools or Steam native features

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Steam adds native review analytics | Low | Critical | Speed to market + multi-platform moat |
| Free open-source alternatives emerge | Medium | Medium | Execution speed, UX polish, managed service value |

### Risk 4: LLM cost increases

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| API pricing rises, compressing margins | Low (trend is declining) | Medium | Multi-provider support already built, can switch models |

### Risk 5: Low conversion from free tier

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Users get enough from 1,000 trial credits | Medium | High | Reduce trial to 500, gate advanced features (compare, chat, export) |

---

## 10. Execution Roadmap

### Q1 2026: Foundation

- [x] Core product live (classify, dashboard, chat, compare)
- [x] Stripe billing integration
- [x] Free trial + Indie + Pro tiers
- [ ] Implement annual billing toggle (frontend + Stripe price IDs already configured)
- [ ] Launch on Product Hunt / Hacker News
- [ ] Publish 5 SEO blog posts ("Top issues in [popular game] reviews")
- [ ] Post in r/gamedev, r/indiegaming, game dev Discords

### Q2 2026: Activation & Retention

- [ ] Implement Publisher tier ($49/mo)
- [ ] Add automated weekly email reports (increases retention)
- [ ] Add Slack/Discord integration for alerts
- [ ] Optimize trial-to-paid funnel (activation emails, onboarding flow)
- [ ] Target: 30-50 paying customers, $400-$700 MRR

### Q3 2026: Content & Community

- [ ] Launch public demo analyses (showcase product on popular games)
- [ ] Sponsor 1-2 game dev newsletters
- [ ] API access for Pro+ (developer integrations)
- [ ] Begin Epic Games Store integration (R&D)
- [ ] Target: 50-80 paying customers, $700-$1,000 MRR

### Q4 2026: Expansion

- [ ] Launch Epic Games Store support
- [ ] Enterprise sales outreach (5-10 publisher targets)
- [ ] R&D for mobile platform (App Store / Google Play)
- [ ] End-of-year target: 80-120 paying customers, $1,000-$1,500 MRR

### 2027: Multi-Platform + Scale

- [ ] Launch mobile review analysis (App Store + Google Play)
- [ ] Publisher Plus tier ($99/mo)
- [ ] Partnership/resell deals with existing game analytics platforms
- [ ] End-of-year target: 225-350 paying customers, $3,000-$5,000 MRR

### 2028: Horizontal Expansion

- [ ] Console review sources (PlayStation, Xbox)
- [ ] SaaS vertical pilot (G2/Capterra review analysis)
- [ ] End-of-year target: 400-500+ paying customers, $8,000-$12,000 MRR

---

## Summary: The Numbers

| Metric | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| **Paying customers** | 80-120 | 225-350 | 400-500+ |
| **Blended ARPU** | $13/mo | $17/mo | $22/mo |
| **MRR (exit)** | $1,000-$1,500 | $3,800-$5,000 | $10,000-$12,000 |
| **ARR (exit)** | $12K-$18K | $46K-$60K | $120K-$144K |
| **Gross margin** | ~70% | ~72% | ~75% |
| **LLM COGS** | ~$1,500 | ~$6,000 | ~$18,000 |
| **Total revenue** | $7K-$12K | $32K-$50K | $93K-$140K |

**Conservative 3-year cumulative revenue: ~$130K-$200K**
**Aggressive (with multi-platform): ~$200K-$400K**

### The honest take

SentiNext as a Steam-only tool is a **lifestyle business** — it can comfortably reach $100K-$150K ARR, providing strong margins on minimal infrastructure. That's a great solo-founder outcome.

To reach **$500K+ ARR**, multi-platform expansion is non-negotiable. Mobile review analytics alone (competing with Appbot's $49-$479/mo pricing for a much larger market) could 5x the opportunity.

To reach **$1M+ ARR**, horizontal expansion beyond gaming (SaaS reviews, e-commerce) transforms the product from a niche tool into a platform — but that's effectively a different company.

**The recommended path: nail Steam → prove the model → expand to mobile → then decide whether to go horizontal or stay vertical at a comfortable scale.**

---

*Sources: Game Developer, Indie Launch Lab, GamesRadar, Data Insights Market, First Page Sage, Vitally, Appbot, VGInsights, Gamalytic, GG Insights, Mordor Intelligence*
