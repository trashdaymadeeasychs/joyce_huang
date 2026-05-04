-- TDME Expense Tracker — Seed
--
-- Bootstrap admin and sample accounts.
-- IMPORTANT: change every password after first login.
--
-- All seeded passwords below are: ChangeMe123!
-- Hash: bcryptjs cost-12 hash of 'ChangeMe123!'
--   $2a$12$Lx7eVBz31U1d8z.cm0jEL.fBC3KvXYlWh6qT.RaZ8vK5Wc02pHy3a

INSERT INTO users (email, password_hash, full_name, role, is_active)
VALUES
  ('admin@trashdaymadeasy.com',
   '$2a$12$Lx7eVBz31U1d8z.cm0jEL.fBC3KvXYlWh6qT.RaZ8vK5Wc02pHy3a',
   'TDME Admin', 'admin', TRUE),
  ('manager@trashdaymadeasy.com',
   '$2a$12$Lx7eVBz31U1d8z.cm0jEL.fBC3KvXYlWh6qT.RaZ8vK5Wc02pHy3a',
   'Sample Manager', 'manager', TRUE),
  ('employee@trashdaymadeasy.com',
   '$2a$12$Lx7eVBz31U1d8z.cm0jEL.fBC3KvXYlWh6qT.RaZ8vK5Wc02pHy3a',
   'Sample Employee', 'employee', TRUE)
ON CONFLICT (email) DO NOTHING;
