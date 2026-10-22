import { z } from "zod";

/** Server-side configuration, validated once. Secrets never leave the server. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DISPLAY_TIMEZONE: z.string().default("Asia/Kolkata"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  SESSION_EXPIRES_IN: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  SESSION_UPDATE_AGE: z.coerce.number().int().positive().default(60 * 60 * 24),

  JUDGE0_URL: z.string().optional().default(""),
  JUDGE0_RAPIDAPI_KEY: z.string().optional().default(""),
  JUDGE0_RAPIDAPI_HOST: z.string().optional().default(""),
  JUDGE0_AUTH_TOKEN: z.string().optional().default(""),
  JUDGE0_LANGUAGE_IDS: z.string().optional().default(""),
  RUN_CPU_TIME_LIMIT_S: z.coerce.number().positive().default(5),
  RUN_WALL_TIME_LIMIT_S: z.coerce.number().positive().default(10),
  RUN_MEMORY_LIMIT_KB: z.coerce.number().int().positive().default(256000),
  RUN_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(65536),
  RUN_MAX_PER_MINUTE: z.coerce.number().int().positive().default(10),
  RUN_MAX_PER_DAY: z.coerce.number().int().positive().default(300),
  RUN_MAX_CONCURRENT: z.coerce.number().int().positive().default(2),
  RUN_HISTORY_KEEP: z.coerce.number().int().positive().default(50),
  RUN_HISTORY_DAYS: z.coerce.number().int().positive().default(30),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("storage"),
  S3_BUCKET: z.string().optional().default(""),
  S3_REGION: z.string().optional().default(""),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),

  SMTP_URL: z.string().optional().default(""),
  EMAIL_FROM: z.string().optional().default("Grad2Tech <no-reply@example.com>"),

  WEBCONTAINER_CLIENT_ID: z.string().optional().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
