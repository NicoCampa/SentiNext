import Stripe from "stripe";
import { getCheckoutEnv } from "./env";

export function stripeClient() {
  const env = getCheckoutEnv();
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
  });
}
