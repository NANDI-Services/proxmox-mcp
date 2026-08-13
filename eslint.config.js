import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: globalThis.process.cwd()
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { "checksVoidReturn": false }],
      // `const { a: _a, ...rest }` is the idiomatic way to omit a key.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        fetch: "readonly",
        process: "readonly",
        console: "readonly"
      }
    }
  },
  {
    // Emulator sources are plain Node ESM, not part of the published package.
    files: ["emulator/**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly"
      }
    },
    rules: {
      // `const { a: _a, ...rest }` is the idiomatic way to omit keys.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  }
);
