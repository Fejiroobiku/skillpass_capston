module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'node_modules', 'backend/uploads'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
  overrides: [
    {
      // The API, its scripts and tests, and the build/test configs run in Node.js, not the browser.
      files: ['backend/**/*.js', 'src/test/globalSetup.ts', 'vite.config.ts', 'vitest.config.ts'],
      env: { node: true, browser: false, es2022: true },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: {
        // `.catch(() => {})` deliberately ignores a failure that does not matter (for example a rollback after an error).
        '@typescript-eslint/no-empty-function': 'off',
      },
    },
  ],
}
