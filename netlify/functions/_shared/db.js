'use strict';

const { neon } = require('@neondatabase/serverless');

let _sql;

function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

module.exports = { sql };
