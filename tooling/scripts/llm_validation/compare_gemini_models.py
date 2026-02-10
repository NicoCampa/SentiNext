"""Compare Gemini models for translation and classification.

Usage:
    python tooling/scripts/llm_validation/compare_gemini_models.py --compare
    python tooling/scripts/llm_validation/compare_gemini_models.py --translate

Environment variables:
    GEMINI_API_KEY - Required for API access
    SENTINEXT_GEMINI_MODEL - Main model (default: gemini-flash-lite-latest)
    SENTINEXT_GEMINI_MODEL_CHEAP - Cheap model for translation (default: gemini-flash-lite-latest)
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path


def _ensure_repo_root_on_path() -> None:
    root = Path(__file__).resolve().parents[3]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def _require_api_key() -> bool:
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        print(f"\nAPI Key: {api_key[:10]}...{api_key[-4:]}")
        return True
    print("\nERROR: GEMINI_API_KEY environment variable not set")
    print("Set it with: export GEMINI_API_KEY='your-key-here'")
    return False


def test_models() -> int:
    print("=" * 60)
    print("GEMINI MODEL COMPARISON TEST")
    print("=" * 60)

    if not _require_api_key():
        return 1

    from apps.api.senti_next import llm

    print("\n[Configuration]")
    print(f"  GEMINI_MODEL (main): {llm.GEMINI_MODEL}")
    print(f"  GEMINI_MODEL_CHEAP: {llm.GEMINI_MODEL_CHEAP}")

    models_to_test = [
        "gemini-flash-lite-latest",
        "gemini-2.0-flash",
        "gemini-2.5-flash",
    ]

    test_prompts = [
        {
            "name": "Translation (English to Italian)",
            "prompt": (
                "Translate the following text to Italian.\n"
                "Only output the translated text, nothing else.\n\n"
                "Text to translate:\n"
                "The game has excellent graphics but the loading times are too long."
            ),
        },
        {
            "name": "Translation (English to French)",
            "prompt": (
                "Translate the following text to French.\n"
                "Only output the translated text, nothing else.\n\n"
                "Text to translate:\n"
                "Players are complaining about server disconnections during multiplayer matches."
            ),
        },
        {
            "name": "Simple classification",
            "prompt": (
                "Classify this game review into one category: positive, negative, or mixed.\n\n"
                "Review: The graphics are stunning but the gameplay gets repetitive after a few hours.\n\n"
                "Output only the category name."
            ),
        },
    ]

    print("\n" + "=" * 60)
    print("TESTING MODELS")
    print("=" * 60)

    results: dict[str, dict[str, list]] = {}

    for model in models_to_test:
        print(f"\n{'=' * 60}")
        print(f"Model: {model}")
        print("=" * 60)

        results[model] = {"times": [], "outputs": []}

        for test in test_prompts:
            print(f"\n[{test['name']}]")

            try:
                start = time.time()
                response = llm._run_gemini(test["prompt"], model)
                elapsed = time.time() - start

                results[model]["times"].append(elapsed)
                results[model]["outputs"].append(response.strip())

                print(f"  Time: {elapsed:.2f}s")
                print(f"  Output: {response.strip()[:100]}{'...' if len(response.strip()) > 100 else ''}")
            except Exception as exc:
                print(f"  ERROR: {exc}")
                results[model]["times"].append(None)
                results[model]["outputs"].append(None)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    print(f"\n{'Model':<30} {'Avg Time':<12} {'Success Rate':<15}")
    print("-" * 60)

    for model, data in results.items():
        valid_times = [t for t in data["times"] if t is not None]
        avg_time = sum(valid_times) / len(valid_times) if valid_times else 0
        success_rate = len(valid_times) / len(data["times"]) * 100 if data["times"] else 0
        print(f"{model:<30} {avg_time:.2f}s{'':<7} {success_rate:.0f}%")

    print("\n" + "=" * 60)
    print("RECOMMENDATION")
    print("=" * 60)
    print(
        """
For translation tasks, gemini-flash-lite-latest is recommended because:
- It's significantly cheaper than gemini-2.0-flash and gemini-2.5-flash
- Translation is a simple task that doesn't need advanced reasoning
- Quality is sufficient for UI text translation

Current configuration:
- Set SENTINEXT_GEMINI_MODEL=gemini-2.5-flash for complex tasks (chat, classification)
- Set SENTINEXT_GEMINI_MODEL_CHEAP=gemini-flash-lite-latest for translation

Set these environment variables:
  SENTINEXT_GEMINI_MODEL=gemini-2.5-flash
  SENTINEXT_GEMINI_MODEL_CHEAP=gemini-flash-lite-latest
"""
    )
    return 0


def test_translation_function() -> int:
    print("\n" + "=" * 60)
    print("TESTING translate_text FUNCTION")
    print("=" * 60)

    if not _require_api_key():
        return 1

    from apps.api.senti_next import llm

    test_texts = [
        ("The game crashes frequently on startup.", "it"),
        ("Performance issues reported by many players.", "fr"),
        ("Great storyline but combat feels clunky.", "de"),
    ]

    for text, lang in test_texts:
        print(f"\n[Translating to {lang}]")
        print(f"  Input: {text}")

        try:
            start = time.time()
            translated, model_id = llm.translate_text(text, lang)
            elapsed = time.time() - start

            print(f"  Output: {translated}")
            print(f"  Model: {model_id}")
            print(f"  Time: {elapsed:.2f}s")
        except Exception as exc:
            print(f"  ERROR: {exc}")
    return 0


def main() -> int:
    _ensure_repo_root_on_path()
    parser = argparse.ArgumentParser(description="Test Gemini models")
    parser.add_argument("--compare", action="store_true", help="Compare all models")
    parser.add_argument("--translate", action="store_true", help="Test translation function only")
    args = parser.parse_args()

    if args.translate:
        return test_translation_function()
    if args.compare:
        return test_models()
    result = test_models()
    if result != 0:
        return result
    return test_translation_function()


if __name__ == "__main__":
    raise SystemExit(main())
