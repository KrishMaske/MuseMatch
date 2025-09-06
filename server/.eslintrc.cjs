module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, es2022: true },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        // Allows the idiomatic `const { omitted: _omitted, ...rest } = value`.
        ignoreRestSiblings: true,
      },
    ],
    'no-console': 'warn',
  },
  overrides: [
    {
      // The evaluation harness exists to print a report for a person to read;
      // its stdout is the deliverable, not a stray debug statement.
      files: ['src/scripts/evaluateRecommendations.ts', 'prisma/seed.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
  ignorePatterns: ['dist', 'node_modules'],
};
