import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test('development uses pino-pretty transport', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.resetModules();
  const { logger } = await import('./logger');
  expect(logger.level).toBe('info');
});

test('production has no transport', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('LOG_LEVEL', 'warn');
  vi.resetModules();
  const { logger } = await import('./logger');
  expect(logger.level).toBe('warn');
});
