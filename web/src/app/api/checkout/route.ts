import { NextResponse } from "next/server";
import { z } from "zod";

import { getEnv } from "@/lib/env";
import { stripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

const bodySchema = z.object({
  appId: z.string().regex(/^\d+$/),
  email: z.string().email(),
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

  const env = getEnv();
  const stripe = stripeClient();

  const appUrl = env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

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
}

