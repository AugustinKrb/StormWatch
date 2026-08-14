import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['js/regions.js', 'js/logos.js', 'js/tools.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['js/settings.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        REGIONS: 'readonly',
        DEFAULT_TOOLS: 'readonly',
        STORM_LOGOS: 'readonly',
        STORM_LOGO_IDS: 'readonly',
        applyLogo: 'readonly',
      },
    },
  },
  {
    files: ['js/*.js'],
    ignores: ['js/regions.js', 'js/logos.js', 'js/tools.js', 'js/settings.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        L: 'readonly',
      },
    },
  },
];
