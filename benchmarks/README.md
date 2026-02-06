# SentiNext Benchmarks

This folder contains a standalone benchmark suite to compare multiple LLM providers/models on the same prompts and dataset.

## Quick start (offline)

Run a smoke benchmark with mock providers (no API keys):

```bash
python -m benchmarks run --config benchmarks/configs/mock.example.toml
```

Outputs are written under `benchmarks/results/<run_id>/` with `summary.md` and `summary.csv`.
The runner prints live progress in the terminal.

## Environment variables

The CLI auto-loads `.env` at the repo root and `benchmarks/.env` if present. You can copy `benchmarks/.env.example` to `benchmarks/.env`.

## Live benchmark

1) Set API keys (examples):

```bash
export OPENAI_API_KEY=...
export GEMINI_API_KEY=...
export XAI_API_KEY=...
```

2) Install the xAI SDK if you plan to use xAI models:

```bash
pip install xai-sdk
```

3) Edit `benchmarks/configs/bench.example.toml` (judge + models), then run:

```bash
python -m benchmarks run --config benchmarks/configs/bench.example.toml
```

Note: if `google:gemini-2.5-flash` is included in your model list, its labels are used as the reference for downstream tasks (subcategory summaries and report summaries) so all models summarize the same labeled slices.

## Build a local Steam dataset (gitignored)

Steam review text may have redistribution constraints, so Steam datasets are generated locally and not committed.

```bash
python -m benchmarks build-steam-dataset \
  --output benchmarks/datasets/steam_myset \
  --app-ids 1091500 1086940 1245620
```
