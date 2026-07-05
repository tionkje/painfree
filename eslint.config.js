import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      // This app has no base path (home lab), so plain internal hrefs are fine.
      'svelte/no-navigation-without-resolve': 'off'
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig: (await import('./svelte.config.js')).default
      }
    }
  },
  {
    // Test files reach into framework internals with loose types; keep the
    // recommended rules strict for app code but relax the noisiest ones here.
    files: ['**/*.test.ts', '**/*.svelte.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    ignores: ['.svelte-kit/', 'build/', 'drizzle/', 'coverage/', 'node_modules/', '.claude/']
  }
);
