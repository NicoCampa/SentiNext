from __future__ import annotations

import dataclasses
import datetime as dt
import json
import os
import subprocess
import threading
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Optional

from .cache import SqliteCache
from .config import BenchmarkConfig, JudgeConfig, ModelConfig
from .hashing import sha256_json, sha256_text, stable_json_dumps
from .judge.judge_runner import build_judge_prompt, parse_judge_output
from .judge.rubric import label_for_score
from .pricing import PriceTable
from .providers import GoogleGenAIProvider, MockProvider, OpenAICompatProvider, Provider, ProviderError, XaiSdkProvider
from .reporting import summarize_results
from .tasks import (
    ChatAnswerTask,
    CompareGamesOverviewTask,
    MonthlyReportSummaryTask,
    ReviewLabelingBatchTask,
    ReviewLabelingTask,
    SubcategorySummaryTask,
    TranslationToEnglishTask,
    TaskItem,
    load_dataset,
)


def _derived_seed(base_seed: int, *parts: str) -> int:
    return int(sha256_text("|".join([str(base_seed), *parts]))[:8], 16)


def _jsonable(value: Any) -> Any:
    from pathlib import Path as _Path

    if isinstance(value, _Path):
        return str(value)
    if dataclasses.is_dataclass(value):
        return _jsonable(dataclasses.asdict(value))
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _git_commit() -> str | None:
    try:
        return (
            subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=str(Path(__file__).resolve().parents[1]))
            .decode("utf-8")
            .strip()
        )
    except Exception:
        return None


