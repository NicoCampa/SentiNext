import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.senti_next import credits


def test_calculate_hard_limit_wallet_mode():
    assert credits.calculate_hard_limit(0, used=20, balance=80) == 100
    assert credits.calculate_hard_limit(-1, used=10, balance=5) == 15


def test_check_credits_available_wallet_mode(monkeypatch):
    monkeypatch.setattr(credits, "maybe_reset_billing_period", lambda _user_id: None)
    monkeypatch.setattr(
        credits,
        "get_user_subscription",
        lambda user_id: {
            "credits_balance": 5,
            "credits_monthly_limit": 0,
            "credits_used_this_period": 0,
            "tier": "free",
            "current_period_end": None,
        },
    )
    monkeypatch.setattr(
        credits,
        "get_credit_status",
        lambda user_id: {"balance": 5, "tier": "free"},
    )

    can_proceed, message, status = credits.check_credits_available("u1", 6)
    assert can_proceed is False
    assert "only have 5" in message
    assert status["balance"] == 5

    can_proceed, message, _status = credits.check_credits_available("u1", 3)
    assert can_proceed is True
    assert message == ""


def test_reserve_credits_or_raise_success(monkeypatch):
    monkeypatch.setattr(
        credits,
        "check_credits_available",
        lambda user_id, amount: (True, "", {"balance": 10, "tier": "free"}),
    )
    called = {"deduct": 0}

    def fake_deduct(*_args, **_kwargs):
        called["deduct"] += 1
        return True

    monkeypatch.setattr(credits, "deduct_credits", fake_deduct)

    credits.reserve_credits_or_raise("u1", 3, "chat_simple")
    assert called["deduct"] == 1


def test_reserve_credits_or_raise_failure(monkeypatch):
    monkeypatch.setattr(
        credits,
        "check_credits_available",
        lambda user_id, amount: (False, "no credits", {"balance": 0, "tier": "free"}),
    )

    with pytest.raises(credits.InsufficientCreditsError):
        credits.reserve_credits_or_raise("u1", 1, "chat_simple")


def test_reserve_credits_or_raise_deduct_fail(monkeypatch):
    monkeypatch.setattr(
        credits,
        "check_credits_available",
        lambda user_id, amount: (True, "", {"balance": 10, "tier": "free"}),
    )
    monkeypatch.setattr(credits, "deduct_credits", lambda *_args, **_kwargs: False)

    with pytest.raises(credits.InsufficientCreditsError):
        credits.reserve_credits_or_raise("u1", 1, "chat_simple")
