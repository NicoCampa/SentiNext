"""Streamlit front-end for the SentiNext Steam sentiment MVP."""
from __future__ import annotations

import pandas as pd
import streamlit as st
import altair as alt

from senti_next import (
    AUTHOR_METADATA_FIELDS,
    REVIEW_METADATA_FIELDS,
    SteamAPIError,
    build_reviews_dataframe,
    churn_signal_rate,
    core_fan_disappointment,
    early_access_vs_release_sentiment,
    fetch_reviews,
    helpfulness_summary,
    keyword_summary_by_label,
    market_quality_signal,
    patch_impact_index,
    playtime_segment_sentiment,
    recommended_share_over_time,
    recommendation_rate,
    reviewer_influence_sentiment,
    refund_risk_index,
    search_applications,
    summarize_playtime,
    summarize_sentiment,
    free_vs_paid_sentiment,
    veteran_benchmarking,
)


st.set_page_config(page_title="SentiNext", layout="wide")


THEMES = {
    "Light": {
        "background": "#d1d5db",
        "surface": "#eef1f6",
        "surface_alt": "#cbd2dc",
        "border": "#b7bec9",
        "text": "#0f172a",
        "text_muted": "#374151",
        "accent": "#2563eb",
        "accent_soft": "#c7d8ff",
        "positive": "#058e74",
        "neutral": "#94a3b8",
        "negative": "#dc2626",
        "hero_start": "#f3f4f6",
        "hero_end": "#c7ccd5",
        "sidebar": "#e4e7ec",
        "card_shadow": "0 24px 45px rgba(31, 41, 51, 0.18)",
    },
    "Dark": {
        "background": "#0f172a",
        "surface": "#111827",
        "surface_alt": "#1e293b",
        "border": "#1f2937",
        "text": "#f8fafc",
        "text_muted": "#9ca3af",
        "accent": "#6366f1",
        "accent_soft": "#312e81",
        "positive": "#4ade80",
        "neutral": "#94a3b8",
        "negative": "#f87171",
        "hero_start": "#1f2937",
        "hero_end": "#111827",
        "sidebar": "#0b1324",
        "card_shadow": "0 24px 45px rgba(15, 23, 42, 0.55)",
    },
}

SENTIMENT_DOMAIN = ["positive", "neutral", "negative"]


