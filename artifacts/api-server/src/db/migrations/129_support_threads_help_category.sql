-- Partner-Support: Kategorie „help“ (UI nutzt sie bereits)
ALTER TABLE support_threads DROP CONSTRAINT IF EXISTS support_threads_category_chk;
ALTER TABLE support_threads ADD CONSTRAINT support_threads_category_chk
  CHECK (category IN ('stammdaten', 'documents', 'billing', 'technical', 'help', 'other'));
