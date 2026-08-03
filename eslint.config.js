// ESLint flat config (Phase 4.2). Dev-only — does not affect the static site.
// app.js is browser-global vanilla JS; lib/ + tests/ are ESM.
import globals from 'globals';

export default [
    {
        ignores: ['vendor/**', 'node_modules/**', 'sample-exports/**']
    },
    // app.js: browser globals, no modules
    {
        files: ['app.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                Chart: 'readonly'
            }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none' }]
        }
    },
    // lib/ + tests/: ESM node context
    {
        files: ['lib/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node
            }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none' }]
        }
    },
    // scripts/: ESM node context (dev-only sync tooling, Node >= 18)
    {
        files: ['scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                fetch: 'readonly',
                AbortSignal: 'readonly'
            }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none' }]
        }
    }
];
