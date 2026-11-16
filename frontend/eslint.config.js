import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/typescript';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ...solid,
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'solid/reactivity': 'error',
      'solid/no-destructure': 'error',
      'solid/prefer-for': 'error',
      'solid/prefer-show': 'warn',
      'solid/no-react-specific-props': 'error',
      'solid/no-innerhtml': 'error',
      'solid/jsx-no-duplicate-props': 'error',
      'solid/self-closing-comp': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier
);
