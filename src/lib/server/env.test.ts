import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

test('parses valid env (defaults applied)', async () => {
  vi.resetModules();
  const { env } = await import('./env');
  expect(env.LOG_LEVEL).toBe('info');
  expect(env.DATABASE_PATH).toBe('./data/painfree.db');
});

test('throws on invalid env', async () => {
  vi.stubEnv('LOG_LEVEL', 'banana');
  vi.resetModules();
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(import('./env')).rejects.toThrow('Invalid environment variables');
  expect(err).toHaveBeenCalled();
});
