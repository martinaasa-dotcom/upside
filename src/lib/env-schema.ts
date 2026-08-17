import { z } from "zod";

/**
 * Shape of the env this app actually reads. Missing optional keys are fine
 * (demo mode, no notes, one LLM provider). A value that is present but
 * malformed is not: a typo'd Supabase URL used to fail at first query
 * with a cryptic fetch error.
 */

const httpsOrigin = z
  .string()
  .trim()
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && Boolean(u.hostname);
    } catch {
      return false;
    }
  }, "must be an https URL");

const hostnameOrUrl = z
  .string()
  .trim()
  .min(1)
  .refine((v) => {
    const host = v.replace(/^https?:\/\//i, "").replace(/\/+$/, "").split("/")[0];
    return /^[a-z0-9.-]+$/i.test(host) && host.includes(".");
  }, "must be a hostname or https URL");

export const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpsOrigin.optional(),
  SUPABASE_URL: httpsOrigin.optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(20).optional(),
  SUPABASE_ANON_KEY: z.string().trim().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(20).optional(),
  DATABASE_URL: z.string().trim().min(10).optional(),
  DATABASE_POOLER_URL: z.string().trim().min(10).optional(),
  UPSIDE_CANONICAL_HOST: hostnameOrUrl.optional(),
  NEXT_PUBLIC_SITE_URL: hostnameOrUrl.optional(),
  CRON_SECRET: z.string().trim().min(16).optional(),
  RESEND_API_KEY: z.string().trim().min(8).optional(),
  RESEND_FROM: z.string().trim().min(3).optional(),
  OPENROUTER_API_KEY: z.string().trim().min(8).optional(),
  OPENROUTER_HTTP_REFERER: httpsOrigin.optional(),
  SUPABASE_ACCESS_TOKEN: z.string().trim().min(20).optional(),
  SUPABASE_PROJECT_REF: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{8,}$/i, "must be a Supabase project ref")
    .optional(),
  SNAPSHOT_ENCRYPTION_KEY: z.string().trim().min(32).optional(),
  DR_S3_ENDPOINT: httpsOrigin.optional(),
  DR_S3_BUCKET: z.string().trim().min(3).optional(),
  DR_S3_ACCESS_KEY_ID: z.string().trim().min(8).optional(),
  DR_S3_SECRET_ACCESS_KEY: z.string().trim().min(8).optional(),
  DR_S3_REGION: z.string().trim().min(2).optional(),
  DR_S3_PREFIX: z.string().trim().min(1).optional(),
});

export type ServerEnvIssue = { key: string; message: string };

/** Validate only keys that are actually set. Empty string is treated as unset. */
export function validateServerEnv(
  env: Record<string, string | undefined> = process.env
): ServerEnvIssue[] {
  const issues: ServerEnvIssue[] = [];
  const shape = serverEnvSchema.shape;
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const raw = env[key]?.trim();
    if (!raw) continue;
    const parsed = shape[key].safeParse(raw);
    if (!parsed.success) {
      issues.push({
        key,
        message: parsed.error.issues[0]?.message ?? "invalid",
      });
    }
  }
  return issues;
}
