// eslint.config.mjs — Aturan minimal anti-drift (bukan reformat).
// Fokus: variabel tak dikenal, kode mati, duplikat. Gaya bebas.
export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // browser
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly',
        indexedDB: 'readonly', caches: 'readonly', self: 'readonly',
        fetch: 'readonly', Blob: 'readonly', URL: 'readonly',
        FileReader: 'readonly', CustomEvent: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        confirm: 'readonly', alert: 'readonly', prompt: 'readonly',
        console: 'readonly', crypto: 'readonly',
        XLSX: 'readonly', Event: 'readonly',
        // service worker
        clients: 'readonly', skipWaiting: 'off',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-cond-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'valid-typeof': 'error',
      'no-extra-boolean-cast': 'off',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly', it: 'readonly', expect: 'readonly',
        beforeEach: 'readonly', beforeAll: 'readonly', afterEach: 'readonly',
        vi: 'readonly',
      },
    },
  },
  {
    ignores: ['node_modules/', 'vendor/', 'coverage/', 'dist/', '.vercel/'],
  },
];
