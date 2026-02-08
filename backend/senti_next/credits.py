"""Credit management for subscription tier system."""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import text

logger = logging.getLogger(__name__)

# Free trial configuration (one-time, no monthly renewal)
TRIAL_CREDITS = 1000

# Monthly credit limits per tier
TIER_LIMITS = {
    "free": 0,          # Trial only — no monthly renewal
    "indie": 5000,
    "pro": 15000,
    "max": 50000,
}

# Pricing (used for admin dashboard MRR estimates)
TIER_PRICES = {
    "free": 0,
    "indie": 8,
    "pro": 20,
    "max": 0,
}

# User-facing tier labels
TIER_LABELS = {
    "free": "Free",
    "indie": "Indie",
    "pro": "Indie",   # legacy — mapped to Indie label for backward compat
    "max": "Enterprise",
}

# Credit costs per operation
CREDIT_COSTS = {
    # Review labeling
    "classify": 1,         # Per new review classification (LLM call)
    "classify_cached": 1,  # Per cached review reuse

    # Chat
    "chat_simple": 2,      # Per non-agent chat message
    "chat_insights": 2,    # Per insights chat message
    "chat_agent": 4,       # Per agent iteration (~4x classify cost)

    # Summaries & utilities
    "summarize": 1,        # Per summary generation
    "report_summary": 1,   # Executive report LLM summary
    "translate": 1,        # Per translation call

    # Compare (billed at endpoint level)
    "compare_overview": 2,  # ~2x classify cost
    "compare_category": 1,  # ~1.4x classify cost
    "compare_subcategory": 1,
}

# ---------------------------------------------------------------------------
# LLM pricing (USD per 1M tokens) — used for admin dashboard cost estimates
# ---------------------------------------------------------------------------
# Format: model_id -> (input_per_1m, output_per_1m)
LLM_MODEL_PRICING = {
    "xai:grok-4-1-fast-non-reasoning": (0.20, 0.50),
    "xai:grok-4-1-fast-reasoning": (0.20, 0.50),
    "google:gemini-flash-lite-latest": (0.10, 0.40),
    "google:gemini-2.5-flash-lite": (0.10, 0.40),
    "google:gemini-2.5-flash": (0.30, 2.50),
}

# Default pricing for unknown models (Gemini flash lite)
DEFAULT_LLM_PRICING = (0.10, 0.40)

# Operation -> pricing when model isn't known (deterministic mapping)
OPERATION_LLM_PRICING = {
    "classify": (0.20, 0.50),       # xAI Grok
    # Everything else uses Gemini flash lite → DEFAULT_LLM_PRICING
}

# ---------------------------------------------------------------------------
# Estimated average tokens per LLM call (input, output)
# Used for "expected cost per user" projections on admin dashboard
# ---------------------------------------------------------------------------
OPERATION_TOKEN_ESTIMATES = {
    "classify": (1200, 200),          # xAI: taxonomy prompt + review → JSON
    "chat_simple": (3000, 800),       # Gemini: system + context + user msg
    "chat_insights": (3000, 1000),    # Gemini: RAG over reviews
    "chat_agent": (6000, 2000),       # Gemini: multi-turn tool-calling
    "summarize": (1500, 400),         # Gemini: subcategory/widget summary
    "report_summary": (2000, 500),    # Gemini: executive report
    "translate": (500, 300),          # Gemini: simple translation
    "compare_overview": (3000, 800),  # Gemini: multi-game comparison
    "compare_category": (2500, 600),
    "compare_subcategory": (2000, 400),
    "summarize_news": (2000, 500),
    "export_refresh": (2000, 500),
}