def _inject_theme_css(theme: dict) -> None:
    css = f"""
    <style>
        :root {{
            --senti-bg: {theme['background']};
            --senti-surface: {theme['surface']};
            --senti-surface-alt: {theme['surface_alt']};
            --senti-border: {theme['border']};
            --senti-text: {theme['text']};
            --senti-text-muted: {theme['text_muted']};
            --senti-accent: {theme['accent']};
            --senti-accent-soft: {theme['accent_soft']};
            --senti-hero-start: {theme['hero_start']};
            --senti-hero-end: {theme['hero_end']};
            --senti-sidebar: {theme['sidebar']};
            --senti-shadow: {theme['card_shadow']};
        }}

        body {{
            background: var(--senti-bg);
            color: var(--senti-text);
        }}

        [data-testid="stAppViewContainer"] > .main {{
            background:
                radial-gradient(circle at 18% 12%, rgba(255,255,255,0.22) 0%, transparent 55%),
                linear-gradient(140deg, var(--senti-bg) 0%, var(--senti-surface-alt) 100%);
        }}

        [data-testid="stSidebar"] > div:first-child {{
            background: var(--senti-sidebar);
            border-right: 1px solid var(--senti-border);
        }}

        .block-container {{
            padding-top: 1.5rem;
            padding-bottom: 4rem;
            max-width: 1180px;
        }}

        h1, h2, h3, h4, h5, h6 {{
            color: var(--senti-text);
        }}

        .senti-hero {{
            background: linear-gradient(135deg, var(--senti-hero-start) 0%, var(--senti-hero-end) 100%);
            color: var(--senti-text);
            padding: 30px 34px;
            border-radius: 26px;
            position: relative;
            overflow: hidden;
            box-shadow: var(--senti-shadow);
            margin-bottom: 2.6rem;
        }}

        .senti-hero::after {{
            content: "";
            position: absolute;
            inset: -30% -10% auto auto;
            width: 65%;
            height: 140%;
            background: radial-gradient(circle at top right, rgba(37,99,235,0.35), transparent 55%);
            pointer-events: none;
        }}

        .senti-hero h2 {{
            margin-bottom: 0.3rem;
            font-size: 2.15rem;
        }}

        .senti-hero p {{
            max-width: 540px;
            font-size: 1.05rem;
        }}

        .senti-hero .senti-tag {{
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(37, 99, 235, 0.16);
            color: var(--senti-text);
            padding: 0.35rem 0.9rem;
            border-radius: 999px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }}

        div[data-testid="metric-container"] {{
            background: var(--senti-surface);
            border: 1px solid var(--senti-border);
            border-radius: 18px;
            padding: 20px;
            box-shadow: var(--senti-shadow);
        }}

        div[data-testid="metric-container"] > label {{
            color: var(--senti-text-muted);
            font-weight: 600;
        }}

        div[data-testid="metric-container"] span[data-testid="stMetricValue"] {{
            color: var(--senti-text);
        }}

        .stDataFrame {{
            border-radius: 20px;
            overflow: hidden;
            background: linear-gradient(135deg, rgba(255,255,255,0.65) 0%, var(--senti-surface) 65%);
            box-shadow: var(--senti-shadow);
        }}

        .senti-card {{
            background: var(--senti-surface);
            border: 1px solid var(--senti-border);
            border-radius: 24px;
            padding: 30px;
            margin-bottom: 2.1rem;
            box-shadow: var(--senti-shadow);
        }}

        button[data-baseweb="tab"] {{
            color: var(--senti-text-muted);
            border-radius: 999px;
            margin-right: 0.65rem;
        }}

        button[data-baseweb="tab"][aria-selected="true"] {{
            background: linear-gradient(135deg, rgba(37, 99, 235, 0.18) 0%, rgba(37, 99, 235, 0.05) 100%);
            color: var(--senti-text);
            box-shadow: inset 0 0 0 2px var(--senti-accent);
        }}

        .stTextInput > div > input,
        .stSelectbox > div > div,
        .stSlider > div > div > div,
        .stTextArea textarea {{
            background: var(--senti-surface);
            color: var(--senti-text);
            border-radius: 16px;
            border: 1px solid var(--senti-border);
        }}

        .stButton > button {{
            background: linear-gradient(130deg, {theme['accent']} 0%, #8b5cf6 100%);
            border: none;
            color: white;
            border-radius: 16px;
            padding: 0.65rem 1.9rem;
            font-weight: 600;
            box-shadow: 0 28px 38px rgba(37, 99, 235, 0.28);
        }}

        .stButton > button:disabled {{
            background: var(--senti-border) !important;
            color: var(--senti-text-muted) !important;
            box-shadow: none !important;
        }}
    </style>
    """
    st.markdown(css, unsafe_allow_html=True)


def _configure_chart(chart: alt.Chart, theme: dict) -> alt.Chart:
    return (
        chart.configure(background=theme["surface"])
        .configure_view(strokeOpacity=0)
        .configure_axis(
            labelColor=theme["text_muted"],
            titleColor=theme["text_muted"],
            gridColor=theme["border"],
        )
        .configure_legend(titleColor=theme["text_muted"], labelColor=theme["text_muted"])
    )


def _format_option(option) -> str:
    price = option.price or ""
    price_display = f" · {price}" if price else ""
    return f"{option.name}{price_display} (AppID {option.appid})"


@st.cache_data(show_spinner=False)
def cached_reviews(app_id: int, review_count: int, language: str) -> pd.DataFrame:
    raw_reviews = fetch_reviews(app_id, count=review_count, language=language)
    return build_reviews_dataframe(raw_reviews)


def _render_segment_table(df_to_render: pd.DataFrame) -> None:
    if df_to_render.empty or ("reviews" in df_to_render and df_to_render["reviews"].sum() == 0):
        st.info("Not enough data for this view yet.")
        return

    display_df = df_to_render.copy()
    if "threshold" in display_df.columns:
        display_df["threshold"] = display_df["threshold"].round(0)

    for col in ["avg_compound"]:
        if col in display_df.columns:
            display_df[col] = display_df[col].round(2)

    for col in ["recommendation_rate", "share_positive", "share_negative"]:
        if col in display_df.columns:
            display_df[col] = (display_df[col] * 100).round(1)

    st.dataframe(display_df)


