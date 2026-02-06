from __future__ import annotations

import csv
import json
import statistics
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def _pct(n: int, d: int) -> float:
    return (n / d * 100.0) if d else 0.0


def _p95(values: list[float]) -> float | None:
    if not values:
        return None
    values = sorted(values)
    idx = int(round(0.95 * (len(values) - 1)))
    return float(values[idx])


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    return float(statistics.median(values))


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return float(statistics.mean(values))


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames: list[str] = []
    for row in rows:
        for k in row.keys():
            if k not in fieldnames:
                fieldnames.append(k)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _write_md(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("# Benchmark summary\n\n(no rows)\n", encoding="utf-8")
        return
    cols = [
        "model_id",
        "task",
        "n",
        "mean_overall",
        "median_overall",
        "unacceptable_pct",
        "acceptable_pct",
        "good_pct",
        "excellent_pct",
        "mean_latency_ms",
        "p95_latency_ms",
        "total_candidate_cost_usd",
        "total_judge_cost_usd",
        "total_cost_usd",
    ]
    header = "| " + " | ".join(cols) + " |"
    sep = "| " + " | ".join(["---"] * len(cols)) + " |"
    lines = ["# Benchmark summary", "", header, sep]
    for row in rows:
        line = "| " + " | ".join(str(row.get(c, "")) for c in cols) + " |"
        lines.append(line)
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def summarize_results(results_dir: Path) -> dict[str, Any]:
    calls_path = results_dir / "calls.jsonl"
    judgments_path = results_dir / "judgments.jsonl"

    calls = _read_jsonl(calls_path)
    judgments = _read_jsonl(judgments_path)

    scores: dict[tuple[str, str, str], dict[str, Any]] = {}
    for j in judgments:
        key = (str(j.get("model_id")), str(j.get("task")), str(j.get("item_id")))
        scores[key] = j.get("judge") or {}

    grouped: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {
        "latencies": [],
        "candidate_costs": [],
        "judge_costs": [],
        "overall": [],
        "labels": defaultdict(int),
    })

    # Candidate call metrics + attach judge score by (model, task, item)
    for c in calls:
        if c.get("role") != "candidate":
            continue
        model_id = str(c.get("model_id"))
        task = str(c.get("task"))
        item_id = str(c.get("item_id"))
        group = grouped[(model_id, task)]

        if isinstance(c.get("latency_ms"), (int, float)):
            group["latencies"].append(float(c["latency_ms"]))

        cost = c.get("estimated_cost_usd")
        if isinstance(cost, (int, float)):
            group["candidate_costs"].append(float(cost))

        judge_key = (model_id, task, item_id)
        judge = scores.get(judge_key)
        if judge and isinstance(judge.get("overall"), (int, float)):
            group["overall"].append(float(judge["overall"]))
            label = str(judge.get("label") or "")
            if label:
                group["labels"][label] += 1

    # Judge cost (separate from candidate cost)
    for c in calls:
        if c.get("role") != "judge":
            continue
        model_id = str(c.get("candidate_model_id") or c.get("model_id") or "")
        task = str(c.get("task"))
        group = grouped.get((model_id, task))
        if not group:
            continue
        cost = c.get("estimated_cost_usd")
        if isinstance(cost, (int, float)):
            group["judge_costs"].append(float(cost))

    rows: list[dict[str, Any]] = []
    for (model_id, task), data in sorted(grouped.items()):
        n = len(data["overall"])
        labels = data["labels"]
        rows.append(
            {
                "model_id": model_id,
                "task": task,
                "n": n,
                "mean_overall": round(_mean(data["overall"]) or 0.0, 2) if n else "",
                "median_overall": round(_median(data["overall"]) or 0.0, 2) if n else "",
                "unacceptable_pct": round(_pct(labels.get("unacceptable", 0), n), 1) if n else "",
                "acceptable_pct": round(_pct(labels.get("acceptable", 0), n), 1) if n else "",
                "good_pct": round(_pct(labels.get("good", 0), n), 1) if n else "",
                "excellent_pct": round(_pct(labels.get("excellent", 0), n), 1) if n else "",
                "mean_latency_ms": round(_mean(data["latencies"]) or 0.0, 1) if data["latencies"] else "",
                "p95_latency_ms": round(_p95(data["latencies"]) or 0.0, 1) if data["latencies"] else "",
                "total_candidate_cost_usd": round(sum(data["candidate_costs"]), 6) if data["candidate_costs"] else "",
                "total_judge_cost_usd": round(sum(data["judge_costs"]), 6) if data["judge_costs"] else "",
                "total_cost_usd": round(sum(data["candidate_costs"]) + sum(data["judge_costs"]), 6)
                if (data["candidate_costs"] or data["judge_costs"])
                else "",
            }
        )

    summary_csv = results_dir / "summary.csv"
    summary_md = results_dir / "summary.md"
    _write_csv(summary_csv, rows)
    _write_md(summary_md, rows)

    return {
        "results_dir": str(results_dir),
        "rows": rows,
    }

