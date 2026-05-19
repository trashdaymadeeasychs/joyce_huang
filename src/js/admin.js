/* Admin panel: user management */
'use strict';

/* ════════════════════════════════════════
   USER LIST
════════════════════════════════════════ */
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr class="spinner-row"><td colspan="6">Loading…</td></tr>';

  try {
    const { users } = await API.getUsers();
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><p>No users found.</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${App.escHtml(u.full_name)}</strong></td>
        <td>${App.escHtml(u.email)}</td>
        <td>${App.roleBadge(u.role)}</td>
        <td>
          <span class="badge ${u.is_active ? 'badge-active' : 'badge-inactive'}">
            ${u.is_active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td style="font-size:12px;color:var(--text-muted)">${App.fmtDate(u.created_at)}</td>
        <td>
          <button class="btn btn-sm" onclick="openEditUser(${JSON.stringify(u).replace(/"/g, '&quot;')})">
            Edit
          </button>
          <button class="btn btn-sm btn-reject"
                  onclick="deleteUser(${u.id}, '${App.escHtml(u.full_name)}')"
                  style="margin-left:4px">
            Delete
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="alert alert-error">Failed to load users: ${App.escHtml(err.message)}</div></td></tr>`;
  }
}

/* ════════════════════════════════════════
   USER MODAL
════════════════════════════════════════ */
function openAddUser() {
  document.getElementById('user-modal-title').textContent  = 'Add User';
  document.getElementById('user-id').value                 = '';
  document.getElementById('user-form').reset();
  document.getElementById('user-modal-error').style.display = 'none';
  document.getElementById('user-email-group').style.display  = '';
  document.getElementById('user-email').required              = true;
  document.getElementById('user-password').required           = true;
  document.getElementById('user-password-label').textContent = 'Password *';
  document.getElementById('user-active-group').style.display = 'none';
  document.getElementById('user-modal').style.display = 'flex';
}

function openEditUser(user) {
  const u = typeof user === 'string' ? JSON.parse(user) : user;

  document.getElementById('user-modal-title').textContent   = 'Edit User';
  document.getElementById('user-id').value                  = u.id;
  document.getElementById('user-name').value                = u.full_name;
  document.getElementById('user-email').value               = u.email;
  document.getElementById('user-role').value                = u.role;
  document.getElementById('user-password').value            = '';
  document.getElementById('user-active').checked            = u.is_active;
  document.getElementById('user-modal-error').style.display = 'none';

  document.getElementById('user-email-group').style.display  = 'none';
  document.getElementById('user-email').required              = false;
  document.getElementById('user-password').required           = false;
  document.getElementById('user-password-label').textContent = 'New Password (leave blank to keep current)';
  document.getElementById('user-active-group').style.display = '';

  const currentUser = Auth.getUser();
  if (currentUser && String(u.id) === String(currentUser.sub)) {
    document.getElementById('user-active').disabled = true;
  } else {
    document.getElementById('user-active').disabled = false;
  }

  document.getElementById('user-modal').style.display = 'flex';
}

function closeUserModal() {
  document.getElementById('user-modal').style.display = 'none';
}

async function saveUser() {
  const errEl     = document.getElementById('user-modal-error');
  const saveBtn   = document.getElementById('user-save-btn');
  errEl.style.display = 'none';

  const id       = document.getElementById('user-id').value;
  const name     = document.getElementById('user-name').value.trim();
  const email    = document.getElementById('user-email').value.trim();
  const role     = document.getElementById('user-role').value;
  const password = document.getElementById('user-password').value;
  const isActive = document.getElementById('user-active').checked;

  if (!name) { errEl.textContent = 'Full name is required.'; errEl.style.display = 'block'; return; }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    if (!id) {
      if (!email) throw new Error('Email is required.');
      if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.');
      await API.createUser({ email, password, full_name: name, role });
    } else {
      const payload = { user_id: parseInt(id, 10), full_name: name, role, is_active: isActive };
      if (password) {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        payload.password = password;
      }
      await API.updateUser(payload);
    }

    closeUserModal();
    loadUsers();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to save user.';
    errEl.style.display = 'block';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

async function deleteUser(userId, userName) {
  if (!confirm(`Delete ${userName}? Their name will stay on existing expenses, but they'll be removed from all dropdowns.`)) return;
  try {
    await API.deleteUser(userId);
    loadUsers();
  } catch (err) {
    alert('Failed to delete user: ' + err.message);
  }
}

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('add-user-btn')?.addEventListener('click', openAddUser);
  document.getElementById('user-save-btn')?.addEventListener('click', saveUser);
  document.getElementById('user-cancel-btn')?.addEventListener('click', closeUserModal);
  document.getElementById('user-modal-close')?.addEventListener('click', closeUserModal);
  document.getElementById('user-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeUserModal();
  });

  document.getElementById('user-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveUser();
  });
});

window.loadUsers    = loadUsers;
window.openEditUser = openEditUser;
window.deleteUser   = deleteUser;
