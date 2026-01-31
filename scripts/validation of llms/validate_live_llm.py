#!/usr/bin/env python3
"""Validate live LLM classification quality against Steam reviews.

Flow:
1) Fetch reviews from Steam.
2) Classify them using the project prompt/model pipeline.
3) Ask a judge model to verify the labels.
4) Write per-review results + a summary report.

Outputs go to: scripts/validation of llms/
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Iterable, List, Optional


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.senti_next import llm  # type: ignore
from backend.senti_next.steam_api import extract_app_id_from_input, fetch_app_details, fetch_reviews  # type: ignore

JSON_OBJ_RE = re.compile(r"\{.*\}", re.DOTALL)
ENV_PATH = Path(__file__).resolve().parent / ".env"


def _load_env_file() -> None:
    if not ENV_PATH.exists():
        return
    try:
        content = ENV_PATH.read_text(encoding="utf-8")
    except Exception:
        return
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip()
        if value and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


def _ts() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _log(message: str) -> None:
    print(f"[{_ts()}] {message}", flush=True)


def _progress_bar(current: int, total: int, width: int = 24) -> str:
    if total <= 0:
        return "[------------------------] 0%"
    pct = min(max(current / total, 0.0), 1.0)
    filled = int(width * pct)
    bar = "#" * filled + "-" * (width - filled)
    return f"[{bar}] {pct * 100:5.1f}%"


@dataclass
class ModelRun:
    label: str
    provider: str
    model: str
    base_url: Optional[str] = None
    batch_size: Optional[int] = None


class RateLimiter:
    def __init__(self, rpm: int) -> None:
        self.rpm = rpm
        self._lock = Lock()
        self._last_call = 0.0

    def wait(self) -> None:
        if self.rpm <= 0:
            return
        delay = 60.0 / self.rpm
        with self._lock:
            now = time.time()
            elapsed = now - self._last_call
            if elapsed < delay:
                time.sleep(delay - elapsed)
            self._last_call = time.time()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate LLM classifications using an LLM judge.")
    parser.add_argument("--app-id", required=True, help="Steam app id or store URL")
    parser.add_argument("--reviews", type=int, default=200, help="Number of reviews to fetch")
    parser.add_argument("--language", default="english")
    parser.add_argument("--filter", default="recent")
    parser.add_argument("--day-range", type=int, default=None)
    parser.add_argument("--openai-models", default="")
    parser.add_argument("--google-models", default="")
    parser.add_argument("--ollama-models", default="")
    parser.add_argument("--ollama-base-url", default="http://localhost:11434/v1")
    parser.add_argument("--openai-base-url", default="https://api.openai.com/v1")
    parser.add_argument("--judge-provider", choices=["openai", "google"], required=True)
    parser.add_argument("--judge-model", required=True)
    parser.add_argument("--judge-rpm", type=int, default=0, help="Rate limit for judge calls (req/min). 0 = unlimited")
    parser.add_argument("--max-parallel", type=int, default=2, help="Max parallel batches during classification")
    parser.add_argument("--batch-size-openai", type=int, default=10)
    parser.add_argument("--batch-size-google", type=int, default=3)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def _parse_models(raw: str) -> List[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _extract_json(text: str) -> Dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = JSON_OBJ_RE.search(text)
        if not match:
            raise
        return json.loads(match.group(0))


def _openai_judge(prompt: str, model: str, base_url: str) -> Dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("SENTINEXT_OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for OpenAI judge.")

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Return STRICT JSON only. No prose, no code fences."},
            {"role": "user", "content": prompt},
        ],
    }

    import requests

    response = requests.post(
        f"{base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("OpenAI judge returned no choices")
    message = choices[0].get("message") or {}
    content = (message.get("content") or "").strip()
    if not content:
        raise ValueError("OpenAI judge returned empty content")
    return _extract_json(content)


def _google_judge(prompt: str, model: str) -> Dict[str, Any]:
    try:
        from google import genai
    except ImportError as exc:
        raise RuntimeError("google-genai not installed. Run: pip install google-genai") from exc

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("Set GEMINI_API_KEY or GOOGLE_API_KEY for Gemini judge.")

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(model=model, contents=prompt)
    text = getattr(response, "text", "") or ""
    if not text:
        raise ValueError("Gemini judge returned empty content")
    return _extract_json(text)


def _judge_prompt(review_text: str, predicted: Dict[str, Any]) -> str:
    return (
        "You are a strict evaluator of review classification.\n"
        "Given a review and the model's predicted labels, judge whether the labels are supported by the text.\n"
        "Rules:\n"
        "- Use ONLY the review text as evidence.\n"
        "- Be conservative: if evidence is weak or ambiguous, mark partial or incorrect.\n"
        "- If you propose corrections, keep them short and aligned with the review text.\n\n"
        f"Review:\n{review_text}\n\n"
        "Predicted labels:\n"
        f"- main_category: {predicted.get('main_category')}\n"
        f"- subcategory: {predicted.get('subcategory')}\n"
        f"- subcategories: {predicted.get('subcategories')}\n"
        f"- issue_subcategories: {predicted.get('issue_subcategories')}\n"
        f"- request_subcategories: {predicted.get('request_subcategories')}\n\n"
        "Return JSON with fields: verdict (correct|partial|incorrect), main_correct (bool), "
        "subcategory_correct (bool), issue_request_correct (bool), suggested_main (string|null), "
        "suggested_subcategories (array), rationale (string), confidence (0-1)."
    )


def _compute_score(result: Dict[str, Any]) -> float:
    main_correct = bool(result.get("main_correct"))
    sub_correct = bool(result.get("subcategory_correct"))
    issue_correct = bool(result.get("issue_request_correct"))
    score = 100.0 * (0.5 * main_correct + 0.3 * sub_correct + 0.2 * issue_correct)
    return round(score, 2)


def _run_classification(run: ModelRun, app_id: int, reviews: List[Dict[str, Any]], game_context: Optional[Dict[str, Any]], max_parallel: int) -> Dict[str, Dict[str, Any]]:
    # Save existing settings
    prev_provider = llm.LLM_PROVIDER
    prev_openai_model = llm.OPENAI_MODEL
    prev_gemini_model = llm.GEMINI_MODEL
    prev_openai_base = llm.OPENAI_BASE_URL
    prev_batch_size = llm.OPENAI_BATCH_SIZE
    prev_api_key = os.getenv("OPENAI_API_KEY")

    try:
        llm.LLM_PROVIDER = run.provider
        if run.provider == "google":
            llm.GEMINI_MODEL = run.model
        else:
            llm.OPENAI_MODEL = run.model
            if run.base_url:
                llm.OPENAI_BASE_URL = run.base_url
            if run.label.startswith("ollama:") and not prev_api_key:
                os.environ["OPENAI_API_KEY"] = "ollama"
        if run.batch_size:
            llm.OPENAI_BATCH_SIZE = int(run.batch_size)

        os.environ["SENTINEXT_MAX_PARALLEL_BATCHES"] = str(max_parallel)

        total_reviews = len(reviews)
        last_logged = {"count": -1}

        def _progress_callback(processed: int, total: int) -> None:
            if processed == last_logged["count"]:
                return
            last_logged["count"] = processed
            bar = _progress_bar(processed, total)
            _log(f"{run.label} classification {processed}/{total} {bar}")

        labels = llm.ensure_review_labels(
            app_id,
            reviews,
            cache_enabled=False,
            force_refresh=True,
            game_context=game_context,
            progress_callback=_progress_callback,
        )
        return labels
    finally:
        llm.LLM_PROVIDER = prev_provider
        llm.OPENAI_MODEL = prev_openai_model
        llm.GEMINI_MODEL = prev_gemini_model
        llm.OPENAI_BASE_URL = prev_openai_base
        llm.OPENAI_BATCH_SIZE = prev_batch_size
        if prev_api_key is None:
            os.environ.pop("OPENAI_API_KEY", None)
        else:
            os.environ["OPENAI_API_KEY"] = prev_api_key


def _sanitize_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", value)


def main() -> int:
    _load_env_file()
    args = _parse_args()
    app_id_value = extract_app_id_from_input(str(args.app_id))
    if not app_id_value:
        print("Invalid app id or URL.")
        return 1

    _log("Starting validation run")
    _log(f"App id: {app_id_value}")
    _log(f"Review count requested: {args.reviews}")
    _log(f"Language: {args.language} | filter: {args.filter} | day_range: {args.day_range}")
    _log(f"Judge: {args.judge_provider}:{args.judge_model}")

    reviews = fetch_reviews(
        app_id_value,
        count=int(args.reviews),
        language=str(args.language),
        filter_type=str(args.filter),
        day_range=args.day_range,
    )
    if not reviews:
        print("No reviews fetched.")
        return 1
    _log(f"Fetched {len(reviews)} reviews from Steam")

    game_context = fetch_app_details(app_id_value)
    if game_context:
        _log(f"Game context: {game_context.get('name', app_id_value)}")

    runs: List[ModelRun] = []
    for model in _parse_models(args.openai_models):
        runs.append(
            ModelRun(
                label=f"openai:{model}",
                provider="openai",
                model=model,
                base_url=args.openai_base_url,
                batch_size=args.batch_size_openai,
            )
        )
    for model in _parse_models(args.google_models):
        runs.append(
            ModelRun(
                label=f"google:{model}",
                provider="google",
                model=model,
                batch_size=args.batch_size_google,
            )
        )
    for model in _parse_models(args.ollama_models):
        runs.append(
            ModelRun(
                label=f"ollama:{model}",
                provider="openai",
                model=model,
                base_url=args.ollama_base_url,
                batch_size=args.batch_size_openai,
            )
        )

    if not runs:
        print("No models provided. Use --openai-models, --google-models, or --ollama-models.")
        return 1
    _log(f"Models to evaluate: {', '.join(run.label for run in runs)}")

    out_dir = Path(__file__).resolve().parent
    out_dir.mkdir(parents=True, exist_ok=True)

    random.seed(args.seed)

    report: Dict[str, Any] = {
        "app_id": app_id_value,
        "review_count": len(reviews),
        "judge_provider": args.judge_provider,
        "judge_model": args.judge_model,
        "models": {},
    }

    limiter = RateLimiter(args.judge_rpm)

    for run in runs:
        _log(f"Running classification for {run.label} (provider={run.provider}, model={run.model})")
        labels = _run_classification(run, app_id_value, reviews, game_context, args.max_parallel)
        _log(f"{run.label} classification complete. Labels: {len(labels)}")

        results_path = out_dir / f"{_sanitize_filename(run.label)}_results.jsonl"
        total = 0
        correct = 0
        main_correct = 0
        sub_correct = 0
        issue_correct = 0
        scores: List[float] = []
        verdict_counts = {"correct": 0, "partial": 0, "incorrect": 0}

        with results_path.open("w", encoding="utf-8") as handle:
            for review in reviews:
                review_id = str(review.get("recommendationid") or "")
                if not review_id:
                    continue
                text = str(review.get("review") or "")
                if not text.strip():
                    continue
                predicted = labels.get(review_id)
                if not predicted:
                    continue

                prompt = _judge_prompt(text, predicted)
                if args.dry_run:
                    print(prompt)
                    return 0

                limiter.wait()
                _log(f"{run.label} judging review_id={review_id} ({total + 1} of {len(reviews)})")
                if args.judge_provider == "openai":
                    judge_payload = _openai_judge(prompt, args.judge_model, args.openai_base_url)
                else:
                    judge_payload = _google_judge(prompt, args.judge_model)

                score = _compute_score(judge_payload)

                total += 1
                verdict = str(judge_payload.get("verdict", "incorrect"))
                verdict_counts[verdict] = verdict_counts.get(verdict, 0) + 1

                if bool(judge_payload.get("main_correct")):
                    main_correct += 1
                if bool(judge_payload.get("subcategory_correct")):
                    sub_correct += 1
                if bool(judge_payload.get("issue_request_correct")):
                    issue_correct += 1
                if verdict == "correct":
                    correct += 1

                scores.append(score)

                bar = _progress_bar(total, len(reviews))
                _log(f"{run.label} judged {total}/{len(reviews)} {bar} | score={score}")

                handle.write(
                    json.dumps(
                        {
                            "review_id": review_id,
                            "verdict": verdict,
                            "score": score,
                            "main_correct": bool(judge_payload.get("main_correct")),
                            "subcategory_correct": bool(judge_payload.get("subcategory_correct")),
                            "issue_request_correct": bool(judge_payload.get("issue_request_correct")),
                            "suggested_main": judge_payload.get("suggested_main"),
                            "suggested_subcategories": judge_payload.get("suggested_subcategories") or [],
                            "confidence": judge_payload.get("confidence"),
                            "rationale": judge_payload.get("rationale"),
                            "predicted": {
                                "main_category": predicted.get("main_category"),
                                "subcategory": predicted.get("subcategory"),
                                "subcategories": predicted.get("subcategories"),
                                "issue_subcategories": predicted.get("issue_subcategories"),
                                "request_subcategories": predicted.get("request_subcategories"),
                            },
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )

        avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0
        report["models"][run.label] = {
            "total_judged": total,
            "avg_score": avg_score,
            "verdicts": verdict_counts,
            "main_correct_pct": round((main_correct / total) * 100, 2) if total else 0.0,
            "subcategory_correct_pct": round((sub_correct / total) * 100, 2) if total else 0.0,
            "issue_request_correct_pct": round((issue_correct / total) * 100, 2) if total else 0.0,
        }
        _log(f"{run.label} avg score: {avg_score}")

    report_path = out_dir / "validation_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    _log(f"Report written to {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
