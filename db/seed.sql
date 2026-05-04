-- TDME Expense Tracker — Seed
--
-- Bootstrap admin and sample accounts.
-- IMPORTANT: change every password after first login.
--
-- All seeded passwords below are: ChangeMe123!
-- Hash: bcryptjs cost-12 hash of 'ChangeMe123!'
--   $2a$12$Lx7eVBz31U1d8z.cm0jEL.fBC3KvXYlWh6qT.RaZ8vK5Wc02pHy3a

-- Heal databases that were seeded with the earlier typo'd domain
-- (`trashdaymadeasy.com`) so that running this seed against them updates the
-- existing rows in place instead of creating a second copy alongside the
-- corrected addresses. The guard avoids clobbering a row if the corrected
-- address already exists.
UPDATE users SET email = 'admin@trashdaymadeeasy.com'
 WHERE email = 'admin@trashdaymadeasy.com'
   AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@trashdaymadeeasy.com');
UPDATE users SET email = 'manager@trashdaymadeeasy.com'
 WHERE email = 'manager@trashdaymadeasy.com'
   AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'manager@trashdaymadeeasy.com');
UPDATE users SET email = 'employee@trashdaymadeeasy.com'
 WHERE email = 'employee@trashdaymadeasy.com'
   AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'employee@trashdaymadeeasy.com');

INSERT INTO users (email, password_hash, full_name, role, is_active)
VALUES
  ('admin@trashdaymadeeasy.com',
   '$2a$12$Lx7eVBz31U1d8z.cm0jEL.fBC3KvXYlWh6qT.RaZ8vK5Wc02pHy3a',
   'TDME Admin', 'admin', TRUE),
  ('manager@trashdaymadeeasy.com',
   '$2a$12$Lx7eVBz31U1d8z.cm0jEL.fBC3KvXYlWh6qT.RaZ8vK5Wc02pHy3a',
   'Sample Manager', 'manager', TRUE),
  ('employee@trashdaymadeeasy.com',
   '$2a$12$Lx7eVBz31U1d8z.cm0jEL.fBC3KvXYlWh6qT.RaZ8vK5Wc02pHy3a',
   'Sample Employee', 'employee', TRUE)
ON CONFLICT (email) DO NOTHING;
