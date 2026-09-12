import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // La simulation reste libre de toute entrée-sortie, de rendu et de réseau.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@ninjarena/*'], message: 'core must not depend on other packages' },
            {
              group: ['../../../*', '../../../../*'],
              message: 'core must not reach outside packages/core/src',
            },
          ],
        },
      ],
    },
  },
  {
    // Les handlers d'effets vivent trois niveaux sous src: leur remontée s'arrête aussi à packages/core/src.
    files: ['packages/core/src/*/*/*/*.ts', 'packages/core/src/*/*/*/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@ninjarena/*'], message: 'core must not depend on other packages' },
            {
              group: ['../../../../*'],
              message: 'core must not reach outside packages/core/src',
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettier,
);
