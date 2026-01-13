from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi.responses import HTMLResponse


def _html_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def render_single_report(app_id: int, name: str, metadata: dict, insights: dict | None) -> HTMLResponse:
    timestamp = datetime.utcnow().isoformat()
    body = f"""
    <html>
    <head>
        <title>SentiNext Report - {app_id}</title>
        <style>
            body {{ font-family: Arial, sans-serif; background:#0f172a; color:#e2e8f0; padding:24px; }}
            .card {{ background:#111827; border:1px solid #1f2937; border-radius:12px; padding:16px; margin-bottom:16px; }}
            h1,h2,h3 {{ margin:0 0 8px 0; }}
            .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }}
            .pill {{ display:inline-block; padding:4px 10px; border-radius:999px; background:#1e293b; margin-right:6px; font-size:12px; }}
        </style>
    </head>
    <body>
        <h1>SentiNext Report</h1>
        <p>Game: {_html_escape(name)} (app {app_id}) • Generated {timestamp} UTC</p>
        <div class="card">
            <h2>Summary</h2>
            <p>Requested: {metadata.get("requested", 0)} • Retrieved: {metadata.get("retrieved", 0)} • Language: {metadata.get("language")}</p>
            <p>Fetched at: {metadata.get("fetched_at")}</p>
        </div>
    """
    if insights:
        metrics = insights.get("metrics", {})
        llm = insights.get("llm", {})
        body += f"""
        <div class="card">
            <h2>Metrics</h2>
            <div class="grid">
                <div><strong>Recommendation</strong><br>{round(insights.get("recommendation",0)*100)}%</div>
                <div><strong>Avg compound</strong><br>{metrics.get("average_compound",0):.2f}</div>
                <div><strong>Issue rate</strong><br>{llm.get("issue_rate",0)*100:.0f}%</div>
                <div><strong>Request rate</strong><br>{llm.get("feature_request_rate",0)*100:.0f}%</div>
                <div><strong>Coverage</strong><br>{llm.get("coverage_rate",0)*100:.0f}%</div>
            </div>
        </div>
        """
        subcats = insights.get("subcategory_insights") or []
        if isinstance(subcats, list) and subcats:
            issue_subcats = [item for item in subcats if (item.get("issue_count", 0) or 0) > 0]
            request_subcats = [item for item in subcats if (item.get("request_count", 0) or 0) > 0]
            if issue_subcats:
                issue_subcats.sort(key=lambda item: item.get("issue_count", 0), reverse=True)
                body += "<div class='card'><h2>Top Issue Subcategories</h2><div class='grid'>"
                for entry in issue_subcats[:6]:
                    label = _html_escape(str(entry.get("subcategory", "") or entry.get("sub_category", "")))
                    count = entry.get("issue_count", 0)
                    body += f"<div><strong>{label}</strong><br>{count} mentions</div>"
                body += "</div></div>"
            if request_subcats:
                request_subcats.sort(key=lambda item: item.get("request_count", 0), reverse=True)
                body += "<div class='card'><h2>Top Request Subcategories</h2><div class='grid'>"
                for entry in request_subcats[:6]:
                    label = _html_escape(str(entry.get("subcategory", "") or entry.get("sub_category", "")))
                    count = entry.get("request_count", 0)
                    body += f"<div><strong>{label}</strong><br>{count} mentions</div>"
                body += "</div></div>"
    else:
        body += "<div class='card'><p>No insights available.</p></div>"

    body += "</body></html>"
    return HTMLResponse(content=body)


def render_compare_report(games: List[dict]) -> HTMLResponse:
    timestamp = datetime.utcnow().isoformat()
    body = f"""
    <html>
    <head>
        <title>SentiNext Comparison</title>
        <style>
            body {{ font-family: Arial, sans-serif; background:#0f172a; color:#e2e8f0; padding:24px; }}
            .card {{ background:#111827; border:1px solid #1f2937; border-radius:12px; padding:16px; margin-bottom:16px; }}
            h1,h2,h3 {{ margin:0 0 8px 0; }}
            .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }}
        </style>
    </head>
    <body>
        <h1>Comparison Report</h1>
        <p>Generated {timestamp} UTC</p>
    """
    for game in games:
        ins = game.get("insights") or {}
        metrics = ins.get("metrics", {})
        llm = ins.get("llm", {})
        body += f"""
        <div class="card">
            <h2>{_html_escape(game.get('name','Unknown'))} (app {game.get('app_id')})</h2>
            <div class="grid">
                <div><strong>Recommendation</strong><br>{round(ins.get('recommendation',0)*100)}%</div>
                <div><strong>Avg compound</strong><br>{metrics.get("average_compound",0):.2f}</div>
                <div><strong>Issue rate</strong><br>{llm.get("issue_rate",0)*100:.0f}%</div>
                <div><strong>Request rate</strong><br>{llm.get("feature_request_rate",0)*100:.0f}%</div>
            </div>
        </div>
        """
    body += "</body></html>"
    return HTMLResponse(content=body)
