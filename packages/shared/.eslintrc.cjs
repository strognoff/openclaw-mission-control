module.exports = {
  root: false,
  extends: ["@openclaw-mc/eslint-config/node"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  ignorePatterns: ["dist/", "node_modules/"],
};