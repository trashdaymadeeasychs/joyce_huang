'use strict';

const bcrypt = require('bcryptjs');
const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, notFound, methodNotAllowed, serverError } = require('./_shared/response');

const VALID_ROLES = new Set(['employee', 'manager', 'admin']);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = requireAuth(event, ['admin']);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const userId = parseInt(body.user_id, 10);
  if (!userId) return badRequest('user_id is required');

  const updates = [];
  const db = sql();

  try {
    if (typeof body.full_name === 'string' && body.full_name.trim()) {
      const v = body.full_name.trim();
      await db`UPDATE users SET full_name = ${v} WHERE id = ${userId}`;
      updates.push('full_name');
    }

    if (typeof body.role === 'string') {
      if (!VALID_ROLES.has(body.role)) return badRequest('Invalid role');
      // Prevent admins from demoting themselves
      if (String(userId) === String(session.sub) && body.role !== 'admin') {
        return badRequest('You cannot change your own role');
      }
      await db`UPDATE users SET role = ${body.role} WHERE id = ${userId}`;
      updates.push('role');
    }

    if (typeof body.is_active === 'boolean') {
      // Prevent admins from deactivating themselves
      if (String(userId) === String(session.sub) && !body.is_active) {
        return badRequest('You cannot deactivate your own account');
      }
      await db`UPDATE users SET is_active = ${body.is_active} WHERE id = ${userId}`;
      updates.push('is_active');
    }

    if (typeof body.password === 'string' && body.password) {
      if (body.password.length < 8) return badRequest('Password must be at least 8 characters');
      const hash = await bcrypt.hash(body.password, 12);
      await db`UPDATE users SET password_hash = ${hash} WHERE id = ${userId}`;
      updates.push('password');
    }

    if (!updates.length) return badRequest('No fields to update');

    const rows = await db`
      SELECT id, email, full_name, role, is_active, created_at, last_login_at
        FROM users WHERE id = ${userId} LIMIT 1
    `;
    if (!rows.length) return notFound('User not found');
    return ok({ user: rows[0], updated: updates });
  } catch (err) {
    return serverError(err);
  }
};
