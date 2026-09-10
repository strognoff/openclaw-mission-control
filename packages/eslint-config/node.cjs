'use strict';

const base = require('./base.cjs');
const globals = require('globals');

module.exports = {
  ...base,
  languageOptions: {
    ...(base.languageOptions || {}),
    globals: {
      ...globals.node,
      ...globals.es2022,
    },
  },
};