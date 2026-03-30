module.exports = {
  root: true,
  env: { browser: false, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: [],
  rules: {
    "@typescript-eslint/ban-ts-ignore": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        "args": "all",
        "argsIgnorePattern": "^_",
        "caughtErrors": "all",
        "caughtErrorsIgnorePattern": "^_",
        "destructuredArrayIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "ignoreRestSiblings": true
      }
    ],
    "@typescript-eslint/no-restricted-imports": [
      "error",
      {
        "patterns": [{
          "group": ["@delivery-express/*"],
          "message": "Import service not allowed.",
        }],
        "paths": [{
          "name": "@delivery-express/api",
          "message": "Import API only allowed types",
          "allowTypeImports": true,
        }],
      },
    ],
  },
}