def prepare_insight_data(df: pd.DataFrame) -> dict:
    if df.empty:
        return {}

    metrics = summarize_sentiment(df)
    playtime = summarize_playtime(df)
    helpful = helpfulness_summary(df)
    recommendation = recommendation_rate(df)
    trend_df = recommended_share_over_time(df)

    sentiment_counts = (
        df["sentiment_label"]
        .value_counts()
        .rename_axis("sentiment")
        .reset_index(name="count")
    )

    insights = {
        "metrics": metrics,
        "playtime": playtime,
        "helpful": helpful,
        "recommendation": recommendation,
        "trend_df": trend_df,
        "sentiment_counts": sentiment_counts,
        "early_access_df": early_access_vs_release_sentiment(df),
        "free_vs_paid_df": free_vs_paid_sentiment(df),
        "playtime_segments_df": playtime_segment_sentiment(df),
        "reviewer_influence_df": reviewer_influence_sentiment(df),
        "veteran_df": veteran_benchmarking(df),
        "market_quality_df": market_quality_signal(df),
        "top_positive": pd.DataFrame(keyword_summary_by_label(df, "positive", top_n=10)),
        "top_negative": pd.DataFrame(keyword_summary_by_label(df, "negative", top_n=10)),
        "refund_risk": refund_risk_index(df),
        "core_fan": core_fan_disappointment(df),
        "default_churn_window": 7,
    }

    return insights