class InsufficientCreditsError(Exception):
    """Raised when a user lacks sufficient credits for an operation."""

    def __init__(self, message: str, amount: int, status: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.amount = int(amount)
        self.status = status or {}


def _calculate_period_end(now: datetime) -> datetime:
    """Calculate the next billing period end (same day next month, or last day)."""
    year = now.year + (1 if now.month == 12 else 0)
    month = 1 if now.month == 12 else now.month + 1
    day = now.day
    try:
        return datetime(year, month, day, tzinfo=timezone.utc)
    except ValueError:
        # Fallback to last day of the target month
        if month == 12:
            next_month = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            next_month = datetime(year, month + 1, 1, tzinfo=timezone.utc)
        return next_month - timedelta(days=1)


def _calculate_bonus_credits(balance: int, limit: int, used: int) -> int:
    """Calculate credits granted beyond the monthly limit."""
    base_remaining = limit - used
    bonus = balance - base_remaining
    return int(bonus) if bonus > 0 else 0


def calculate_hard_limit(limit: int, used: int, balance: int) -> int:
    """Calculate hard limit — monthly limit plus any bonus credits (no overage buffer)."""
    if limit <= 0:
        used_val = int(used or 0)
        balance_val = int(balance or 0)
        return max(used_val + balance_val, 0)
    bonus = _calculate_bonus_credits(balance, limit, used)
    return int(limit + bonus)


def maybe_reset_billing_period(user_id: str) -> None:
    """Reset billing period if expired (lazy rollover)."""
    from . import db as db_module

    now = datetime.now(timezone.utc)
    with db_module.get_connection() as conn:
        row = conn.execute(
            text("""
                SELECT credits_balance, credits_monthly_limit, credits_used_this_period,
                       current_period_end
                FROM user_subscriptions
                WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        ).fetchone()

        if row is None:
            return

        balance, limit, used, period_end = row[0], row[1], row[2], row[3]
        if limit is None or int(limit) <= 0:
            return

        if period_end is None or now < period_end:
            return

        bonus_remaining = _calculate_bonus_credits(int(balance or 0), int(limit or 0), int(used or 0))
        new_balance = int(limit) + max(int(bonus_remaining or 0), 0)
        period_end_new = _calculate_period_end(now)

        conn.execute(
            text("""
                UPDATE user_subscriptions
                SET credits_balance = :balance,
                    credits_used_this_period = 0,
                    current_period_start = :period_start,
                    current_period_end = :period_end,
                    updated_at = :now
                WHERE user_id = :user_id
            """),
            {
                "user_id": user_id,
                "balance": new_balance,
                "period_start": now,
                "period_end": period_end_new,
                "now": now,
            },
        )

        conn.execute(
            text("""
                INSERT INTO credit_transactions
                (user_id, amount, operation, description, balance_after, created_at)
                VALUES (:user_id, :amount, 'monthly_reset', 'Monthly credit reset', :balance_after, :now)
            """),
            {
                "user_id": user_id,
                "amount": int(limit),
                "balance_after": new_balance,
                "now": now,
            },
        )


def get_user_subscription(user_id: str) -> Dict[str, Any]:
    """Get or create user subscription record.

    Returns a dict with subscription details including:
    - tier: 'free', 'indie', 'pro', or 'max' (enterprise)
    - credits_balance: current credit balance
    - credits_monthly_limit: monthly credit limit for tier
    - credits_used_this_period: credits used in current billing period
    - current_period_start: start of current billing period
    - current_period_end: end of current billing period
    - stripe_customer_id: Stripe customer ID (if any)
    - stripe_subscription_id: Stripe subscription ID (if any)
    """
    from . import db as db_module

    try:
        maybe_reset_billing_period(user_id)
    except Exception as exc:
        logger.debug("Billing period reset check failed: %s", exc)

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                SELECT tier, credits_balance, credits_monthly_limit, credits_used_this_period,
                       current_period_start, current_period_end, stripe_customer_id,
                       stripe_subscription_id, stripe_price_id, created_at, updated_at,
                       COALESCE(cancel_at_period_end, FALSE) AS cancel_at_period_end,
                       COALESCE(payment_failed, FALSE) AS payment_failed
                FROM user_subscriptions
                WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        )
        row = result.fetchone()

        if row is None:
            # Create default free tier subscription
            now = datetime.now(timezone.utc)
            period_end = _calculate_period_end(now)

            conn.execute(
                text("""
                    INSERT INTO user_subscriptions
                    (user_id, tier, credits_balance, credits_monthly_limit, credits_used_this_period,
                     current_period_start, current_period_end, created_at, updated_at)
                    VALUES (:user_id, 'free', :balance, :limit, 0, :period_start, :period_end, :now, :now)
                """),
                {
                    "user_id": user_id,
                    "balance": TRIAL_CREDITS,
                    "limit": TIER_LIMITS["free"],
                    "period_start": now,
                    "period_end": period_end,
                    "now": now,
                },
            )

            return {
                "tier": "free",
                "credits_balance": TRIAL_CREDITS,
                "credits_monthly_limit": TIER_LIMITS["free"],
                "credits_used_this_period": 0,
                "current_period_start": now,
                "current_period_end": period_end,
                "stripe_customer_id": None,
                "stripe_subscription_id": None,
                "stripe_price_id": None,
                "cancel_at_period_end": False,
                "payment_failed": False,
            }

        return {
            "tier": row[0],
            "credits_balance": row[1],
            "credits_monthly_limit": row[2],
            "credits_used_this_period": row[3],
            "current_period_start": row[4],
            "current_period_end": row[5],
            "stripe_customer_id": row[6],
            "stripe_subscription_id": row[7],
            "stripe_price_id": row[8],
            "cancel_at_period_end": bool(row[11]),
            "payment_failed": bool(row[12]),
        }


def check_credits_available(user_id: str, amount: int) -> Tuple[bool, str, Dict[str, Any]]:
    """Check if user has enough credits for an operation.

    Returns:
        Tuple of (can_proceed, message, status_dict)
        - can_proceed: True if operation should be allowed
        - message: Warning or error message (empty if OK)
        - status_dict: Current credit status
    """
    try:
        maybe_reset_billing_period(user_id)
    except Exception as exc:
        logger.debug("Billing period reset check failed: %s", exc)

    subscription = get_user_subscription(user_id)
    balance = subscription["credits_balance"]
    limit = subscription["credits_monthly_limit"]

    used_this_period = subscription["credits_used_this_period"]

    status = get_credit_status(user_id)

    # Wallet-only mode (no monthly limit)
    if limit is None or int(limit) <= 0:
        available = max(int(balance or 0), 0)
        if amount > available:
            return (
                False,
                f"Insufficient credits. This operation requires {amount:,} credits but you only have {available:,} remaining.",
                status,
            )
        return (True, "", status)

    # Calculate the hard limit (monthly limit + any bonus credits)
    hard_limit = calculate_hard_limit(limit, used_this_period, balance)

    # Check if at or over the limit
    if used_this_period >= hard_limit:
        tier_label = TIER_LABELS.get(subscription["tier"], subscription["tier"])
        return (
            False,
            f"Credit limit reached. Your {tier_label} plan allows {limit:,} credits/month. "
            f"Upgrade your plan or wait for your credits to reset.",
            status,
        )

    # Check if this operation would exceed the limit
    if used_this_period + amount > hard_limit:
        remaining = hard_limit - used_this_period
        return (
            False,
            f"Insufficient credits. This operation requires {amount:,} credits but you only have {remaining:,} remaining. "
            f"Upgrade your plan or wait for your credits to reset.",
            status,
        )

    # Check if approaching limit (80% threshold) — allow but warn
    warning_threshold = limit * 0.8
    if used_this_period >= warning_threshold:
        percent_used = int((used_this_period / limit) * 100)
        remaining = limit - used_this_period
        return (
            True,
            f"Notice: You've used {percent_used}% of your monthly credits ({remaining:,} remaining). "
            f"Consider upgrading if you need more capacity.",
            status,
        )

    return (True, "", status)


def deduct_credits(
    user_id: str,
    amount: int,
    operation: str,
    description: Optional[str] = None,
    app_id: Optional[int] = None,
    session_id: Optional[str] = None,
) -> bool:
    """Deduct credits from user's balance atomically.

    Uses SELECT ... FOR UPDATE to prevent race conditions from concurrent
    requests (e.g., multiple browser tabs). The credit check and deduction
    happen within the same transaction under a row lock.

    Args:
        user_id: User ID
        amount: Number of credits to deduct
        operation: Type of operation (e.g., 'classify', 'chat')
        description: Optional description
        app_id: Optional app ID for tracking
        session_id: Optional session ID for chat tracking

    Returns:
        True if deduction was successful, False if insufficient credits
    """
    from . import db as db_module

    try:
        maybe_reset_billing_period(user_id)
    except Exception as exc:
        logger.debug("Billing period reset check failed: %s", exc)

    # Ensure user subscription exists before atomic deduction
    get_user_subscription(user_id)

    now = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        # Lock the row and read current state atomically
        row = conn.execute(
            text("""
                SELECT credits_balance, credits_monthly_limit, credits_used_this_period, tier
                FROM user_subscriptions
                WHERE user_id = :user_id
                FOR UPDATE
            """),
            {"user_id": user_id},
        ).fetchone()

        if row is None:
            logger.warning(f"Credit deduction failed: user {user_id} not found")
            return False

        balance, limit, used, tier = int(row[0] or 0), int(row[1] or 0), int(row[2] or 0), row[3]

        # Perform credit availability check under the lock
        if limit is not None and limit > 0:
            hard_limit = calculate_hard_limit(limit, used, balance)
            if used + amount > hard_limit:
                conn.rollback()
                tier_label = TIER_LABELS.get(tier, tier)
                logger.warning(
                    f"Credit deduction blocked for user {user_id}: "
                    f"used={used} + amount={amount} > hard_limit={hard_limit} ({tier_label})"
                )
                return False
        else:
            # Wallet-only mode
            if amount > max(balance, 0):
                conn.rollback()
                logger.warning(
                    f"Credit deduction blocked for user {user_id}: "
                    f"amount={amount} > balance={balance} (wallet mode)"
                )
                return False

        # Deduct atomically (row is already locked)
        result = conn.execute(
            text("""
                UPDATE user_subscriptions
                SET credits_balance = credits_balance - :amount,
                    credits_used_this_period = credits_used_this_period + :amount,
                    updated_at = :now
                WHERE user_id = :user_id
                RETURNING credits_balance
            """),
            {"user_id": user_id, "amount": amount, "now": now},
        )
        deducted_row = result.fetchone()
        balance_after = deducted_row[0] if deducted_row else 0

        # Record the transaction
        conn.execute(
            text("""
                INSERT INTO credit_transactions
                (user_id, amount, operation, description, app_id, session_id, balance_after, created_at)
                VALUES (:user_id, :amount, :operation, :description, :app_id, :session_id, :balance_after, :now)
            """),
            {
                "user_id": user_id,
                "amount": -amount,  # Negative for deductions
                "operation": operation,
                "description": description,
                "app_id": app_id,
                "session_id": session_id,
                "balance_after": balance_after,
                "now": now,
            },
        )

    logger.info(f"Deducted {amount} credits from user {user_id} for {operation}. New balance: {balance_after}")
    return True


def refund_credits(
    user_id: str,
    amount: int,
    operation: str,
    description: Optional[str] = None,
    app_id: Optional[int] = None,
    session_id: Optional[str] = None,
) -> int:
    """Refund credits to user's balance and roll back used credits."""
    from . import db as db_module

    # Ensure user exists
    get_user_subscription(user_id)

    now = datetime.now(timezone.utc)
    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                UPDATE user_subscriptions
                SET credits_balance = credits_balance + :amount,
                    credits_used_this_period = GREATEST(credits_used_this_period - :amount, 0),
                    updated_at = :now
                WHERE user_id = :user_id
                RETURNING credits_balance
            """),
            {"user_id": user_id, "amount": amount, "now": now},
        )
        row = result.fetchone()
        balance_after = row[0] if row else amount

        conn.execute(
            text("""
                INSERT INTO credit_transactions
                (user_id, amount, operation, description, app_id, session_id, balance_after, created_at)
                VALUES (:user_id, :amount, :operation, :description, :app_id, :session_id, :balance_after, :now)
            """),
            {
                "user_id": user_id,
                "amount": amount,  # Positive for refunds
                "operation": operation,
                "description": description,
                "app_id": app_id,
                "session_id": session_id,
                "balance_after": balance_after,
                "now": now,
            },
        )

    logger.info(f"Refunded {amount} credits to user {user_id} for {operation}. New balance: {balance_after}")
    return balance_after


def reserve_credits_or_raise(
    user_id: str,
    amount: int,
    operation: str,
    description: Optional[str] = None,
    app_id: Optional[int] = None,
    session_id: Optional[str] = None,
) -> None:
    """Reserve credits or raise InsufficientCreditsError."""
    can_proceed, message, status = check_credits_available(user_id, amount)
    if not can_proceed:
        raise InsufficientCreditsError(message, amount, status)
    if not deduct_credits(
        user_id=user_id,
        amount=amount,
        operation=operation,
        description=description,
        app_id=app_id,
        session_id=session_id,
    ):
        raise InsufficientCreditsError(message or "Insufficient credits.", amount, status)


def add_credits(
    user_id: str,
    amount: int,
    reason: str,
    description: Optional[str] = None,
) -> int:
    """Add credits to user's balance.

    Args:
        user_id: User ID
        amount: Number of credits to add
        reason: Reason for addition (e.g., 'monthly_reset', 'bonus', 'upgrade')
        description: Optional description

    Returns:
        New credit balance
    """
    from . import db as db_module

    # Ensure user exists
    get_user_subscription(user_id)

    now = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                UPDATE user_subscriptions
                SET credits_balance = credits_balance + :amount,
                    updated_at = :now
                WHERE user_id = :user_id
                RETURNING credits_balance
            """),
            {"user_id": user_id, "amount": amount, "now": now},
        )
        row = result.fetchone()
        balance_after = row[0] if row else amount

        # Record the transaction
        conn.execute(
            text("""
                INSERT INTO credit_transactions
                (user_id, amount, operation, description, balance_after, created_at)
                VALUES (:user_id, :amount, :operation, :description, :balance_after, :now)
            """),
            {
                "user_id": user_id,
                "amount": amount,  # Positive for additions
                "operation": reason,
                "description": description,
                "balance_after": balance_after,
                "now": now,
            },
        )

    logger.info(f"Added {amount} credits to user {user_id} for {reason}. New balance: {balance_after}")
    return balance_after


def reset_monthly_credits(user_id: str) -> None:
    """Reset credits to monthly limit at billing cycle start.

    This is called when Stripe invoice.paid event is received.
    """
    from . import db as db_module

    subscription = get_user_subscription(user_id)
    limit = subscription["credits_monthly_limit"]
    if limit <= 0:
        return

    now = datetime.now(timezone.utc)

    # Calculate next period end (same day next month, or last day of month)
    period_end = _calculate_period_end(now)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                UPDATE user_subscriptions
                SET credits_balance = :limit,
                    credits_used_this_period = 0,
                    current_period_start = :period_start,
                    current_period_end = :period_end,
                    updated_at = :now
                WHERE user_id = :user_id
            """),
            {
                "user_id": user_id,
                "limit": limit,
                "period_start": now,
                "period_end": period_end,
                "now": now,
            },
        )

        # Record the reset transaction
        conn.execute(
            text("""
                INSERT INTO credit_transactions
                (user_id, amount, operation, description, balance_after, created_at)
                VALUES (:user_id, :amount, 'monthly_reset', 'Monthly credit reset', :balance_after, :now)
            """),
            {
                "user_id": user_id,
                "amount": limit,
                "balance_after": limit,
                "now": now,
            },
        )

    logger.info(f"Reset monthly credits for user {user_id} to {limit}")


def update_tier(user_id: str, new_tier: str, stripe_subscription_id: Optional[str] = None, stripe_price_id: Optional[str] = None) -> None:
    """Update user's subscription tier.

    Called when subscription changes via Stripe.
    """
    from . import db as db_module

    if new_tier not in TIER_LIMITS:
        raise ValueError(f"Invalid tier: {new_tier}")

    new_limit = TIER_LIMITS[new_tier]

    # Ensure user exists
    get_user_subscription(user_id)

    now = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                UPDATE user_subscriptions
                SET tier = :tier,
                    credits_monthly_limit = :limit,
                    credits_balance = GREATEST(credits_balance, :limit),
                    stripe_subscription_id = COALESCE(:stripe_sub_id, stripe_subscription_id),
                    stripe_price_id = COALESCE(:stripe_price_id, stripe_price_id),
                    updated_at = :now
                WHERE user_id = :user_id
            """),
            {
                "user_id": user_id,
                "tier": new_tier,
                "limit": new_limit,
                "stripe_sub_id": stripe_subscription_id,
                "stripe_price_id": stripe_price_id,
                "now": now,
            },
        )

    logger.info(f"Updated tier for user {user_id} to {new_tier} (limit: {new_limit})")


