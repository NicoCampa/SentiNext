import { z } from "zod";

const checkoutSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  APP_URL: z.string().url().optional(),
});

const webhookSchema = checkoutSchema.extend({
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  SENTINEXT_API_BASE_URL: z.string().url(),
  SENTINEXT_SERVICE_TOKEN: z.string().min(1).optional(),
});

export function getCheckoutEnv() {
  const raw = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    APP_URL: process.env.APP_URL,
  };
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function getWebhookEnv() {
  const raw = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    APP_URL: process.env.APP_URL,
    SENTINEXT_API_BASE_URL: process.env.SENTINEXT_API_BASE_URL,
    SENTINEXT_SERVICE_TOKEN: process.env.SENTINEXT_SERVICE_TOKEN,
  };
  const parsed = webhookSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}
