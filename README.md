# TDME Expense Tracker

Internal expense tracking system for Trash Day Made Easy.

**Live URL:** https://expenses.trashdaymadeeasymanagement.com  
**Stack:** Netlify Functions · Neon Postgres · Vanilla JS

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in your values
cp .env.example .env

# 3. Run locally with Netlify Dev
npm run dev
# → http://localhost:8888
```

See [docs/setup.md](docs/setup.md) for full setup instructions.

---

## Project Structure

```
tdme-expenses/
├── netlify.toml              # Netlify build + redirect config
├── package.json
├── src/                      # Frontend (static, served as publish dir)
│   ├── index.html
│   ├── styles/main.css
│   └── js/
│       ├── api.js            # API client
│       ├── auth.js           # Login/session
│       ├── app.js            # Router + shared utilities
│       ├── expenses.js       # Employee dashboard + submission
│       ├── manager.js        # Manager queue + charts
│       └── admin.js          # Admin user management
├── netlify/
│   └── functions/
│       ├── _shared/          # Shared DB + auth helpers
│       ├── auth-login.js
│       ├── auth-logout.js
│       ├── auth-me.js
│       ├── expenses-list.js
│       ├── expenses-create.js
│       ├── expenses-update-status.js
│       ├── upload-receipt.js
│       ├── users-list.js
│       ├── users-create.js
│       ├── users-update.js
│       └── dashboard-summary.js
├── db/
│   ├── schema.sql            # Full schema + triggers
│   └── seed.sql              # Bootstrap admin + sample accounts
└── docs/
    ├── setup.md              # Step-by-step deployment guide
    └── gmail-phase-2.md      # Phase 2: Gmail receipt ingestion spec
```

---

## Roles & Permissions

| Feature | Employee | Manager | Admin |
|---------|----------|---------|-------|
| Submit expenses | ✅ | ✅ | ✅ |
| View own expenses | ✅ | ✅ | ✅ |
| View all expenses | — | ✅ | ✅ |
| Approve/reject | — | ✅ | ✅ |
| View dashboard charts | ✅ (own) | ✅ (all) | ✅ (all) |
| Manage users | — | — | ✅ |

---

## Deployment Checklist

- [ ] Schema run against Neon (`db/schema.sql`)
- [ ] Seed run (`db/seed.sql`)
- [ ] `DATABASE_URL` set in Netlify env vars
- [ ] `JWT_SECRET` set (64+ random chars)
- [ ] `NODE_ENV=production` set
- [ ] `UPLOAD_STORAGE_MODE=blob` set
- [ ] Site deployed and accessible at custom domain
- [ ] Default seed passwords changed

---

## Phase 2

Gmail receipt ingestion — see [docs/gmail-phase-2.md](docs/gmail-phase-2.md).