def set_stripe_customer(user_id: str, stripe_customer_id: str) -> None:
    """Set Stripe customer ID for a user."""
    from . import db as db_module

    # Ensure user exists
    get_user_subscription(user_id)

    now = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                UPDATE user_subscriptions
                SET stripe_customer_id = :stripe_customer_id,
                    updated_at = :now
                WHERE user_id = :user_id
            """),
            {"user_id": user_id, "stripe_customer_id": stripe_customer_id, "now": now},
        )


def estimate_analysis_cost(new_reviews: int, cached_reviews: int = 0) -> int:
    """Estimate credits needed to analyze reviews.

    Args:
        new_reviews: Number of new reviews requiring LLM classification
        cached_reviews: Number of reviews with existing cached labels

    Returns:
        Total credits needed (rounded up)
    """
    import math
    new_cost = new_reviews * CREDIT_COSTS["classify"]
    cached_cost = cached_reviews * CREDIT_COSTS["classify_cached"]
    return math.ceil(new_cost + cached_cost)


def get_user_game_count(user_id: str) -> int:
    """Get count of games analyzed by user (informational only, no limit enforced)."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT COUNT(*) FROM starred_games WHERE user_id = :user_id"),
            {"user_id": user_id},
        )
        row = result.fetchone()
        return row[0] if row else 0