def render_insight_panels(
    df: pd.DataFrame,
    insights: dict,
    theme: dict,
    key_prefix: str,
) -> None:
    if not insights:
        st.info("Insights unavailable for this dataset.")
        return

    metrics = insights["metrics"]
    playtime = insights["playtime"]
    helpful = insights["helpful"]
    recommendation = insights["recommendation"]

    metric_col_1, metric_col_2, metric_col_3, metric_col_4 = st.columns(4)
    metric_col_1.metric("Avg. compound", f"{metrics['average_compound']:.2f}")
    metric_col_2.metric("Positive", f"{metrics['share_positive']*100:.0f}%")
    metric_col_3.metric("Neutral", f"{metrics['share_neutral']*100:.0f}%")
    metric_col_4.metric("Negative", f"{metrics['share_negative']*100:.0f}%")

    extra_col_1, extra_col_2, extra_col_3 = st.columns(3)
    extra_col_1.metric("Recommendation rate", f"{recommendation*100:.0f}%")
    extra_col_2.metric("Median playtime", f"{playtime['median_playtime_hours']:.1f} h")
    extra_col_3.metric("Helpful votes", f"{helpful['average_votes_up']:.1f}")

    st.markdown("<div class='senti-divider'></div>", unsafe_allow_html=True)
    trend_tab, segments_tab, audience_tab, risk_tab, topics_tab = st.tabs(
        [
            "Trends",
            "Player segments",
            "Audience cohorts",
            "Risk signals",
            "Topics",
        ]
    )

    with trend_tab:
        st.markdown("**Sentiment mix**")
        sentiment_scale = alt.Scale(
            domain=SENTIMENT_DOMAIN,
            range=[theme["positive"], theme["neutral"], theme["negative"]],
        )
        sentiment_chart = (
            alt.Chart(insights["sentiment_counts"])
            .mark_bar(cornerRadiusTopLeft=8, cornerRadiusTopRight=8)
            .encode(
                x=alt.X("sentiment:N", title="Sentiment"),
                y=alt.Y("count:Q", title="Reviews"),
                color=alt.Color("sentiment:N", scale=sentiment_scale, legend=None),
                tooltip=["sentiment", "count"],
            )
            .properties(height=250)
        )
        st.altair_chart(_configure_chart(sentiment_chart, theme), use_container_width=True)

        st.markdown("**Recommendation share over time**")
        event_col_1, event_col_2 = st.columns([3, 1])
        event_input = event_col_1.text_input(
            "Patch/event date (YYYY-MM-DD)",
            value="",
            help="Optional: compare sentiment 14 days before/after a launch, patch, or event.",
            key=f"{key_prefix}_event_date",
        )
        window_days = int(
            event_col_2.slider(
                "Impact window (days)",
                min_value=7,
                max_value=30,
                value=14,
                step=1,
                key=f"{key_prefix}_impact_window",
            )
        )
        event_date = None
        if event_input:
            parsed = pd.to_datetime(event_input, errors="coerce")
            if pd.isna(parsed):
                event_col_1.warning("Could not parse the date. Use YYYY-MM-DD.")
            else:
                event_date = parsed

        trend_df = insights["trend_df"]
        if trend_df.empty:
            st.info("Not enough timestamped reviews to build a trend line yet.")
        else:
            line = (
                alt.Chart(trend_df)
                .mark_line(point=alt.OverlayMarkDef(size=80, fill=theme["accent"], stroke=theme["accent"]))
                .encode(
                    x=alt.X("period:T", title="Review period"),
                    y=alt.Y(
                        "recommendation_rate:Q",
                        axis=alt.Axis(format="%"),
                        title="% recommended",
                    ),
                    tooltip=[
                        alt.Tooltip("period:T", title="Period"),
                        alt.Tooltip("recommendation_rate:Q", title="% recommended", format=".1%"),
                        alt.Tooltip("avg_compound:Q", title="Avg. compound", format=".2f"),
                        alt.Tooltip("reviews:Q", title="Reviews"),
                    ],
                    color=alt.value(theme["accent"]),
                )
            )

            chart = _configure_chart(line.properties(height=280), theme)
            if event_date is not None:
                event_df = pd.DataFrame({"period": [event_date]})
                marker = (
                    alt.Chart(event_df)
                    .mark_rule(color="#f97316", strokeDash=[6, 3])
                    .encode(x="period:T")
                )
                chart = chart + marker

            st.altair_chart(chart, use_container_width=True)

        if event_date is not None:
            impact = patch_impact_index(df, event_date, window_days=window_days)
            if impact:
                impact_col_1, impact_col_2 = st.columns(2)
                impact_col_1.metric(
                    "Patch impact: avg compound",
                    f"{impact['after_avg_compound']:.2f}",
                    delta=f"{impact['delta_avg_compound']:+.2f}",
                )
                impact_col_2.metric(
                    "Patch impact: % recommended",
                    f"{impact['after_recommendation_rate']*100:.0f}%",
                    delta=f"{impact['delta_recommendation_rate']*100:+.0f}%",
                )
                st.caption(
                    f"Before window: {impact['before_reviews']} reviews · After window: {impact['after_reviews']} reviews"
                )
            else:
                st.info("Not enough reviews around that date to compute a patch impact index.")

    with segments_tab:
        seg_col_1, seg_col_2 = st.columns(2)
        with seg_col_1:
            st.markdown("**Early access vs release**")
            _render_segment_table(insights["early_access_df"])

        with seg_col_2:
            st.markdown("**Free vs paid cohorts**")
            _render_segment_table(insights["free_vs_paid_df"])

        st.markdown("**Playtime segments**")
        _render_segment_table(insights["playtime_segments_df"])

    with audience_tab:
        st.markdown("**Reviewer influence**")
        _render_segment_table(insights["reviewer_influence_df"])

        st.markdown("**Veteran benchmarking**")
        _render_segment_table(insights["veteran_df"])

        st.markdown("**Market quality signal**")
        _render_segment_table(insights["market_quality_df"])

    with risk_tab:
        churn_window = st.slider(
            "Churn window (days)",
            min_value=1,
            max_value=30,
            value=insights.get("default_churn_window", 7),
            step=1,
            key=f"{key_prefix}_churn_window",
        )
        refund = insights["refund_risk"]
        core_fans = insights["core_fan"]
        churn = churn_signal_rate(df, window_days=churn_window)

        risk_col_1, risk_col_2, risk_col_3 = st.columns(3)
        risk_col_1.metric("Refund risk index", f"{refund*100:.0f}%")
        risk_col_2.metric("Core fan disappointment", f"{core_fans*100:.0f}%")
        risk_col_3.metric("Likely churners", f"{churn*100:.0f}%")
        st.caption(
            "Refund risk: negative reviews with <2h playtime · Core fans: negative reviews with >50h · Churners: negative reviews within the selected window of last play."
        )

    with topics_tab:
        keyword_col_1, keyword_col_2 = st.columns(2)
        keyword_col_1.markdown("**Positive review topics**")
        keyword_col_1.dataframe(insights["top_positive"])

        keyword_col_2.markdown("**Negative review topics**")
        keyword_col_2.dataframe(insights["top_negative"])

    with st.expander("Raw review data"):
        st.dataframe(
            df[
                [
                    "review",
                    "sentiment_label",
                    "sentiment_compound",
                    "voted_up",
                    "votes_up",
                    "author_playtime_forever",
                    "author_playtime_last_two_weeks",
                ]
            ]
        )


