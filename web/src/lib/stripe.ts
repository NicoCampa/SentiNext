import Stripe from "stripe";
import { getCheckoutEnv } from "./env";

export function stripeClient(secretKey?: string) {
  const key = secretKey || getCheckoutEnv().STRIPE_SECRET_KEY;
  return new Stripe(key, {
    apiVersion: "2024-06-20",
  });
}
