"""Credit management for subscription tier system."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import text

logger = logging.getLogger(__name__)

# Tier configuration
TIER_LIMITS = {
    "free": 500,
    "pro": 5000,
    "max": 25000,
}

TIER_PRICES = {
    "free": 0,
    "pro": 19,
    "max": 49,
}

# Credit costs per operation
CREDIT_COSTS = {
    "classify": 1,        # Per new review classification (LLM call)
    "classify_cached": 0.5,  # Per cached review (no LLM call, just retrieval)
    "chat": 3,            # Per chat message (higher token usage)
    "summarize": 2,       # Per subcategory summary generation
}

# Soft limit buffer (10% overage allowed)
SOFT_LIMIT_BUFFER = 0.10


def get_user_subscription(user_id: str) -> Dict[str, Any]:
    """Get or create user subscription record.

    Returns a dict with subscription details including:
    - tier: 'free', 'pro', or 'max'
    - credits_balance: current credit balance
    - credits_monthly_limit: monthly credit limit for tier
    - credits_used_this_period: credits used in current billing period
    - current_period_start: start of current billing period
    - current_period_end: end of current billing period
    - stripe_customer_id: Stripe customer ID (if any)
    - stripe_subscription_id: Stripe subscription ID (if any)
    """
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                SELECT tier, credits_balance, credits_monthly_limit, credits_used_this_period,
                       current_period_start, current_period_end, stripe_customer_id,
                       stripe_subscription_id, stripe_price_id, created_at, updated_at
                FROM user_subscriptions
                WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        )
        row = result.fetchone()

        if row is None:
            # Create default free tier subscription
            now = datetime.now(timezone.utc)
            period_end = datetime(now.year, now.month + 1 if now.month < 12 else 1,
                                  1 if now.month < 12 else now.year + 1,
                                  tzinfo=timezone.utc)
            # Handle month overflow properly
            if now.month == 12:
                period_end = datetime(now.year + 1, 1, now.day, tzinfo=timezone.utc)
            else:
                # Try to use same day, fallback to last day of month
                try:
                    period_end = datetime(now.year, now.month + 1, now.day, tzinfo=timezone.utc)
                except ValueError:
                    # Day doesn't exist in next month, use last day
                    if now.month + 1 == 2:
                        period_end = datetime(now.year, 3, 1, tzinfo=timezone.utc)
                    elif now.month + 1 in [4, 6, 9, 11]:
                        period_end = datetime(now.year, now.month + 1, 30, tzinfo=timezone.utc)
                    else:
                        period_end = datetime(now.year, now.month + 2, 1, tzinfo=timezone.utc)

            conn.execute(
                text("""
                    INSERT INTO user_subscriptions
                    (user_id, tier, credits_balance, credits_monthly_limit, credits_used_this_period,
                     current_period_start, current_period_end, created_at, updated_at)
                    VALUES (:user_id, 'free', :limit, :limit, 0, :period_start, :period_end, :now, :now)
                """),
                {
                    "user_id": user_id,
                    "limit": TIER_LIMITS["free"],
                    "period_start": now,
                    "period_end": period_end,
                    "now": now,
                },
            )
            conn.commit()

            return {
                "tier": "free",
                "credits_balance": TIER_LIMITS["free"],
                "credits_monthly_limit": TIER_LIMITS["free"],
                "credits_used_this_period": 0,
                "current_period_start": now,
                "current_period_end": period_end,
                "stripe_customer_id": None,
                "stripe_subscription_id": None,
                "stripe_price_id": None,
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
        }


def check_credits_available(user_id: str, amount: int) -> Tuple[bool, str, Dict[str, Any]]:
    """Check if user has enough credits for an operation.

    Returns:
        Tuple of (can_proceed, message, status_dict)
        - can_proceed: True if operation should be allowed
        - message: Warning or error message (empty if OK)
        - status_dict: Current credit status
    """
    subscription = get_user_subscription(user_id)
    balance = subscription["credits_balance"]
    limit = subscription["credits_monthly_limit"]

    # Calculate the hard limit (110% of monthly limit)
    hard_limit = int(limit * (1 + SOFT_LIMIT_BUFFER))
    used_this_period = subscription["credits_used_this_period"]

    status = get_credit_status(user_id)

    # Check if at hard limit (110%)
    if used_this_period >= hard_limit:
        return (
            False,
            f"Credit limit exceeded. Your {subscription['tier']} plan allows {limit:,} credits/month. "
            f"Upgrade your plan or wait for your credits to reset.",
            status,
        )

    # Check if this operation would exceed hard limit
    if used_this_period + amount > hard_limit:
        remaining = hard_limit - used_this_period
        return (
            False,
            f"Insufficient credits. This operation requires {amount:,} credits but you only have {remaining:,} remaining. "
            f"Upgrade your plan or wait for your credits to reset.",
            status,
        )

    # Check if over soft limit (100%) - allow but warn
    if used_this_period >= limit:
        return (
            True,
            f"Warning: You've exceeded your monthly credit limit ({limit:,}). "
            f"Operations are allowed up to 110% ({hard_limit:,}) but consider upgrading.",
            status,
        )

    # Check if this operation would exceed soft limit
    if used_this_period + amount > limit:
        return (
            True,
            f"Warning: This operation will exceed your monthly credit limit ({limit:,}). "
            f"You have {limit - used_this_period:,} credits remaining in your allowance.",
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
    """Deduct credits from user's balance.

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

    # First check if we can proceed
    can_proceed, message, _ = check_credits_available(user_id, amount)
    if not can_proceed:
        logger.warning(f"Credit deduction blocked for user {user_id}: {message}")
        return False

    now = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        # Update balance and usage atomically
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
        row = result.fetchone()

        if row is None:
            # User doesn't exist, create subscription first
            get_user_subscription(user_id)
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
            row = result.fetchone()

        balance_after = row[0] if row else 0

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
        conn.commit()

    logger.info(f"Deducted {amount} credits from user {user_id} for {operation}. New balance: {balance_after}")
    return True


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
        conn.commit()

    logger.info(f"Added {amount} credits to user {user_id} for {reason}. New balance: {balance_after}")
    return balance_after