def render_comparison_section(
    starred_games: dict,
    theme: dict,
    selected_appids: list[int],
) -> None:
    if len(selected_appids) < 2:
        st.info("Pick at least two starred titles in the sidebar to see comparisons here.")
        return

    rows = []
    for appid in selected_appids:
        record = starred_games.get(appid)
        if not record:
            continue
        df = record.get("df")
        if df is None or df.empty:
            continue

        insights = record.get("insights") or prepare_insight_data(df)
        record["insights"] = insights

        metrics = insights["metrics"]
        playtime = insights["playtime"]
        helpful = insights["helpful"]

        rows.append(
            {
                "Game": record["name"],
                "Avg compound": metrics["average_compound"],
                "% positive": metrics["share_positive"] * 100,
                "% negative": metrics["share_negative"] * 100,
                "% recommended": insights["recommendation"] * 100,
                "Median playtime (h)": playtime["median_playtime_hours"],
                "Helpful votes": helpful["average_votes_up"],
                "Refund risk %": insights["refund_risk"] * 100,
                "Core-fan disappointment %": insights["core_fan"] * 100,
            }
        )

    if not rows:
        st.info("Comparison data is not available for the selected games.")
        return

    compare_df = pd.DataFrame(rows)
    st.dataframe(compare_df)

    chart_df = compare_df.rename(
        columns={
            "% recommended": "pct_recommended",
            "Median playtime (h)": "median_playtime",
        }
    )

    rec_chart = (
        alt.Chart(chart_df)
        .mark_bar(cornerRadiusTopLeft=8, cornerRadiusTopRight=8)
        .encode(
            x=alt.X("Game:N", title="Game"),
            y=alt.Y("pct_recommended:Q", title="% recommended"),
            color=alt.value(theme["accent"]),
            tooltip=[
                alt.Tooltip("Game:N", title="Game"),
                alt.Tooltip("pct_recommended:Q", title="% recommended", format=".1f"),
                alt.Tooltip("median_playtime:Q", title="Median playtime (h)", format=".1f"),
            ],
        )
        .properties(height=280)
    )
    st.altair_chart(_configure_chart(rec_chart, theme), use_container_width=True)

    scatter = (
        alt.Chart(chart_df)
        .mark_circle(size=180)
        .encode(
            x=alt.X("median_playtime:Q", title="Median playtime (h)"),
            y=alt.Y("pct_recommended:Q", title="% recommended"),
            color=alt.value(theme["accent"]),
            tooltip=[
                alt.Tooltip("Game:N", title="Game"),
                alt.Tooltip("median_playtime:Q", title="Median playtime (h)", format=".1f"),
                alt.Tooltip("pct_recommended:Q", title="% recommended", format=".1f"),
            ],
        )
        .properties(height=260)
    )
    st.altair_chart(_configure_chart(scatter, theme), use_container_width=True)
if "theme" not in st.session_state:
    st.session_state["theme"] = "Light"

if "starred_games" not in st.session_state:
    st.session_state["starred_games"] = {}

if "last_starred_message" not in st.session_state:
    st.session_state["last_starred_message"] = None

if "active_star_appid" not in st.session_state:
    st.session_state["active_star_appid"] = None

if "comparison_selection" not in st.session_state:
    st.session_state["comparison_selection"] = []

