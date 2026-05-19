/* API client — wraps all Netlify Function calls */
'use strict';

const BASE = '/.netlify/functions';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  let json;
  try { json = await res.json(); } catch { json = {}; }

  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const API = {
  login(email, password)    { return request('/auth-login',  { method: 'POST', body: JSON.stringify({ email, password }) }); },
  logout()                  { return request('/auth-logout', { method: 'POST' }); },
  me()                      { return request('/auth-me'); },
  getExpenses(params = {})  { return request('/expenses-list?' + new URLSearchParams(params)); },
  createExpense(data)       { return request('/expenses-create', { method: 'POST', body: JSON.stringify(data) }); },
  updateExpenseStatus(data) { return request('/expenses-update-status', { method: 'POST', body: JSON.stringify(data) }); },
  getUsers()                { return request('/users-list'); },
  createUser(data)          { return request('/users-create', { method: 'POST', body: JSON.stringify(data) }); },
  updateUser(data)          { return request('/users-update', { method: 'POST', body: JSON.stringify(data) }); },
  getDashboard(year)        { return request('/dashboard-summary' + (year ? `?year=${year}` : '')); },
  getGmailReceipt(messageId) { return request('/receipt-gmail?message_id=' + encodeURIComponent(messageId)); },
  searchGmailReceipts()      { return request('/receipts-search'); },
  uploadReceipt(file, expenseId) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        try {
          const result = await request('/upload-receipt', {
            method: 'POST',
            body: JSON.stringify({ filename: file.name, content_type: file.type, data_base64: base64, expense_id: expenseId }),
          });
          resolve(result);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};

window.API = API;