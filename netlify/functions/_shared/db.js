'use strict';

const { neon } = require('@neondatabase/serverless');

let _sql;

function sql() {
  if (!_sql) {
    const url = process.env.EXPENSE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('EXPENSE_DATABASE_URL or DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

module.exports = { sql };
