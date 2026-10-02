/* Clean-architecture dependency rule (§4.3):
   domain -> nothing; application -> domain; infrastructure/http -> application + domain. */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'boundaries'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules', 'apps/web/src/**', 'apps/web/e2e/**', '*.cjs', '*.config.ts'],
  settings: {
    'boundaries/elements': [
      { type: 'domain', pattern: 'packages/shared/src/domain', mode: 'folder' },
      { type: 'application', pattern: 'apps/server/src/modules/*/application', mode: 'folder' },
      { type: 'application', pattern: 'apps/server/src/shared', mode: 'folder' },
      { type: 'infrastructure', pattern: 'apps/server/src/modules/*/infrastructure', mode: 'folder' },
      { type: 'infrastructure', pattern: 'apps/server/src/infrastructure', mode: 'folder' },
      { type: 'http', pattern: 'apps/server/src/modules/*/http', mode: 'folder' },
      { type: 'http', pattern: 'apps/server/src/http', mode: 'folder' },
    ],
    'boundaries/root-path': __dirname,
    'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js'] } },
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'allow',
        rules: [
          { from: 'domain', disallow: ['application', 'infrastructure', 'http'] },
          // application may reference infrastructure *types* (ports are satisfied by DI in container.ts), never values
          { from: 'application', disallow: ['infrastructure'], importKind: 'value' },
          { from: 'application', disallow: ['http'] },
          { from: 'infrastructure', disallow: ['http'] },
        ],
      },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
