module.exports = {
  root: false,
  extends: ["@openclaw-mc/eslint-config/browser", "next/core-web-vitals"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  ignorePatterns: [".next/", "node_modules/", "out/"],
};