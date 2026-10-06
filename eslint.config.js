const spfxProfile = require('@microsoft/eslint-config-spfx/lib/flat-profiles/react');

// Node built-ins are only allowed in tests (they read samples/*.xml from disk).
const nodeBuiltins = ['fs', 'path', 'os', 'child_process', 'crypto', 'util', 'url'];

module.exports = [
  ...spfxProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig.json'
      }
    },
    rules: {
      // Nintex semantics are defined in terms of null ("unknown control → null", `null == ""`), and the
      // parsed model must be JSON-serializable (sessionStorage cache), where undefined does not survive.
      '@rushstack/no-new-null': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error'
    }
  },
  {
    // The pure core must stay runnable in plain Node (unit tests, offline analyzer).
    files: ['src/nintex/**/*.ts'],
    ignores: ['src/nintex/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeBuiltins,
          patterns: [
            { group: ['react', 'react-dom', 'react/*'], message: 'src/nintex must not depend on React.' },
            { group: ['@microsoft/*'], message: 'src/nintex must not depend on SPFx.' },
            { group: ['@pnp/*'], message: 'src/nintex must not depend on PnPjs.' },
            { group: ['@fluentui/*'], message: 'src/nintex must not depend on Fluent UI.' },
            {
              group: ['**/services/**', '**/state/**', '**/components/**', '**/extensions/**'],
              message: 'Dependency direction is components -> state -> services -> nintex.'
            }
          ]
        }
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/nintex must not touch the browser DOM.' },
        { name: 'document', message: 'src/nintex must not touch the browser DOM.' },
        { name: 'localStorage', message: 'src/nintex must not touch browser storage.' },
        { name: 'sessionStorage', message: 'src/nintex must not touch browser storage.' }
      ]
    }
  },
  {
    files: ['src/services/**/*.ts'],
    ignores: ['src/services/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeBuiltins,
          patterns: [
            { group: ['react', 'react-dom'], message: 'Services must not depend on React.' },
            { group: ['**/state/**', '**/components/**'], message: 'Dependency direction is components -> state -> services -> nintex.' }
          ]
        }
      ]
    }
  },
  {
    files: ['src/state/**/*.ts'],
    ignores: ['src/state/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeBuiltins,
          patterns: [{ group: ['**/components/**'], message: 'Dependency direction is components -> state -> services -> nintex.' }]
        }
      ]
    }
  }
];