def _append_jsonl(path: Path, obj: dict[str, Any], lock: threading.Lock) -> None:
    line = json.dumps(obj, ensure_ascii=False)
    with lock:
        with path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _safe_filename(stem: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", stem or "item").strip("._-")
    return safe[:120] if len(safe) > 120 else safe


def _provider_for_model(cfg: ModelConfig) -> Provider:
    if cfg.provider == "mock":
        return MockProvider()
    if cfg.provider == "google":
        api_key = os.getenv(cfg.api_key_env or "GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("Missing GEMINI_API_KEY/GOOGLE_API_KEY for google provider.")
        return GoogleGenAIProvider(api_key=api_key)
    if cfg.provider == "xai":
        api_key = os.getenv(cfg.api_key_env or "XAI_API_KEY") or os.getenv("XAI_API_KEY")
        if not api_key:
            raise RuntimeError("Missing XAI_API_KEY for xai provider.")
        return XaiSdkProvider(api_key=api_key)
    if cfg.provider in {"openai", "ollama"}:
        base_url = cfg.base_url
        if not base_url:
            raise RuntimeError(f"Missing base_url for provider {cfg.provider}")
        api_key = os.getenv(cfg.api_key_env) if cfg.api_key_env else None
        if cfg.provider in {"openai"} and not api_key:
            raise RuntimeError(f"Missing API key env var for provider {cfg.provider}: {cfg.api_key_env}")
        return OpenAICompatProvider(provider_name=cfg.provider, base_url=base_url, api_key=api_key)
    raise RuntimeError(f"Unknown provider: {cfg.provider}")


def _provider_for_judge(cfg: JudgeConfig) -> Provider:
    if cfg.provider == "mock":
        return MockProvider()
    if cfg.provider == "google":
        api_key = os.getenv(cfg.api_key_env or "GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("Missing GEMINI_API_KEY/GOOGLE_API_KEY for judge google provider.")
        return GoogleGenAIProvider(api_key=api_key)
    if cfg.provider == "xai":
        api_key = os.getenv(cfg.api_key_env or "XAI_API_KEY") or os.getenv("XAI_API_KEY")
        if not api_key:
            raise RuntimeError("Missing XAI_API_KEY for judge xai provider.")
        return XaiSdkProvider(api_key=api_key)
    if cfg.provider in {"openai", "ollama"}:
        base_url = cfg.base_url
        if not base_url:
            raise RuntimeError(f"Missing base_url for judge provider {cfg.provider}")
        api_key = os.getenv(cfg.api_key_env) if cfg.api_key_env else None
        if cfg.provider in {"openai"} and not api_key:
            raise RuntimeError(f"Missing API key env var for judge provider {cfg.provider}: {cfg.api_key_env}")
        return OpenAICompatProvider(provider_name=cfg.provider, base_url=base_url, api_key=api_key)
    raise RuntimeError(f"Invalid judge provider: {cfg.provider}")


def _load_rubric_text() -> str:
    prompts_dir = Path(__file__).resolve().parent / "prompts"
    return (prompts_dir / "judge_rubric_v2.txt").read_text(encoding="utf-8")


def _prompt_hashes() -> dict[str, str]:
    prompts_dir = Path(__file__).resolve().parent / "prompts"
    hashes: dict[str, str] = {}
    for p in sorted(prompts_dir.glob("*.txt")):
        hashes[p.name] = sha256_text(p.read_text(encoding="utf-8"))
    return hashes


def _dataset_hash(dataset_dir: Path) -> str:
    parts: list[tuple[str, str]] = []
    for name in ["manifest.json", "games.json", "reviews.jsonl"]:
        p = dataset_dir / name
        if not p.exists():
            continue
        parts.append((name, sha256_text(p.read_text(encoding="utf-8"))))
    return sha256_json(parts)


def run_benchmark(cfg: BenchmarkConfig) -> Path:
    dataset = load_dataset(cfg.run.dataset)
    rubric_text = _load_rubric_text()
    price_table = PriceTable.load(cfg.run.pricing_table) if cfg.run.pricing_table and cfg.run.pricing_table.exists() else None

    ts = dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    run_fingerprint = sha256_text(stable_json_dumps(_jsonable(cfg.run)))[:8]
    run_id = f"{ts}_{run_fingerprint}"
    results_dir = cfg.run.results_dir / run_id

    _ensure_dir(results_dir)
    _ensure_dir(results_dir / "outputs" / "candidate")
    _ensure_dir(results_dir / "outputs" / "judge")
    _ensure_dir(results_dir / "reference_labels")

    calls_path = results_dir / "calls.jsonl"
    judgments_path = results_dir / "judgments.jsonl"
    calls_lock = threading.Lock()
    judgments_lock = threading.Lock()
    reference_lock = threading.Lock()

    cache: SqliteCache | None = None
    if not cfg.run.no_cache:
        cache = SqliteCache(cfg.run.cache_db)

    judge_provider = _provider_for_judge(cfg.judge)
    judge_model_id = f"{cfg.judge.provider}:{cfg.judge.model}"

    def _cache_key(*, role: str, provider: str, model: str, temperature: float, max_tokens: int, prompt_sha: str, task_name: str) -> str:
        return sha256_text(
            stable_json_dumps(
                {
                    "role": role,
                    "provider": provider,
                    "model": model,
                    "temperature": float(temperature),
                    "max_tokens": int(max_tokens),
                    "prompt_sha": prompt_sha,
                    "task": task_name,
                }
            )
        )

    tasks_config = cfg.run.tasks or [
        "review_labeling",
        "subcategory_summary",
        "monthly_report_summary",
        "compare_games_overview",
        "translation_to_english",
    ]
    _TASK_CONSTRUCTORS = {
        "review_labeling": ReviewLabelingTask,
        "review_labeling_v2": lambda **kw: ReviewLabelingTask(prompt_file="review_labeling_v2.txt", **kw),
        "review_labeling_v3": lambda **kw: ReviewLabelingTask(prompt_file="review_labeling_v3.txt", **kw),
        "review_labeling_batch": ReviewLabelingBatchTask,
        "review_labeling_batch_v2": lambda **kw: ReviewLabelingBatchTask(prompt_file="review_labeling_batch_v2.txt", **kw),
        "review_labeling_batch_v3": lambda **kw: ReviewLabelingBatchTask(prompt_file="review_labeling_batch_v3.txt", **kw),
        "subcategory_summary": SubcategorySummaryTask,
        "subcategory_summary_v2": lambda **kw: SubcategorySummaryTask(prompt_version="v2", **kw),
        "monthly_report_summary": MonthlyReportSummaryTask,
        "monthly_report_summary_v2": lambda **kw: MonthlyReportSummaryTask(prompt_version="v2", **kw),
        "compare_games_overview": CompareGamesOverviewTask,
        "translation_to_english": TranslationToEnglishTask,
        "chat_answer": ChatAnswerTask,
        "chat_answer_v2": lambda **kw: ChatAnswerTask(prompt_version="v2", **kw),
        "chat_answer_v3": lambda **kw: ChatAnswerTask(prompt_version="v3", **kw),
    }
    tasks = []
    for tname in tasks_config:
        # Support "task_name:app_id" syntax for app_id filtering
        parts = tname.split(":", 1)
        base_name = parts[0]
        app_id_filter = int(parts[1]) if len(parts) > 1 else None
        ctor = _TASK_CONSTRUCTORS.get(base_name)
        if ctor is None:
            raise ValueError(f"Unknown task: {base_name}. Available: {sorted(_TASK_CONSTRUCTORS.keys())}")
        if app_id_filter:
            try:
                tasks.append(ctor(app_id_filter=app_id_filter))
            except TypeError:
                raise ValueError(f"Task {base_name} does not support app_id filtering")
        else:
            tasks.append(ctor())

    # Load pre-existing reference labels from dataset (e.g. from DB export).
    reference_labels: dict[str, dict[str, Any]] | None = None
    ref_labels_path = dataset.root / "reference_labels.json"
    if ref_labels_path.exists():
        import json as _json
        raw_labels = _json.loads(ref_labels_path.read_text(encoding="utf-8"))
        if isinstance(raw_labels, dict) and raw_labels:
            reference_labels = raw_labels
            print(f"Loaded {len(reference_labels)} pre-existing reference labels from dataset.", flush=True)

    # Build reference labels using google:gemini-2.5-flash (if configured and no pre-existing labels).
    reference_model_cfg = next((m for m in cfg.models if m.id == "google:gemini-2.5-flash"), None)
    if reference_model_cfg and not reference_labels:
        reference_labels = {}
        ref_task = ReviewLabelingTask()
        ref_provider = _provider_for_model(reference_model_cfg)
        ref_out_path = results_dir / "reference_labels" / "labels.jsonl"

        for review in dataset.reviews:
            item = TaskItem(id=str(review.get("review_id") or ""), payload={"review": review})
            prompt = ref_task.build_prompt(item=item, dataset=dataset)
            prompt_sha = sha256_text(prompt)

            # Use candidate cache key to allow re-use with the classification task.
            ckey = _cache_key(
                role="candidate",
                provider=reference_model_cfg.provider,
                model=reference_model_cfg.model,
                temperature=reference_model_cfg.temperature,
                max_tokens=reference_model_cfg.max_tokens,
                prompt_sha=prompt_sha,
                task_name=ref_task.name,
            )

            cached = cache.get(ckey) if cache else None
            if cached:
                output_text = cached.text
                latency_ms = cached.latency_ms
                usage = {
                    "prompt_tokens": cached.prompt_tokens,
                    "completion_tokens": cached.completion_tokens,
                    "total_tokens": cached.total_tokens,
                }
                cached_flag = True
                raw_json = cached.raw_json
            else:
                try:
                    resp = ref_provider.generate(
                        prompt=prompt,
                        model=reference_model_cfg.model,
                        temperature=reference_model_cfg.temperature,
                        max_tokens=reference_model_cfg.max_tokens,
                        timeout_s=cfg.run.timeout_s,
                        retries=cfg.run.retries,
                        response_mime_type=ref_task.response_mime_type,
                        response_json_schema=ref_task.get_response_json_schema(item) if hasattr(ref_task, "get_response_json_schema") else getattr(ref_task, "response_json_schema", None),
                    )
                    output_text = resp.text
                    latency_ms = resp.latency_ms
                    usage = (
                        {
                            "prompt_tokens": resp.usage.prompt_tokens,
                            "completion_tokens": resp.usage.completion_tokens,
                            "total_tokens": resp.usage.total_tokens,
                        }
                        if resp.usage
                        else None
                    )
                    raw_json = json.dumps(resp.raw, default=str, ensure_ascii=False) if resp.raw is not None else None
                    cached_flag = False
                    if cache:
                        cache.put(
                            key=ckey,
                            provider=reference_model_cfg.provider,
                            model=reference_model_cfg.model,
                            temperature=reference_model_cfg.temperature,
                            max_tokens=reference_model_cfg.max_tokens,
                            prompt_sha=prompt_sha,
                            task=ref_task.name,
                            role="candidate",
                            response_text=output_text,
                            raw_json=raw_json,
                            latency_ms=latency_ms,
                            prompt_tokens=resp.usage.prompt_tokens if resp.usage else None,
                            completion_tokens=resp.usage.completion_tokens if resp.usage else None,
                            total_tokens=resp.usage.total_tokens if resp.usage else None,
                        )
                except Exception as exc:
                    output_text = ""
                    latency_ms = None
                    usage = None
                    raw_json = None
                    cached_flag = False

            validation = ref_task.validate(output_text=output_text, item=item, dataset=dataset)
            if validation.ok and validation.parsed:
                reference_labels[item.id] = validation.parsed

            _append_jsonl(
                ref_out_path,
                {
                    "review_id": item.id,
                    "app_id": int(review.get("app_id") or 0),
                    "model_id": reference_model_cfg.id,
                    "cached": cached_flag,
                    "latency_ms": latency_ms,
                    "usage": usage,
                    "validation": {"ok": validation.ok, "errors": validation.errors},
                },
                reference_lock,
            )

    # Prepare work items (deterministic per task)
    work_classification: list[tuple[Any, Any, ModelConfig]] = []
    work_downstream: list[tuple[Any, Any, ModelConfig]] = []
    for task in tasks:
        rng = __import__("random").Random(_derived_seed(cfg.run.seed, cfg.run.suite, task.name))
        items = task.build_items(dataset=dataset, suite=cfg.run.suite, rng=rng, reference_labels=reference_labels)
        for item in items:
            for model_cfg in cfg.models:
                if task.name.startswith("review_labeling"):
                    work_classification.append((task, item, model_cfg))
                else:
                    work_downstream.append((task, item, model_cfg))

    # Write meta.json
    meta = {
        "run_id": run_id,
        "created_at": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "git_commit": _git_commit(),
        "suite": cfg.run.suite,
        "dataset_dir": str(dataset.root),
        "dataset_hash": _dataset_hash(dataset.root),
        "prompt_hashes": _prompt_hashes(),
        "run": _jsonable(cfg.run),
        "judge": _jsonable(cfg.judge),
        "models": [_jsonable(m) for m in cfg.models],
        "reference_label_model_id": reference_model_cfg.id if reference_model_cfg else None,
        "python": {"version": f"{os.sys.version_info.major}.{os.sys.version_info.minor}.{os.sys.version_info.micro}"},
    }
    (results_dir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")

    def _estimate_cost(model_id: str, usage: Any) -> float | None:
        if not price_table or not usage:
            return None
        pt = getattr(usage, "prompt_tokens", None) if hasattr(usage, "prompt_tokens") else usage.get("prompt_tokens") if isinstance(usage, dict) else None
        ct = getattr(usage, "completion_tokens", None) if hasattr(usage, "completion_tokens") else usage.get("completion_tokens") if isinstance(usage, dict) else None
        return price_table.estimate_cost_usd(model_id=model_id, prompt_tokens=pt, completion_tokens=ct)

    def _run_one(task: Any, item: Any, model_cfg: ModelConfig) -> None:
        provider = _provider_for_model(model_cfg)

        candidate_prompt = task.build_prompt(item=item, dataset=dataset)
        prompt_sha = sha256_text(candidate_prompt)
        ckey = _cache_key(
            role="candidate",
            provider=model_cfg.provider,
            model=model_cfg.model,
            temperature=model_cfg.temperature,
            max_tokens=model_cfg.max_tokens,
            prompt_sha=prompt_sha,
            task_name=task.name,
        )

        candidate_text: str
        candidate_latency: int | None = None
        candidate_usage: dict[str, Any] | None = None
        candidate_raw_json: str | None = None
        candidate_error: str | None = None

        cached = cache.get(ckey) if cache else None
        if cached:
            candidate_text = cached.text
            candidate_latency = cached.latency_ms
            candidate_usage = {
                "prompt_tokens": cached.prompt_tokens,
                "completion_tokens": cached.completion_tokens,
                "total_tokens": cached.total_tokens,
            }
            candidate_raw_json = cached.raw_json
        else:
            try:
                resp = provider.generate(
                    prompt=candidate_prompt,
                    model=model_cfg.model,
                    temperature=model_cfg.temperature,
                    max_tokens=model_cfg.max_tokens,
                    timeout_s=cfg.run.timeout_s,
                    retries=cfg.run.retries,
                    response_mime_type=task.response_mime_type,
                    response_json_schema=task.get_response_json_schema(item) if hasattr(task, "get_response_json_schema") else getattr(task, "response_json_schema", None),
                )
                candidate_text = resp.text
                candidate_latency = resp.latency_ms
                candidate_usage = (
                    {
                        "prompt_tokens": resp.usage.prompt_tokens,
                        "completion_tokens": resp.usage.completion_tokens,
                        "total_tokens": resp.usage.total_tokens,
                    }
                    if resp.usage
                    else None
                )
                candidate_raw_json = json.dumps(resp.raw, default=str, ensure_ascii=False) if resp.raw is not None else None
                if cache:
                    cache.put(
                        key=ckey,
                        provider=model_cfg.provider,
                        model=model_cfg.model,
                        temperature=model_cfg.temperature,
                        max_tokens=model_cfg.max_tokens,
                        prompt_sha=prompt_sha,
                        task=task.name,
                        role="candidate",
                        response_text=candidate_text,
                        raw_json=candidate_raw_json,
                        latency_ms=candidate_latency,
                        prompt_tokens=resp.usage.prompt_tokens if resp.usage else None,
                        completion_tokens=resp.usage.completion_tokens if resp.usage else None,
                        total_tokens=resp.usage.total_tokens if resp.usage else None,
                    )
            except Exception as exc:
                candidate_text = ""
                candidate_error = str(exc)

        # Write candidate output to file
        out_path = results_dir / "outputs" / "candidate" / task.name / model_cfg.id
        _ensure_dir(out_path)
        text_path = out_path / f"{_safe_filename(item.id)}.txt"
        text_path.write_text(candidate_text, encoding="utf-8")

        validation = task.validate(output_text=candidate_text, item=item, dataset=dataset) if candidate_text else None
        est_cost = _estimate_cost(model_cfg.id, candidate_usage) if candidate_usage else None

        _append_jsonl(
            calls_path,
            {
                "timestamp": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "role": "candidate",
                "task": task.name,
                "item_id": item.id,
                "model_id": model_cfg.id,
                "provider": model_cfg.provider,
                "model": model_cfg.model,
                "temperature": model_cfg.temperature,
                "max_tokens": model_cfg.max_tokens,
                "prompt_sha256": prompt_sha,
                "latency_ms": candidate_latency,
                "usage": candidate_usage,
                "estimated_cost_usd": est_cost,
                "text_path": str(text_path.relative_to(results_dir)),
                "validation": {"ok": validation.ok, "errors": validation.errors} if validation else None,
                "error": candidate_error,
                "cached": bool(cached),
            },
            calls_lock,
        )

        # If candidate output invalid, skip judge call and record a synthetic judgment.
        if not validation or not validation.ok:
            failures = []
            if validation and validation.errors:
                failures = [f"validation:{e}" for e in validation.errors]
            synthetic = {
                "overall": 0,
                "label": "unacceptable",
                "criteria": {"format": 0, "faithfulness": 0, "usefulness": 0, "completeness": 0},
                "notes": "Candidate output failed deterministic validation; judge call skipped.",
                "failures": failures,
            }
            _append_jsonl(
                judgments_path,
                {
                    "timestamp": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    "task": task.name,
                    "item_id": item.id,
                    "model_id": model_cfg.id,
                    "judge_model_id": judge_model_id,
                    "judge": synthetic,
                    "text_path": None,
                },
                judgments_lock,
            )
            return

        # Build judge input as JSON (best-effort, sanitized by task when available)
        if hasattr(task, "build_judge_input"):
            judge_input = task.build_judge_input(item=item, dataset=dataset)
        else:
            judge_input = item.payload
        try:
            input_block = json.dumps(judge_input, ensure_ascii=False, indent=2, default=str)
        except Exception:
            input_block = str(judge_input)

        judge_prompt = build_judge_prompt(
            rubric_text=rubric_text,
            task_name=task.name,
            expected_schema=task.expected_schema,
            task_constraints=task.constraints,
            input_block=input_block,
            candidate_output=candidate_text,
        )
        judge_prompt_sha = sha256_text(judge_prompt)
        jkey = _cache_key(
            role="judge",
            provider=cfg.judge.provider,
            model=cfg.judge.model,
            temperature=cfg.judge.temperature,
            max_tokens=cfg.judge.max_tokens,
            prompt_sha=judge_prompt_sha,
            task_name=task.name,
        )

        judge_text: str
        judge_latency: int | None = None
        judge_usage: dict[str, Any] | None = None
        judge_raw_json: str | None = None
        judge_error: str | None = None

        jcached = cache.get(jkey) if cache else None
        if jcached:
            judge_text = jcached.text
            judge_latency = jcached.latency_ms
            judge_usage = {
                "prompt_tokens": jcached.prompt_tokens,
                "completion_tokens": jcached.completion_tokens,
                "total_tokens": jcached.total_tokens,
            }
            judge_raw_json = jcached.raw_json
        else:
            try:
                resp = judge_provider.generate(
                    prompt=judge_prompt,
                    model=cfg.judge.model,
                    temperature=cfg.judge.temperature,
                    max_tokens=cfg.judge.max_tokens,
                    timeout_s=cfg.run.timeout_s,
                    retries=cfg.run.retries,
                    response_mime_type="application/json",
                )
                judge_text = resp.text
                judge_latency = resp.latency_ms
                judge_usage = (
                    {
                        "prompt_tokens": resp.usage.prompt_tokens,
                        "completion_tokens": resp.usage.completion_tokens,
                        "total_tokens": resp.usage.total_tokens,
                    }
                    if resp.usage
                    else None
                )
                judge_raw_json = json.dumps(resp.raw, default=str, ensure_ascii=False) if resp.raw is not None else None
                if cache:
                    cache.put(
                        key=jkey,
                        provider=cfg.judge.provider,
                        model=cfg.judge.model,
                        temperature=cfg.judge.temperature,
                        max_tokens=cfg.judge.max_tokens,
                        prompt_sha=judge_prompt_sha,
                        task=task.name,
                        role="judge",
                        response_text=judge_text,
                        raw_json=judge_raw_json,
                        latency_ms=judge_latency,
                        prompt_tokens=resp.usage.prompt_tokens if resp.usage else None,
                        completion_tokens=resp.usage.completion_tokens if resp.usage else None,
                        total_tokens=resp.usage.total_tokens if resp.usage else None,
                    )
            except Exception as exc:
                judge_text = ""
                judge_error = str(exc)

        judge_out_dir = results_dir / "outputs" / "judge" / task.name / model_cfg.id
        _ensure_dir(judge_out_dir)
        judge_text_path = judge_out_dir / f"{_safe_filename(item.id)}.txt"
        judge_text_path.write_text(judge_text, encoding="utf-8")

        judge_cost = _estimate_cost(judge_model_id, judge_usage) if judge_usage else None
        _append_jsonl(
            calls_path,
            {
                "timestamp": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "role": "judge",
                "task": task.name,
                "item_id": item.id,
                "model_id": judge_model_id,
                "candidate_model_id": model_cfg.id,
                "provider": cfg.judge.provider,
                "model": cfg.judge.model,
                "temperature": cfg.judge.temperature,
                "max_tokens": cfg.judge.max_tokens,
                "prompt_sha256": judge_prompt_sha,
                "latency_ms": judge_latency,
                "usage": judge_usage,
                "estimated_cost_usd": judge_cost,
                "text_path": str(judge_text_path.relative_to(results_dir)),
                "error": judge_error,
                "cached": bool(jcached),
            },
            calls_lock,
        )

        judged = parse_judge_output(judge_text) if judge_text else None
        if judged is None:
            parsed = {
                "overall": 0,
                "label": "unacceptable",
                "criteria": {"format": 0, "faithfulness": 0, "usefulness": 0, "completeness": 0},
                "notes": "Judge call failed or returned empty output.",
                "failures": ["judge_failed"],
            }
        else:
            parsed = {
                "overall": int(judged.overall),
                "label": str(judged.label),
                "criteria": {k: int(v) for k, v in judged.criteria.items()},
                "notes": judged.notes,
                "failures": judged.failures,
            }

        _append_jsonl(
            judgments_path,
            {
                "timestamp": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "task": task.name,
                "item_id": item.id,
                "model_id": model_cfg.id,
                "judge_model_id": judge_model_id,
                "judge": parsed,
                "text_path": str(judge_text_path.relative_to(results_dir)),
            },
            judgments_lock,
        )

    def _run_work(work: list[tuple[Any, Any, ModelConfig]], phase: str) -> None:
        if not work:
            return
        print(f"=== {phase} ({len(work)} calls) ===", flush=True)
        with ThreadPoolExecutor(max_workers=int(cfg.run.max_concurrency)) as ex:
            futures = {}
            for (t, i, m) in work:
                fut = ex.submit(_run_one, t, i, m)
                futures[fut] = (t.name, m.id, i.id)

            total = len(futures)
            done = 0
            last_report = 0.0
            for fut in as_completed(futures):
                done += 1
                task_name, model_id, item_id = futures[fut]
                now = time.perf_counter()
                if (now - last_report) > 0.5 or done == total:
                    percent = (done / total * 100.0) if total else 100.0
                    print(f"[{done}/{total} {percent:.1f}%] last: {task_name} | {model_id} | {item_id}", flush=True)
                    last_report = now
                exc = fut.exception()
                if exc:
                    raise exc

    # Execute in two phases: classification first, then downstream tasks.
    _run_work(work_classification, "Phase 1: review classification")
    _run_work(work_downstream, "Phase 2: downstream tasks")

    summarize_results(results_dir)
    return results_dir
