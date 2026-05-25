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
  // Auth
  login(email, password) { return request('/auth-login',  { method: 'POST', body: JSON.stringify({ email, password }) }); },
  logout()               { return request('/auth-logout', { method: 'POST' }); },
  me()                   { return request('/auth-me'); },

  // Expenses
  getExpenses(params = {})  { return request('/expenses-list?' + new URLSearchParams(params)); },
  createExpense(data)       { return request('/expenses-create',        { method: 'POST', body: JSON.stringify(data) }); },
  updateExpenseStatus(data) { return request('/expenses-update-status', { method: 'POST', body: JSON.stringify(data) }); },
  updateExpense(data)       { return request('/expense-update',         { method: 'POST', body: JSON.stringify(data) }); },
  deleteExpense(id)         { return request('/expense-delete',         { method: 'POST', body: JSON.stringify({ expense_id: id }) }); },
  importExpenses(expenses)  { return request('/expenses-import',        { method: 'POST', body: JSON.stringify({ expenses }) }); },

  // Income
  getIncome(params = {})    { return request('/income-list?' + new URLSearchParams(params)); },
  createIncome(data)        { return request('/income-create', { method: 'POST', body: JSON.stringify(data) }); },
  updateIncome(data)        { return request('/income-update', { method: 'POST', body: JSON.stringify(data) }); },
  deleteIncome(id)          { return request('/income-delete', { method: 'POST', body: JSON.stringify({ income_id: id }) }); },

  // Users
  getUsers()             { return request('/users-list'); },
  createUser(data)       { return request('/users-create', { method: 'POST', body: JSON.stringify(data) }); },
  updateUser(data)       { return request('/users-update', { method: 'POST', body: JSON.stringify(data) }); },
  deleteUser(id)         { return request('/users-delete', { method: 'POST', body: JSON.stringify({ user_id: id }) }); },

  // Dashboard
  getDashboard(year)     { return request('/dashboard-summary' + (year ? `?year=${year}` : '')); },

  // Gmail receipts
  getGmailReceipt(messageId) { return request('/receipt-gmail?message_id=' + encodeURIComponent(messageId)); },
  searchGmailReceipts()      { return request('/receipts-search'); },
  syncGmail()                { return request('/gmail-sync', { method: 'POST' }); },

  // Receipt upload
  uploadReceipt(file, expenseId) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        try {
          const result = await request('/upload-receipt', {
            method: 'POST',
            body: JSON.stringify({
              filename:     file.name,
              content_type: file.type,
              data_base64:  base64,
              expense_id:   expenseId,
            }),
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
