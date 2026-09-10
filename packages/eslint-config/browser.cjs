'use strict';

const base = require('./base.cjs');
const globals = require('globals');

module.exports = {
  ...base,
  languageOptions: {
    ...(base.languageOptions || {}),
    globals: {
      ...globals.browser,
      ...globals.es2022,
    },
  },
};