def reset_monthly_credits(user_id: str) -> None:
    """Reset credits to monthly limit at billing cycle start.

    This is called when Stripe invoice.paid event is received.
    """
    from . import db as db_module

    subscription = get_user_subscription(user_id)
    limit = subscription["credits_monthly_limit"]

    now = datetime.now(timezone.utc)

    # Calculate next period end (1 month from now)
    if now.month == 12:
        period_end = datetime(now.year + 1, 1, now.day, tzinfo=timezone.utc)
    else:
        try:
            period_end = datetime(now.year, now.month + 1, now.day, tzinfo=timezone.utc)
        except ValueError:
            # Handle month overflow
            period_end = datetime(now.year, now.month + 2, 1, tzinfo=timezone.utc)

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
        conn.commit()

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
        conn.commit()

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
        conn.commit()


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


def get_credit_status(user_id: str) -> Dict[str, Any]:
    """Get current credit status for display in UI.

    Returns:
        Dict with:
        - balance: Current credit balance
        - limit: Monthly credit limit
        - used: Credits used this period
        - tier: Subscription tier
        - period_end: When credits reset
        - percent_used: Percentage of limit used
        - warning: True if over 100% of limit
        - blocked: True if at hard limit (110%)
    """
    subscription = get_user_subscription(user_id)

    limit = subscription["credits_monthly_limit"]
    used = subscription["credits_used_this_period"]
    balance = subscription["credits_balance"]
    hard_limit = int(limit * (1 + SOFT_LIMIT_BUFFER))

    percent_used = (used / limit * 100) if limit > 0 else 0

    return {
        "balance": balance,
        "limit": limit,
        "used": used,
        "tier": subscription["tier"],
        "period_end": subscription["current_period_end"].isoformat() if subscription["current_period_end"] else None,
        "percent_used": round(percent_used, 1),
        "warning": used >= limit,
        "blocked": used >= hard_limit,
        "stripe_customer_id": subscription.get("stripe_customer_id"),
    }


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
    "TIER_LIMITS",
    "TIER_PRICES",
    "CREDIT_COSTS",
    "get_user_subscription",
    "check_credits_available",
    "deduct_credits",
    "add_credits",
    "reset_monthly_credits",
    "update_tier",
    "set_stripe_customer",
    "estimate_analysis_cost",
    "get_credit_status",
    "get_user_by_stripe_customer",
]
