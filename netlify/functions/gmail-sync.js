'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, methodNotAllowed, serverError } = require('./_shared/response');

function guessCategory(vendor) {
  const v = (vendor || '').toLowerCase();
  if (/perplexity|anthropic|openai|claude|canva|adobe|figma|notion|slack|zoom|microsoft|google|netlify|railway|github|dealify|blink|saas|software/.test(v)) return 'Software & Technology';
  if (/restaurant|cafe|doordash|grubhub|ubereats|starbucks|mcdonalds|bar|sushi|pizza|grill|diner|coffee|chipotle|panera/.test(v)) return 'Meals & Entertainment';
  if (/fuel|gas|shell|exxon|chevron|bp|texaco|speedway|loves/.test(v)) return 'Fuel';
  if (/autozone|oreilly|napa|jiffy|midas|pep boys|vehicle|tire|mechanic/.test(v)) return 'Vehicle Maintenance';
  if (/amazon|walmart|home depot|lowes|staples|office depot|costco|supply|equipment/.test(v)) return 'Supplies & Equipment';
  if (/facebook|instagram|twitter|linkedin|google ads|mailchimp|marketing|advertising/.test(v)) return 'Marketing & Advertising';
  if (/uniform|workwear|cintas|aramark/.test(v)) return 'Uniforms';
  if (/office|fedex|ups|usps|postage|stamp/.test(v)) return 'Office Expenses';
  return 'Other';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = requireAuth(event, ['manager', 'admin']);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);

  try {
    const railwayUrl = process.env.RAILWAY_API_URL;
    const password   = process.env.RAILWAY_APP_PASSWORD;

    const res = await fetch(`${railwayUrl}/receipts`, {
      headers: { 'Authorization': `Bearer ${password}` },
    });
    if (!res.ok) throw new Error(`Railway responded ${res.status}`);
    const { receipts } = await res.json();

    if (!receipts || !receipts.length) {
      return ok({ created: 0, skipped: 0, message: 'No Gmail receipts found.' });
    }

    const existingRows = await sql()`SELECT gmail_message_id FROM expenses WHERE gmail_message_id IS NOT NULL`;
    const existing = new Set(existingRows.map(r => r.gmail_message_id));

    let created = 0;
    let skipped = 0;

    for (const r of receipts) {
      if (existing.has(r.messageId)) { skipped++; continue; }

      const vendor   = r.sender ? r.sender.replace(/<.*>/, '').trim() : 'Unknown Vendor';
      const amount   = r.amountGuess ? Math.abs(parseFloat(r.amountGuess)) : 0.01;
      const date     = r.date ? new Date(parseInt(r.date, 10)).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const category = guessCategory(vendor);
      const desc     = vendor + (r.subject ? ` — ${r.subject}` : '');

      await sql()`
        INSERT INTO expenses (expense_date, category, amount, description, status, gmail_message_id)
        VALUES (${date}, ${category}, ${amount}, ${desc.slice(0, 500)}, 'pending', ${r.messageId})
      `;
      existing.add(r.messageId);
      created++;
    }

    return ok({ created, skipped, message: `Synced ${created} new expense(s), skipped ${skipped} duplicate(s).` });
  } catch (err) {
    return serverError(err);
  }
};
