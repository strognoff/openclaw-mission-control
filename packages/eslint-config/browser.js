'use strict';

const base = require('./base.js');

module.exports = {
  ...base,
  env: {
    browser: true,
    es2022: true,
  },
};