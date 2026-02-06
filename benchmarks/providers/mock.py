from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass

from .base import ProviderResponse, TokenUsage


@dataclass(frozen=True)
class MockProvider:
    provider_name: str = "mock"

    def generate(
        self,
        *,
        prompt: str,
        model: str,
        temperature: float,
        max_tokens: int,
        timeout_s: int,
        retries: int,
        response_mime_type: str | None = None,
        response_json_schema: dict | None = None,
    ) -> ProviderResponse:
        t0 = time.perf_counter()

        text = self._mock_response(prompt)
        latency_ms = int((time.perf_counter() - t0) * 1000)

        # Provide fake usage for cost/aggregation plumbing.
        usage = TokenUsage(prompt_tokens=min(500, len(prompt) // 4), completion_tokens=min(200, len(text) // 4))
        usage = TokenUsage(prompt_tokens=usage.prompt_tokens, completion_tokens=usage.completion_tokens, total_tokens=(usage.prompt_tokens or 0) + (usage.completion_tokens or 0))
        return ProviderResponse(provider=self.provider_name, model=model, text=text, latency_ms=latency_ms, usage=usage, raw={"mock": True})

    def _mock_response(self, prompt: str) -> str:
        p = prompt.lower()

        # Judge prompt
        if "\"criteria\"" in p and "\"faithfulness\"" in p and "\"overall\"" in p:
            payload = {
                "overall": 82,
                "label": "good",
                "criteria": {"format": 90, "faithfulness": 80, "usefulness": 80, "completeness": 75},
                "notes": "Mock judge output.",
                "failures": [],
            }
            return json.dumps(payload, ensure_ascii=False)

        # Review labeling
        if "\"subcategories\"" in p and "\"evidence\"" in p and "taxonomy" in p:
            m = re.search(r'REVIEW:\s+"""(.*?)"""', prompt, flags=re.IGNORECASE | re.DOTALL)
            review_text = (m.group(1) if m else prompt).strip()
            t = review_text.lower()

            subcategories: list[str] = []
            if any(k in t for k in ["fps", "frame", "framerate", "performance", "stutter", "lag", "drops", "freeze"]):
                subcategories.append("technical/performance")
            if any(k in t for k in ["bug", "bugs", "glitch", "broken", "crash", "ctd", "corrupt", "stuck"]):
                subcategories.append("technical/bugs")
            if any(k in t for k in ["menu", "ui", "hud", "settings", "keybind", "fov", "controller"]):
                subcategories.append("ui_ux_accessibility/quality_of_life")
            if any(k in t for k in ["price", "pricing", "worth", "value", "dlc", "microtransaction"]):
                subcategories.append("monetization_value/pricing")
            if any(k in t for k in ["translation", "localization", "subtitles", "dub", "language", "übersetz", "traduz"]):
                subcategories.append("presentation/localization")

            # Ensure at least one tag and cap to keep output small.
            if not subcategories:
                subcategories = ["other/general"]
            subcategories = list(dict.fromkeys(subcategories))[:3]

            is_request = any(k in t for k in ["please", "i wish", "would love", "por favor", "per favore", "bitte", "me gustaría"])
            is_issue = any(k in t for k in ["bug", "crash", "ctd", "fps", "stutter", "lag", "freeze", "corrupt", "broken"])

            issue_subcategories = subcategories[:] if is_issue else []
            request_subcategories = subcategories[:] if is_request else []

            def pick_quote(keyword_candidates: list[str]) -> str:
                for kw in keyword_candidates:
                    idx = t.find(kw)
                    if idx >= 0:
                        start = max(0, idx - 20)
                        end = min(len(review_text), idx + 40)
                        q = review_text[start:end].strip()
                        return q[:160]
                return review_text[:120].strip()[:160]

            evidence: dict[str, list[str]] = {}
            for sub in subcategories:
                if sub == "technical/performance":
                    q = pick_quote(["fps", "performance", "stutter", "lag", "drops"])
                elif sub == "technical/bugs":
                    q = pick_quote(["bug", "bugs", "glitch", "broken", "crash", "ctd", "corrupt"])
                elif sub == "ui_ux_accessibility/quality_of_life":
                    q = pick_quote(["menu", "ui", "hud", "settings", "keybind", "fov", "controller"])
                elif sub == "monetization_value/pricing":
                    q = pick_quote(["price", "worth", "value", "dlc", "microtransaction"])
                elif sub == "presentation/localization":
                    q = pick_quote(["translation", "localization", "subtitles", "dub", "language"])
                else:
                    q = review_text[:120].strip()[:160]
                evidence[sub] = [q] if q else [review_text[:50]]

            payload = {
                "subcategories": subcategories,
                "issue_subcategories": issue_subcategories,
                "request_subcategories": request_subcategories,
                "evidence": evidence,
            }
            return json.dumps(payload, ensure_ascii=False)

        # Subcategory summary
        if "\"pros\"" in p and "\"cons\"" in p and "\"summary\"" in p:
            payload = {
                "summary": "Overall, players like the feature but report some issues.",
                "pros": ["Responsive controls", "Great visuals"],
                "cons": ["Performance drops in crowded areas", "Occasional bugs"],
            }
            return json.dumps(payload, ensure_ascii=False)

        # Monthly report
        if "\"key_points\"" in p and "\"actions\"" in p and "recommendation rate" in p:
            payload = {
                "summary": "This period shows stable engagement with a few recurring issues.",
                "key_points": ["Recommendation rate is steady.", "Top issue: performance spikes.", "Top request: QoL improvements."],
                "actions": ["Prioritize performance optimization.", "Fix the most common crash/bug reports.", "Ship a QoL patch targeting menus and settings."],
            }
            return json.dumps(payload, ensure_ascii=False)

        # Compare games
        if "\"winners\"" in p and "\"strengths_per_game\"" in p and "\"weaknesses_per_game\"" in p:
            payload = {
                "summary": "Game A leads on performance while Game B wins on content variety.",
                "winners": {"performance": [1], "content": [2]},
                "key_differences": ["Game A has higher recommendation rate.", "Game B is praised for quests and replayability."],
                "strengths_per_game": {1: ["Stable framerate"], 2: ["More varied content"]},
                "weaknesses_per_game": {1: ["Thin endgame"], 2: ["More bugs reported"]},
                "recommendations": {1: "Best for players who value performance.", 2: "Best for players who want variety."},
            }
            return json.dumps(payload, ensure_ascii=False)

        # Translation
        if "\"translations\"" in p:
            # Parse the JSON array embedded in the prompt.
            items: list[dict] = []
            blob = None
            marker_a = "INPUT ITEMS (JSON):"
            marker_b = "OUTPUT JSON SCHEMA"
            a = prompt.lower().find(marker_a.lower())
            b = prompt.lower().find(marker_b.lower())
            if a >= 0 and b > a:
                segment = prompt[a:b]
                start = segment.find("[")
                end = segment.rfind("]")
                if start >= 0 and end > start:
                    blob = segment[start : end + 1]
            if blob is None:
                start = prompt.find("[")
                end = prompt.rfind("]")
                if start >= 0 and end > start:
                    blob = prompt[start : end + 1]
            if blob:
                try:
                    parsed = json.loads(blob)
                    if isinstance(parsed, list):
                        items = [x for x in parsed if isinstance(x, dict)]
                except Exception:
                    items = []

            translations = []
            for it in items:
                tid = str(it.get("id") or "")
                text = str(it.get("text") or "")
                translations.append({"id": tid, "english": f"[EN] {text}".strip()})
            if not translations:
                translations = [{"id": "unknown", "english": "[EN] Mock translation."}]
            return json.dumps({"translations": translations}, ensure_ascii=False)

        return json.dumps({"ok": True}, ensure_ascii=False)
