/* Lint configuration for the Explorer.
   The application is plain ES5 loaded as four ordered <script> tags — no module
   system and no bundler, because it has to run from file://. The files share
   one global scope on purpose. lint.mjs concatenates them in load order into a
   single program so the linter sees exactly the scope the browser builds, which
   is what makes no-undef meaningful here. */
const globals = { window: 'readonly', document: 'readonly', localStorage: 'readonly',
  sessionStorage: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', console: 'readonly',
  location: 'readonly', history: 'readonly', navigator: 'readonly', Blob: 'readonly',
  URL: 'readonly', Event: 'readonly', CustomEvent: 'readonly', MutationObserver: 'readonly',
  requestAnimationFrame: 'readonly', getComputedStyle: 'readonly' };

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-func-assign': 'error',
      'no-unreachable': 'error',
      'no-redeclare': 'error',
      'no-cond-assign': 'error',
      'no-constant-condition': 'error',
      'no-self-assign': 'error',
      'no-sparse-arrays': 'error',
      'valid-typeof': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
    }
  }
];
