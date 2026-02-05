"""Test script to compare Gemini models for translation and other tasks.

Usage:
    python -m backend.tests.test_llm_models

Environment variables:
    GEMINI_API_KEY - Required for API access
    SENTINEXT_GEMINI_MODEL - Main model (default: gemini-flash-lite-latest)
    SENTINEXT_GEMINI_MODEL_CHEAP - Cheap model for translation (default: gemini-flash-lite-latest)
"""

import os
import sys
import time

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

def test_models():
    """Test different Gemini models and compare their responses."""

    print("=" * 60)
    print("GEMINI MODEL COMPARISON TEST")
    print("=" * 60)

    # Check API key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("\nERROR: GEMINI_API_KEY environment variable not set")
        print("Set it with: export GEMINI_API_KEY='your-key-here'")
        sys.exit(1)

    print(f"\nAPI Key: {api_key[:10]}...{api_key[-4:]}")

    # Import after path setup
    from backend.senti_next import llm

    print(f"\n[Configuration]")
    print(f"  GEMINI_MODEL (main): {llm.GEMINI_MODEL}")
    print(f"  GEMINI_MODEL_CHEAP: {llm.GEMINI_MODEL_CHEAP}")

    # Test models to compare
    models_to_test = [
        "gemini-flash-lite-latest",
        "gemini-2.0-flash",
        "gemini-2.5-flash",
    ]

    # Test prompts
    test_prompts = [
        {
            "name": "Translation (English to Italian)",
            "prompt": "Translate the following text to Italian.\nOnly output the translated text, nothing else.\n\nText to translate:\nThe game has excellent graphics but the loading times are too long.",
        },
        {
            "name": "Translation (English to French)",
            "prompt": "Translate the following text to French.\nOnly output the translated text, nothing else.\n\nText to translate:\nPlayers are complaining about server disconnections during multiplayer matches.",
        },
        {
            "name": "Simple classification",
            "prompt": "Classify this game review into one category: positive, negative, or mixed.\n\nReview: The graphics are stunning but the gameplay gets repetitive after a few hours.\n\nOutput only the category name.",
        },
    ]

    print("\n" + "=" * 60)
    print("TESTING MODELS")
    print("=" * 60)

    results = {}

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

            except Exception as e:
                print(f"  ERROR: {e}")
                results[model]["times"].append(None)
                results[model]["outputs"].append(None)

    # Summary
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
    print("""
For translation tasks, gemini-flash-lite-latest is recommended because:
- It's significantly cheaper than gemini-2.0-flash and gemini-2.5-flash
- Translation is a simple task that doesn't need advanced reasoning
- Quality is sufficient for UI text translation

Current configuration:
- Set SENTINEXT_GEMINI_MODEL=gemini-2.5-flash for complex tasks (chat, classification)
- Set SENTINEXT_GEMINI_MODEL_CHEAP=gemini-flash-lite-latest for translation

On Render, add these environment variables:
  SENTINEXT_GEMINI_MODEL=gemini-2.5-flash
  SENTINEXT_GEMINI_MODEL_CHEAP=gemini-flash-lite-latest
""")


def test_translation_function():
    """Test the translate_text function directly."""
    print("\n" + "=" * 60)
    print("TESTING translate_text FUNCTION")
    print("=" * 60)

    from backend.senti_next import llm

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
        except Exception as e:
            print(f"  ERROR: {e}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test Gemini models")
    parser.add_argument("--compare", action="store_true", help="Compare all models")
    parser.add_argument("--translate", action="store_true", help="Test translation function only")
    args = parser.parse_args()

    if args.translate:
        test_translation_function()
    elif args.compare:
        test_models()
    else:
        # Default: run both
        test_models()
        test_translation_function()
