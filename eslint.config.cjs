const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['helix-importer-ui/**', 'tools/!(plugins)/**', '.skills/**', '**/*.min.js', '.eslintrc.js', 'eslint.config.cjs', 'plugins/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'linebreak-style': ['error', 'unix'],
      'no-param-reassign': [2, { props: false }],
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
];
