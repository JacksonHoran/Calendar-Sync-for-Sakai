import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  {
    // Extension code: runs in the service worker and popup.
    files: ["src/**/*.js", "popup/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker, chrome: "readonly" },
    },
  },
  {
    files: ["test/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node, chrome: "writable" },
    },
  },
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
];
