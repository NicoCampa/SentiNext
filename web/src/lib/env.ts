import { z } from "zod";

const schema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  APP_URL: z.string().url().optional(),
  SENTINEXT_API_BASE_URL: z.string().url(),
  SENTINEXT_SERVICE_TOKEN: z.string().min(1).optional(),
});

export function getEnv() {
  const raw = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    APP_URL: process.env.APP_URL,
    SENTINEXT_API_BASE_URL: process.env.SENTINEXT_API_BASE_URL,
    SENTINEXT_SERVICE_TOKEN: process.env.SENTINEXT_SERVICE_TOKEN,
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}