def get_credit_status(user_id: str) -> Dict[str, Any]:
    """Get current subscription status for display in UI.

    Returns:
        Dict with:
        - tier: Subscription tier
        - balance: Current credit balance
        - limit: Monthly credit limit (0 for free/trial)
        - used: Credits used this period
        - percent_used: Usage percentage
        - approaching_limit: True if 80-99% used
        - warning: True if at/over limit or balance exhausted
        - blocked: True if credits exhausted
        - games_used: Number of games analyzed (informational)
        - games_limit: Always null (no game limit)
        - games_remaining: Always null
        - at_game_limit: Always false
        - stripe_customer_id: Stripe customer ID (if any)
    """
    subscription = get_user_subscription(user_id)
    tier = subscription["tier"]

    games_used = get_user_game_count(user_id)

    limit = subscription["credits_monthly_limit"]
    used = subscription["credits_used_this_period"]
    balance = subscription["credits_balance"]

    if limit and limit > 0:
        percent_used = (used / limit * 100) if limit > 0 else 0
        approaching_limit = percent_used >= 80 and percent_used < 100
        warning = used >= limit
        blocked = used >= calculate_hard_limit(limit, used, balance)
    else:
        # Trial / wallet-only mode
        total = max(int(used or 0) + int(balance or 0), 0)
        percent_used = (used / total * 100) if total > 0 else 100
        approaching_limit = total > 0 and int(balance or 0) <= max(1, int(total * 0.2))
        warning = int(balance or 0) <= 0
        blocked = int(balance or 0) <= 0

    return {
        "tier": tier,
        "balance": balance,
        "limit": limit,
        "used": used,
        "period_end": subscription["current_period_end"].isoformat() if subscription["current_period_end"] else None,
        "percent_used": round(percent_used, 1),
        "approaching_limit": approaching_limit,
        "warning": warning,
        "blocked": blocked,
        "stripe_customer_id": subscription.get("stripe_customer_id"),
        "cancel_at_period_end": subscription.get("cancel_at_period_end", False),
        "payment_failed": subscription.get("payment_failed", False),

        # Game fields (no limit enforced, kept for frontend compatibility)
        "games_used": games_used,
        "games_limit": None,
        "games_remaining": None,
        "at_game_limit": False,
    }


