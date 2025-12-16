import Stripe from "stripe";
import { getEnv } from "./env";

export function stripeClient() {
  const env = getEnv();
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
  });
}

