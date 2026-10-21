import js from "@eslint/js";
import globals from "globals";

const eslintConfig = [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "off",
      "no-undef": "off", // Disable for service workers and Next.js internals
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/sw.js",
      "postcss.config.js",
    ],
  },
];

export default eslintConfig;
