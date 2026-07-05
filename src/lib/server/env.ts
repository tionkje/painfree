import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_PATH: z.string().default('./data/painfree.db'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast on startup with a readable message — never boot with bad config.
  console.error('Invalid environment variables:', z.flattenError(parsed.error).fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
