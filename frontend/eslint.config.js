import fs from 'node:fs'
import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Imports go one way: shared (components, hooks, lib, types, config, assets) -> features -> app,
// and a feature never imports another feature (CLAUDE.md, "Structure").
const features = fs.existsSync('./src/features')
  ? fs
      .readdirSync('./src/features', { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : []
const shared = ['components', 'hooks', 'lib', 'types', 'config', 'assets']

const zones = [
  ...features.map((name) => ({
    target: `./src/features/${name}`,
    from: './src/features',
    except: [`./${name}`],
    message:
      'Features must not import other features: move shared code to lib/, hooks/, components/ or types/, or compose in a route.',
  })),
  { target: './src/features', from: './src/app', message: 'Features must not import from the app layer.' },
  ...shared.map((dir) => ({
    target: `./src/${dir}`,
    from: ['./src/features', './src/app'],
    message: 'Shared code must not import from features or the app layer.',
  })),
]

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'src/app/routeTree.gen.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { import: importPlugin },
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.app.json' } },
    },
    rules: {
      'import/no-restricted-paths': ['error', { zones }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Route files export `Route`, shadcn primitives export variants, test files export helpers.
    files: ['src/app/routes/**', 'src/components/ui/**', 'src/testing/**', '**/*.test.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
])
