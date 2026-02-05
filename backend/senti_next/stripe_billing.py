"""Stripe billing integration for subscription management."""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Stripe configuration from environment
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_PRICE_INDIE = os.getenv("STRIPE_PRICE_INDIE")
STRIPE_PRICE_PRO = os.getenv("STRIPE_PRICE_PRO")
STRIPE_PRICE_MAX = os.getenv("STRIPE_PRICE_MAX")
# Annual pricing
STRIPE_PRICE_INDIE_ANNUAL = os.getenv("STRIPE_PRICE_INDIE_ANNUAL")
STRIPE_PRICE_PRO_ANNUAL = os.getenv("STRIPE_PRICE_PRO_ANNUAL")
STRIPE_PRICE_MAX_ANNUAL = os.getenv("STRIPE_PRICE_MAX_ANNUAL")

# Map price IDs to tiers
PRICE_TO_TIER = {}
if STRIPE_PRICE_INDIE:
    PRICE_TO_TIER[STRIPE_PRICE_INDIE] = "indie"
if STRIPE_PRICE_PRO:
    PRICE_TO_TIER[STRIPE_PRICE_PRO] = "pro"
if STRIPE_PRICE_MAX:
    PRICE_TO_TIER[STRIPE_PRICE_MAX] = "max"
# Annual prices map to same tiers
if STRIPE_PRICE_INDIE_ANNUAL:
    PRICE_TO_TIER[STRIPE_PRICE_INDIE_ANNUAL] = "indie"
if STRIPE_PRICE_PRO_ANNUAL:
    PRICE_TO_TIER[STRIPE_PRICE_PRO_ANNUAL] = "pro"
if STRIPE_PRICE_MAX_ANNUAL:
    PRICE_TO_TIER[STRIPE_PRICE_MAX_ANNUAL] = "max"


def is_stripe_configured() -> bool:
    """Check if Stripe is properly configured."""
    return bool(STRIPE_SECRET_KEY)


def _get_stripe():
    """Get configured Stripe client."""
    if not STRIPE_SECRET_KEY:
        raise ValueError("STRIPE_SECRET_KEY is not configured")

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    return stripe


def create_checkout_session(
    user_id: str,
    tier: str,
    success_url: str,
    cancel_url: str,
    user_email: Optional[str] = None,
    billing_period: str = "monthly",
) -> str:
    """Create a Stripe Checkout session for subscription.

    Args:
        user_id: User ID to associate with subscription
        tier: Target tier ('indie' or 'pro')
        success_url: URL to redirect to on success
        cancel_url: URL to redirect to on cancel
        user_email: Optional email to prefill
        billing_period: 'monthly' or 'annual'

    Returns:
        Checkout session URL to redirect user to
    """
    from . import credits

    stripe = _get_stripe()

    # Get price ID for tier and billing period
    if billing_period == "annual":
        if tier == "indie":
            price_id = STRIPE_PRICE_INDIE_ANNUAL
        elif tier == "pro":
            price_id = STRIPE_PRICE_PRO_ANNUAL
        else:
            raise ValueError(f"Invalid tier for checkout: {tier}")
        if not price_id:
            raise ValueError(f"STRIPE_PRICE_{tier.upper()}_ANNUAL is not configured")
    else:
        if tier == "indie":
            price_id = STRIPE_PRICE_INDIE
        elif tier == "pro":
            price_id = STRIPE_PRICE_PRO
        else:
            raise ValueError(f"Invalid tier for checkout: {tier}")
        if not price_id:
            raise ValueError(f"STRIPE_PRICE_{tier.upper()} is not configured")

    # Get or create Stripe customer
    subscription = credits.get_user_subscription(user_id)
    customer_id = subscription.get("stripe_customer_id")

    if not customer_id:
        # Create new Stripe customer
        customer_params = {"metadata": {"user_id": user_id}}
        if user_email:
            customer_params["email"] = user_email

        customer = stripe.Customer.create(**customer_params)
        customer_id = customer.id
        credits.set_stripe_customer(user_id, customer_id)
        logger.info(f"Created Stripe customer {customer_id} for user {user_id}")

    # Create checkout session
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": user_id, "tier": tier},
        subscription_data={"metadata": {"user_id": user_id}},
    )

    logger.info(f"Created checkout session {session.id} for user {user_id}, tier {tier}")
    return session.url