with st.sidebar:
    st.markdown("### Display")
    theme_choice = st.radio(
        "Interface mode",
        options=list(THEMES.keys()),
        index=list(THEMES.keys()).index(st.session_state["theme"]),
    )
    st.session_state["theme"] = theme_choice
    st.divider()

    st.markdown("### Review filters")
    language = st.selectbox("Review language", options=["english", "all"], index=0)
    review_count = st.slider("Number of reviews", min_value=20, max_value=400, value=120, step=20)

    starred_games_sidebar = st.session_state["starred_games"]
    st.markdown("---")
    st.markdown("### ⭐ Starred workspace")
    if starred_games_sidebar:
        options = []
        for appid, record in starred_games_sidebar.items():
            label = f"{record['name']} (AppID {appid})"
            options.append((label, appid))

        labels = [label for label, _ in options]
        label_to_appid = {label: appid for label, appid in options}

        current_active = st.session_state.get("active_star_appid")
        if current_active not in [appid for _, appid in options]:
            current_active = options[0][1]
            st.session_state["active_star_appid"] = current_active

        default_index = 0
        for idx, (_, appid) in enumerate(options):
            if appid == current_active:
                default_index = idx
                break

        active_label = st.selectbox(
            "Focus starred game",
            labels,
            index=default_index,
            key="sidebar_focus_star",
        )
        active_appid = label_to_appid[active_label]
        st.session_state["active_star_appid"] = active_appid

        remove_col, refresh_col = st.columns([1, 1])
        with remove_col:
            if st.button("Remove", key="sidebar_remove_star"):
                st.session_state["starred_games"].pop(active_appid, None)
                st.session_state["active_star_appid"] = None
                compare_trimmed = [appid for appid in st.session_state.get("comparison_selection", []) if appid != active_appid]
                st.session_state["comparison_selection"] = compare_trimmed
                st.experimental_rerun()

        with refresh_col:
            if st.button("Refresh data", key="sidebar_refresh_star"):
                record = st.session_state["starred_games"].get(active_appid)
                if record:
                    with st.spinner("Refreshing cached reviews..."):
                        try:
                            refreshed_df = cached_reviews(active_appid, review_count, record.get("language", "english"))
                        except SteamAPIError as exc:
                            st.error(f"Refresh failed: {exc}")
                        else:
                            record["df"] = refreshed_df
                            record["review_count"] = int(refreshed_df.shape[0])
                            record["insights"] = prepare_insight_data(refreshed_df)
                            record["starred_at"] = pd.Timestamp.utcnow()
                            st.session_state["starred_games"][active_appid] = record
                            st.success("Starred dataset refreshed.")

        if len(options) >= 2:
            st.markdown("#### Compare")
            current_selection = st.session_state.get("comparison_selection", [])
            current_labels = [label for label, appid in options if appid in current_selection]
            if len(current_labels) < 2:
                default_labels = labels[:2]
            else:
                default_labels = current_labels

            selected_compare_labels = st.multiselect(
                "Select games",
                labels,
                default=default_labels,
                help="Pick two or more starred titles to populate the comparison view in the main area.",
                key="sidebar_compare_multiselect",
            )
            st.session_state["comparison_selection"] = [label_to_appid[label] for label in selected_compare_labels]
    else:
        st.caption("Star a game after analyzing it to pin its dataset here for instant recall and comparison.")

theme = THEMES[st.session_state["theme"]]
_inject_theme_css(theme)

st.markdown(
    """
    <div class="senti-hero">
        <span class="senti-tag">Steam intelligence</span>
        <h2>Understand your community's pulse in seconds</h2>
        <p>Search any Steam title to track sentiment momentum, patch impact, fan satisfaction, and risk signals across cohesive visual insights.</p>
    </div>
    """,
    unsafe_allow_html=True,
)

if st.session_state["last_starred_message"]:
    st.success(st.session_state["last_starred_message"])
    st.session_state["last_starred_message"] = None

starred_count = len(st.session_state["starred_games"])
if starred_count:
    st.info(
        f"⭐ {starred_count} game{'s' if starred_count != 1 else ''} starred. Use the sidebar workspace below the filters to focus or compare them."
    )

query = st.text_input(
    "Game name or store URL",
    placeholder="e.g. Baldur's Gate 3 or https://store.steampowered.com/app/1086940",
)

selected_app_id = None
selected_app_label = None

if query:
    try:
        options = search_applications(query, limit=5)
    except SteamAPIError as exc:
        st.error(f"Could not search for games: {exc}")
        options = []

    if options:
        option_map = {_format_option(opt): opt for opt in options}
        choice = st.selectbox("Pick the correct game", options=list(option_map.keys()))
        selected = option_map[choice]
        selected_app_id = selected.appid
        selected_app_label = selected.name
    else:
        st.warning("No games found with that name. Try a different spelling or paste a direct store link.")

run_button = st.button("Analyze reviews", type="primary", disabled=selected_app_id is None)