def set_cancel_at_period_end(user_id: str, value: bool) -> None:
    """Set or clear the cancel_at_period_end flag for a user."""
    from . import db as db_module

    now = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                UPDATE user_subscriptions
                SET cancel_at_period_end = :value,
                    updated_at = :now
                WHERE user_id = :user_id
            """),
            {"user_id": user_id, "value": value, "now": now},
        )

    logger.info(f"Set cancel_at_period_end={value} for user {user_id}")


def set_payment_failed(user_id: str, value: bool) -> None:
    """Set or clear the payment_failed flag for a user."""
    from . import db as db_module

    now = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                UPDATE user_subscriptions
                SET payment_failed = :value,
                    updated_at = :now
                WHERE user_id = :user_id
            """),
            {"user_id": user_id, "value": value, "now": now},
        )

    logger.info(f"Set payment_failed={value} for user {user_id}")


def get_user_by_stripe_customer(stripe_customer_id: str) -> Optional[str]:
    """Look up user_id by Stripe customer ID."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT user_id FROM user_subscriptions WHERE stripe_customer_id = :cid"),
            {"cid": stripe_customer_id},
        )
        row = result.fetchone()

    return row[0] if row else None


__all__ = [
    "TRIAL_CREDITS",
    "TIER_LIMITS",
    "TIER_PRICES",
    "CREDIT_COSTS",
    "LLM_MODEL_PRICING",
    "DEFAULT_LLM_PRICING",
    "OPERATION_LLM_PRICING",
    "OPERATION_TOKEN_ESTIMATES",
    "InsufficientCreditsError",
    "calculate_hard_limit",
    "maybe_reset_billing_period",
    "get_user_subscription",
    "check_credits_available",
    "get_user_game_count",
    "deduct_credits",
    "refund_credits",
    "reserve_credits_or_raise",
    "add_credits",
    "reset_monthly_credits",
    "update_tier",
    "set_stripe_customer",
    "estimate_analysis_cost",
    "get_credit_status",
    "get_user_by_stripe_customer",
]
