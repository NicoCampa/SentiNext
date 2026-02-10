"""Recompute benchmark metrics excluding JSON parse failures."""
import json
import statistics
import sys
from collections import defaultdict


def load_run(results_dir):
    with open(f"{results_dir}/calls.jsonl") as f:
        calls = [json.loads(line) for line in f if line.strip()]
    with open(f"{results_dir}/judgments.jsonl") as f:
        judgments = [json.loads(line) for line in f if line.strip()]
    with open(f"{results_dir}/meta.json") as f:
        meta = json.load(f)
    return calls, judgments, meta


def analyze_run(results_dir, tasks_order, models_order):
    calls, judgments, meta = load_run(results_dir)

    judge_model = meta.get("judge", {}).get("model", "unknown")
    dataset = meta.get("dataset", "unknown")

    # Index candidate calls by (task, item_id, model_id)
    candidate_valid = {}
    for c in calls:
        if c.get("role") != "candidate":
            continue
        key = (c["task"], c["item_id"], c["model_id"])
        validation = c.get("validation") or {}
        errors = validation.get("errors") or []
        has_json_error = any(e.startswith("invalid_json") for e in errors)
        candidate_valid[key] = {
            "ok": validation.get("ok", False),
            "has_json_error": has_json_error,
            "errors": errors,
            "latency_ms": c.get("latency_ms", 0),
        }

    groups_filtered = defaultdict(list)
    groups_all = defaultdict(list)
    for j in judgments:
        key = (j["task"], j["item_id"], j["model_id"])
        cv = candidate_valid.get(key, {})
        entry = {
            "overall": j["judge"]["overall"],
            "label": j["judge"]["label"],
            "latency_ms": cv.get("latency_ms", 0),
            "validation_ok": cv.get("ok", False),
        }
        groups_all[(j["model_id"], j["task"])].append(entry)
        if not cv.get("has_json_error", False):
            groups_filtered[(j["model_id"], j["task"])].append(entry)

    return groups_all, groups_filtered, candidate_valid, judge_model, dataset


def print_table(title, groups, tasks_order, models_order):
    print(f"\n## {title}\n")
    for task in tasks_order:
        has_data = any((model, task) in groups for model in models_order)
        if not has_data:
            continue
        print(f"### {task}")
        print(
            "| Model | n | Mean | Median | Excellent% | Good% | Acceptable% | Unacceptable% | Mean Latency |"
        )
        print("|---|---|---|---|---|---|---|---|---|")
        for model in models_order:
            key = (model, task)
            if key not in groups:
                continue
            items = groups[key]
            n = len(items)
            if n == 0:
                continue
            scores = [it["overall"] for it in items]
            mean = statistics.mean(scores)
            median = statistics.median(scores)
            labels = [it["label"] for it in items]
            excellent = labels.count("excellent") / n * 100
            good = labels.count("good") / n * 100
            acceptable = labels.count("acceptable") / n * 100
            unacceptable = labels.count("unacceptable") / n * 100
            latencies = [it["latency_ms"] for it in items if it["latency_ms"]]
            mean_lat = statistics.mean(latencies) if latencies else 0
            print(
                f"| {model} | {n} | {mean:.1f} | {median:.1f} | {excellent:.1f}% | {good:.1f}% | {acceptable:.1f}% | {unacceptable:.1f}% | {mean_lat:.0f}ms |"
            )
        print()


def print_delta(groups_all, groups_filtered, tasks_order, models_order):
    has_delta = False
    for model in models_order:
        for task in tasks_order:
            key = (model, task)
            if key in groups_all and key in groups_filtered:
                if len(groups_all[key]) != len(groups_filtered[key]):
                    has_delta = True
                    break
        if has_delta:
            break
    if not has_delta:
        print("\nNo JSON parse failures found — all results identical.\n")
        return

    print("\n## Filtered out (JSON parse failures)\n")
    print("| Model | Task | Items filtered |")
    print("|---|---|---|")
    # Rebuild filtered counts from candidate_valid indirectly
    for model in models_order:
        for task in tasks_order:
            key = (model, task)
            n_all = len(groups_all.get(key, []))
            n_filt = len(groups_filtered.get(key, []))
            diff = n_all - n_filt
            if diff > 0:
                print(f"| {model} | {task} | {diff} |")

    print("\n## Delta: Original vs Valid-JSON-Only\n")
    print("| Model | Task | n_orig | mean_orig | n_filtered | mean_filtered | delta |")
    print("|---|---|---|---|---|---|---|")
    for model in models_order:
        for task in tasks_order:
            key = (model, task)
            if key in groups_all and key in groups_filtered:
                orig = groups_all[key]
                filt = groups_filtered[key]
                if len(orig) != len(filt):
                    mean_o = statistics.mean([x["overall"] for x in orig])
                    mean_f = statistics.mean([x["overall"] for x in filt])
                    print(
                        f"| {model} | {task} | {len(orig)} | {mean_o:.1f} | {len(filt)} | {mean_f:.1f} | +{mean_f - mean_o:.1f} |"
                    )


# ---- V1 Run ----
print("=" * 60)
print("# V1 Run (bench_v1, Judge: gpt-5.1)")
print("=" * 60)

v1_tasks = [
    "review_labeling_batch",
    "compare_games_overview",
    "subcategory_summary",
    "monthly_report_summary",
]
v1_models = [
    "openai:gpt-5.1",
    "openai:gpt-5-mini",
    "openai:gpt-5-nano",
    "google:gemini-2.5-flash",
    "google:gemini-flash-lite-latest",
    "xai:grok-4-1-fast-reasoning",
    "xai:grok-4-1-fast-non-reasoning",
    "ollama:gpt-oss-120b-cloud",
]

g_all, g_filt, _, judge, ds = analyze_run(
    "tooling/benchmarks/results/20260206_001445_50f0c9a6", v1_tasks, v1_models
)
print_table(f"Valid JSON Only (dataset={ds}, judge={judge})", g_filt, v1_tasks, v1_models)
print_delta(g_all, g_filt, v1_tasks, v1_models)

# ---- V2 Run 3 (Judge: gpt-5.1) ----
print("\n" + "=" * 60)
print("# V2 Run 3 (bench_v2, Judge: gpt-5.1)")
print("=" * 60)

v2_tasks = ["review_labeling", "review_labeling_batch"]
v2_models = [
    "openai:gpt-5-nano",
    "xai:grok-4-1-fast-reasoning",
    "xai:grok-4-1-fast-non-reasoning",
]

g_all, g_filt, _, judge, ds = analyze_run(
    "tooling/benchmarks/results/20260206_010301_910c9e1d", v2_tasks, v2_models
)
print_table(f"Valid JSON Only (dataset={ds}, judge={judge})", g_filt, v2_tasks, v2_models)
print_delta(g_all, g_filt, v2_tasks, v2_models)

# ---- V2 Run 5 (Judge: gemini-3-flash-preview) ----
print("\n" + "=" * 60)
print("# V2 Run 5 (bench_v2, Judge: gemini-3-flash-preview)")
print("=" * 60)

g_all, g_filt, _, judge, ds = analyze_run(
    "tooling/benchmarks/results/20260206_012234_65f59c2e", v2_tasks, v2_models
)
print_table(f"Valid JSON Only (dataset={ds}, judge={judge})", g_filt, v2_tasks, v2_models)
print_delta(g_all, g_filt, v2_tasks, v2_models)
