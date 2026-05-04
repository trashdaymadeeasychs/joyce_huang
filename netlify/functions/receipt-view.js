'use strict';

const { getStore } = require('@netlify/blobs');
const { requireAuth } = require('./_shared/auth');
const { json, badRequest, notFound, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed();

  const auth = requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);

  const key = (event.queryStringParameters || {}).key;
  if (!key) return badRequest('key is required');

  try {
    const store = getStore({ name: 'receipts', consistency: 'strong' });
    const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return notFound('Receipt not found');

    const contentType = (result.metadata && result.metadata.contentType) || 'application/octet-stream';
    const buf = Buffer.from(result.data);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return serverError(err);
  }
};
