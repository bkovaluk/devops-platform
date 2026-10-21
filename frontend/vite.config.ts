import path from 'node:path'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

const API = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [
    react(),
    // plugin-react runs no Babel, and React Compiler is a Babel plugin, so it
    // gets a pass of its own.
    babel({
      include: /\.[jt]sx?$/,
      plugins: ['babel-plugin-react-compiler'],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: { '/api': API, '/auth': API, '/config': API, '/health': API },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-base-ui', test: /node_modules[\\/](@base-ui|@floating-ui)[\\/]/ },
            { name: 'vendor-tanstack', test: /node_modules[\\/]@tanstack/ },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.stories.tsx', 'src/types/**', 'src/test/**'],
    },
  },
  lint: {
    ignorePatterns: [
      'dist/**',
      'coverage/**',
      'storybook-static/**',
      'public/mockServiceWorker.js',
      'src/types/api-generated.ts',
    ],
    plugins: ['typescript', 'react', 'jsx-a11y', 'import', 'unicorn'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      // A span with role="img" or role="status" is the right element here:
      // these marks carry no image source and announce politely, not as forms.
      'jsx-a11y/prefer-tag-over-role': 'off',
      'react/rules-of-hooks': 'error',
      'react/exhaustive-deps': 'error',
      'react/only-export-components': ['error', { allowConstantExport: true }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tanstack/react-query',
              importNames: ['useMutation'],
              message: 'Mutations go through useIdentityBoundMutation from @/features/auth.',
            },
          ],
        },
      ],
    },
    overrides: [
      {
        files: ['src/features/auth/use-identity-bound-mutation.ts'],
        rules: { 'no-restricted-imports': 'off' },
      },
    ],
  },
  fmt: {
    semi: false,
    singleQuote: true,
    printWidth: 100,
    trailingComma: 'all',
    ignorePatterns: [
      'public/mockServiceWorker.js',
      'src/types/api-generated.ts',
      'src/features/auth/scope-contract.json',
    ],
  },
})
