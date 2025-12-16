import { NextResponse } from "next/server";
import { z } from "zod";

import { getCheckoutEnv } from "@/lib/env";
import { stripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

const bodySchema = z.object({
  appId: z
    .string()
    .trim()
    .regex(/^\d+$/, { message: "Steam app id must be numeric" }),
  email: z.string().trim().email(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  }

  let env: ReturnType<typeof getCheckoutEnv>;
  try {
    env = getCheckoutEnv();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const appUrl = env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const stripe = stripeClient(env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: parsed.data.email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: 1000,
            product_data: {
              name: "SentiNext Steam Insights PDF",
              description: `One-off PDF report for Steam app ${parsed.data.appId}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/success`,
      cancel_url: `${appUrl}/cancel`,
      metadata: {
        app_id: parsed.data.appId,
        email: parsed.data.email,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = (err as { message?: string })?.message || "Stripe checkout failed";
    return NextResponse.json({ error: message || "Stripe checkout failed" }, { status: 400 });
  }
}
