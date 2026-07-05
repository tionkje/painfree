import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.svelte.test.ts']
        }
      },
      {
        extends: true,
        // Resolve the browser build of Svelte so components mount in jsdom.
        resolve: { conditions: ['browser'] },
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/**/*.svelte.test.ts'],
          setupFiles: ['./vitest-setup-client.ts']
        }
      }
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.svelte.test.ts', 'src/**/*.d.ts'],
      thresholds: {
        // All .ts (logic, server, loads/actions) is fully enforced at 100%.
        'src/**/*.ts': { statements: 100, functions: 100, lines: 100, branches: 100 },
        // Components hit 100% statements/functions/lines. Svelte 5 compiles text
        // interpolations (`🔥 {x}`) into phantom nullish-coalescing branches that
        // can never be both-covered, so no coverage tool reaches 100% branches on
        // components; branches are locked near the ceiling to catch regressions.
        'src/**/*.svelte': { statements: 100, functions: 100, lines: 100, branches: 85 }
      }
    }
  }
});