def create_customer_portal_session(user_id: str, return_url: str) -> str:
    """Create a Stripe Customer Portal session for subscription management.

    Args:
        user_id: User ID
        return_url: URL to return to after portal

    Returns:
        Portal session URL to redirect user to
    """
    from . import credits

    stripe = _get_stripe()

    subscription = credits.get_user_subscription(user_id)
    customer_id = subscription.get("stripe_customer_id")

    if not customer_id:
        raise ValueError("User does not have a Stripe customer account")

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )

    logger.info(f"Created portal session for user {user_id}")
    return session.url


def handle_webhook_event(payload: bytes, signature: str) -> dict:
    """Handle incoming Stripe webhook event.

    Args:
        payload: Raw request body
        signature: Stripe-Signature header value

    Returns:
        Dict with event handling result
    """
    from . import credits

    stripe = _get_stripe()

    if not STRIPE_WEBHOOK_SECRET:
        raise ValueError("STRIPE_WEBHOOK_SECRET is not configured")

    # Verify webhook signature
    try:
        event = stripe.Webhook.construct_event(
            payload, signature, STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Webhook signature verification failed: {e}")
        raise ValueError("Invalid webhook signature")

    event_type = event["type"]
    data = event["data"]["object"]

    logger.info(f"Received Stripe webhook: {event_type}")

    # Handle different event types
    if event_type == "checkout.session.completed":
        return _handle_checkout_completed(data)

    elif event_type == "customer.subscription.updated":
        return _handle_subscription_updated(data)

    elif event_type == "customer.subscription.deleted":
        return _handle_subscription_deleted(data)

    elif event_type == "invoice.paid":
        return _handle_invoice_paid(data)

    elif event_type == "invoice.payment_failed":
        return _handle_payment_failed(data)

    else:
        logger.debug(f"Ignoring webhook event type: {event_type}")
        return {"status": "ignored", "event_type": event_type}


def _handle_checkout_completed(session: dict) -> dict:
    """Handle successful checkout session completion."""
    from . import credits

    user_id = session.get("metadata", {}).get("user_id")
    tier = session.get("metadata", {}).get("tier")
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    if not user_id:
        logger.error("Checkout completed without user_id in metadata")
        return {"status": "error", "message": "Missing user_id"}

    logger.info(f"Checkout completed for user {user_id}, tier {tier}")

    # Update customer ID if not set
    if customer_id:
        credits.set_stripe_customer(user_id, customer_id)

    # Get subscription details to find price
    if subscription_id:
        stripe = _get_stripe()
        subscription = stripe.Subscription.retrieve(subscription_id)
        price_id = subscription["items"]["data"][0]["price"]["id"] if subscription["items"]["data"] else None

        if tier and tier in credits.TIER_LIMITS:
            credits.update_tier(user_id, tier, subscription_id, price_id)
            credits.reset_monthly_credits(user_id)

    return {"status": "success", "user_id": user_id, "tier": tier}


def _handle_subscription_updated(subscription: dict) -> dict:
    """Handle subscription update (tier change, renewal, etc.)."""
    from . import credits

    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")
    status = subscription.get("status")

    # Get user by customer ID
    user_id = credits.get_user_by_stripe_customer(customer_id)
    if not user_id:
        logger.warning(f"Subscription updated for unknown customer {customer_id}")
        return {"status": "ignored", "message": "Unknown customer"}

    # Get current price/tier
    items = subscription.get("items", {}).get("data", [])
    if not items:
        return {"status": "ignored", "message": "No subscription items"}

    price_id = items[0].get("price", {}).get("id")
    tier = PRICE_TO_TIER.get(price_id)

    if not tier:
        logger.warning(f"Unknown price ID: {price_id}")
        return {"status": "ignored", "message": "Unknown price"}

    if status == "active":
        credits.update_tier(user_id, tier, subscription_id, price_id)
        logger.info(f"Updated subscription for user {user_id} to {tier}")
        return {"status": "success", "user_id": user_id, "tier": tier}

    return {"status": "ignored", "message": f"Subscription status: {status}"}


def _handle_subscription_deleted(subscription: dict) -> dict:
    """Handle subscription cancellation - downgrade to free tier."""
    from . import credits

    customer_id = subscription.get("customer")

    user_id = credits.get_user_by_stripe_customer(customer_id)
    if not user_id:
        logger.warning(f"Subscription deleted for unknown customer {customer_id}")
        return {"status": "ignored", "message": "Unknown customer"}

    # Downgrade to free tier
    credits.update_tier(user_id, "free")
    logger.info(f"Downgraded user {user_id} to free tier after subscription deletion")

    return {"status": "success", "user_id": user_id, "tier": "free"}


def _handle_invoice_paid(invoice: dict) -> dict:
    """Handle successful invoice payment - reset monthly credits."""
    from . import credits

    customer_id = invoice.get("customer")
    subscription_id = invoice.get("subscription")

    # Skip one-time payments
    if not subscription_id:
        return {"status": "ignored", "message": "Not a subscription invoice"}

    user_id = credits.get_user_by_stripe_customer(customer_id)
    if not user_id:
        logger.warning(f"Invoice paid for unknown customer {customer_id}")
        return {"status": "ignored", "message": "Unknown customer"}

    # Reset monthly credits
    credits.reset_monthly_credits(user_id)
    logger.info(f"Reset monthly credits for user {user_id} after invoice payment")

    return {"status": "success", "user_id": user_id, "action": "credits_reset"}


def _handle_payment_failed(invoice: dict) -> dict:
    """Handle failed payment."""
    customer_id = invoice.get("customer")

    from . import credits
    user_id = credits.get_user_by_stripe_customer(customer_id)

    logger.warning(f"Payment failed for customer {customer_id}, user {user_id}")

    # We don't immediately downgrade on payment failure - Stripe will retry
    # and eventually send subscription.deleted if all retries fail

    return {"status": "logged", "user_id": user_id, "action": "payment_failed"}


def sync_subscription_status(user_id: str) -> Optional[dict]:
    """Sync subscription status from Stripe.

    Useful for verifying current state matches Stripe.
    """
    from . import credits

    subscription = credits.get_user_subscription(user_id)
    customer_id = subscription.get("stripe_customer_id")

    if not customer_id:
        return None

    stripe = _get_stripe()

    try:
        # Get active subscriptions for customer
        subscriptions = stripe.Subscription.list(
            customer=customer_id,
            status="active",
            limit=1,
        )

        if not subscriptions.data:
            # No active subscription - should be free tier
            if subscription["tier"] != "free":
                credits.update_tier(user_id, "free")
            return {"tier": "free", "synced": True}

        # Get tier from price
        sub = subscriptions.data[0]
        price_id = sub["items"]["data"][0]["price"]["id"] if sub["items"]["data"] else None
        tier = PRICE_TO_TIER.get(price_id, "free")

        if subscription["tier"] != tier:
            credits.update_tier(user_id, tier, sub["id"], price_id)

        return {"tier": tier, "subscription_id": sub["id"], "synced": True}

    except Exception as e:
        logger.error(f"Failed to sync subscription for user {user_id}: {e}")
        return None


__all__ = [
    "is_stripe_configured",
    "create_checkout_session",
    "create_customer_portal_session",
    "handle_webhook_event",
    "sync_subscription_status",
]
