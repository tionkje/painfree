import { expect, test } from 'vitest';
import { ssr, prerender } from './+layout';

test('SSR and prerender are disabled — client is the source of truth', () => {
  expect(ssr).toBe(false);
  expect(prerender).toBe(false);
});
