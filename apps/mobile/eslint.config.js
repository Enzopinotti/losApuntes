import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config([
  {
    ignores: [".expo/**", "dist/**", "android/**", "ios/**"]
  },
  {
    files: ["src/**/*.{ts,tsx}", "app.config.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"]
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.es2022,
        ...globals.browser
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
]);
