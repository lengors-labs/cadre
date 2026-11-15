import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const unusedOptions = {
  argsIgnorePattern: "^_",
  varsIgnorePattern: "^_",
  caughtErrorsIgnorePattern: "^_",
};

export default defineConfig([
  globalIgnores(["dist/", "coverage/"]),
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.nodeBuiltin },
    rules: { "no-unused-vars": ["error", unusedOptions] },
  },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.nodeBuiltin },
    rules: { "@typescript-eslint/no-unused-vars": ["error", unusedOptions] },
  },
]);
