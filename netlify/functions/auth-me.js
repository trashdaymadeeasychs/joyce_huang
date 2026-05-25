'use strict';

const { sql } = require('./_shared/db');
const { getSessionFromEvent } = require('./_shared/auth');
const { ok, unauthorized, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  const session = await getSessionFromEvent(event);
  if (!session) return unauthorized('Not authenticated');

  try {
    const rows = await sql()`
      SELECT id, email, full_name, role, is_active
        FROM users
       WHERE id = ${parseInt(session.sub, 10)}
       LIMIT 1
    `;
    const user = rows[0];
    if (!user || !user.is_active) return unauthorized('Account inactive');

    return ok({
      user: { id: user.id, sub: String(user.id), email: user.email, name: user.full_name, role: user.role },
    });
  } catch (err) {
    return serverError(err);
  }
};
