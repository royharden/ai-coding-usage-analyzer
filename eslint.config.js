import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'fixtures/**', '**/*.bak'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['src/core/money.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'CallExpression[callee.name="Number"]', message: 'Money must remain BigInt.' },
        { selector: 'CallExpression[callee.name="parseFloat"]', message: 'Money must remain BigInt.' },
        { selector: 'CallExpression[callee.object.name="Number"][callee.property.name="parseFloat"]', message: 'Money must remain BigInt.' },
        { selector: 'MemberExpression[object.name="Math"]', message: 'Use exact BigInt arithmetic for money.' },
      ],
    },
  },
);
