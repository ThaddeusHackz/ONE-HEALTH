import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const ignores = [
  // Build output (including the agent self-test's compiled tree) and
  // tool-generated files are not source - linting them only produces
  // noise like "no-require-imports" in perfectly valid CommonJS scripts.
  ".next/**",
  "node_modules/**",
  "scripts/*.cjs",
  "next-env.d.ts",
];

export default [{ ignores }, ...compat.extends("next/core-web-vitals", "next/typescript")];