if run_button and selected_app_id is None:
    st.warning("Please search and select a game first.")

if run_button and selected_app_id is not None:
    with st.spinner("Fetching reviews from Steam..."):
        try:
            df = cached_reviews(selected_app_id, review_count, language)
        except SteamAPIError as exc:
            st.error(f"Review fetch failed: {exc}")
            df = pd.DataFrame()
        except Exception as exc:  # noqa: BLE001
            st.error(f"Unexpected error while fetching reviews: {exc}")
            df = pd.DataFrame()

    if df.empty:
        st.info("No reviews returned. Try increasing the number of reviews or switching languages.")
    else:
        st.subheader(f"Results for {selected_app_label} ({df.shape[0]} reviews)")
        st.caption(
            f"Language: {language} · Reviews fetched: {df.shape[0]} · Updated {pd.Timestamp.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"
        )

        insights = prepare_insight_data(df)
        starred_games = st.session_state["starred_games"]
        is_starred = selected_app_id in starred_games
        star_label = "⭐ Star this game" if not is_starred else "✅ Update star"

        star_col, _ = st.columns([1, 5])
        with star_col:
            if st.button(star_label, key="star_current"):
                updated_stars = dict(st.session_state["starred_games"])
                updated_stars[selected_app_id] = {
                    "appid": selected_app_id,
                    "name": selected_app_label,
                    "df": df.copy(),
                    "language": language,
                    "review_count": int(df.shape[0]),
                    "insights": insights,
                    "starred_at": pd.Timestamp.utcnow(),
                }
                st.session_state["starred_games"] = updated_stars
                st.session_state["active_star_appid"] = selected_app_id
                if len(updated_stars) >= 2:
                    existing_compare = st.session_state.get("comparison_selection", [])
                    if len(existing_compare) < 2:
                        st.session_state["comparison_selection"] = list(updated_stars.keys())[-2:]
                    elif selected_app_id not in existing_compare:
                        st.session_state["comparison_selection"] = (existing_compare + [selected_app_id])[-3:]
                st.session_state["last_starred_message"] = (
                    f"Saved {selected_app_label} to the Starred workspace. Analyze another game and star it to compare side by side."
                )
                st.experimental_rerun()

        render_insight_panels(df, insights, theme, key_prefix=f"current_{selected_app_id}")


starred_games_state = st.session_state["starred_games"]
active_star_appid = st.session_state.get("active_star_appid")

if starred_games_state and active_star_appid in starred_games_state:
    st.markdown("## ⭐ Focus starred game")
    record = starred_games_state[active_star_appid]
    starred_at = record.get("starred_at")
    if isinstance(starred_at, pd.Timestamp):
        starred_display = starred_at.strftime("%Y-%m-%d %H:%M UTC")
    else:
        starred_display = str(starred_at) if starred_at else "Unknown"

    st.caption(
        f"AppID {active_star_appid} · Language: {record.get('language', 'n/a')} · Reviews cached: {record.get('review_count', 'n/a')} · Updated {starred_display}"
    )

    stored_df = record.get("df")
    if stored_df is None or stored_df.empty:
        st.info("Cached review data unavailable for this title.")
    else:
        insights = record.get("insights") or prepare_insight_data(stored_df)
        record["insights"] = insights
        render_insight_panels(stored_df, insights, theme, key_prefix=f"star_{active_star_appid}")

comparison_selection = st.session_state.get("comparison_selection", [])
if starred_games_state and len(comparison_selection) >= 2:
    st.markdown("## 🔍 Comparison")
    render_comparison_section(starred_games_state, theme, comparison_selection)

with st.expander("What data does the Steam reviews API expose?"):
    st.write("Review-level fields (per review):")
    st.table(pd.DataFrame([
        {"field": name, "description": description}
        for name, description in REVIEW_METADATA_FIELDS.items()
    ]))

    st.write("Author-level fields (nested under each review):")
    st.table(pd.DataFrame([
        {"field": name, "description": description}
        for name, description in AUTHOR_METADATA_FIELDS.items()
    ]))

st.caption(
    "Notes: Steam returns reviews in pages of 20-100 items. The tool requests more pages"
    " as needed until the selected count is reached. Sentiment scores are computed using"
    " VADER. All processing happens client-side."
)
