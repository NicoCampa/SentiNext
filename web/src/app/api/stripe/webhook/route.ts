import { NextResponse } from "next/server";

import Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { stripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

async function triggerPdfJob(appId: number, email: string) {
  const env = getEnv();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.SENTINEXT_SERVICE_TOKEN) {
    headers["x-service-token"] = env.SENTINEXT_SERVICE_TOKEN;
  }

  const response = await fetch(`${env.SENTINEXT_API_BASE_URL}/report/pdf`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      app_id: appId,
      email,
      review_count: 100,
      language: "english",
      filter: "recent",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Backend PDF job failed (${response.status}): ${detail}`);
  }
}

export async function POST(request: Request) {
  const env = getEnv();
  const stripe = stripeClient();

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Missing stripe-signature", { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new NextResponse(`Webhook error: ${(err as Error).message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const appIdRaw = session.metadata?.app_id || session.metadata?.appId;
    const email = session.customer_details?.email || session.customer_email || session.metadata?.email;

    const appId = appIdRaw ? Number(appIdRaw) : NaN;
    if (!email || Number.isNaN(appId) || appId <= 0) {
      return new NextResponse("Missing metadata (app_id/email)", { status: 400 });
    }

    try {
      await triggerPdfJob(appId, email);
    } catch (err) {
      // Return 200 so Stripe doesn't endlessly retry; inspect logs for failures.
      console.error(err);
      return NextResponse.json({ ok: false }, { status: 200 });
    }
  }

  return NextResponse.json({ received: true });
}

