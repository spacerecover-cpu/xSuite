-- Document Studio (2026-06-27): table-driven allowed lifecycle edges
-- (global config, mirrors case_status_transitions). doc_type NULL = applies to all.

CREATE TABLE document_status_transitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type      document_instance_type,            -- NULL = all doc types
  from_status   document_instance_status NOT NULL,
  to_status     document_instance_status NOT NULL,
  allowed_roles text[] NOT NULL DEFAULT '{}',
  requires      text[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_status_transitions_lookup
  ON document_status_transitions(from_status, to_status) WHERE is_active;

ALTER TABLE document_status_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_status_transitions FORCE ROW LEVEL SECURITY;

CREATE POLICY document_status_transitions_select ON document_status_transitions
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY document_status_transitions_insert ON document_status_transitions
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY document_status_transitions_update ON document_status_transitions
  AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY document_status_transitions_delete ON document_status_transitions
  AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());

INSERT INTO document_status_transitions (doc_type, from_status, to_status, allowed_roles, requires, sort_order) VALUES
  (NULL, 'draft',     'in_review', ARRAY['technician','sales','accounts','hr','manager','admin','owner'], '{}', 10),
  (NULL, 'in_review', 'approved',  ARRAY['manager','admin','owner'], '{}', 20),
  (NULL, 'in_review', 'rejected',  ARRAY['manager','admin','owner'], '{}', 30),
  (NULL, 'in_review', 'draft',     ARRAY['manager','admin','owner'], '{}', 40),
  (NULL, 'rejected',  'draft',     ARRAY['technician','sales','accounts','hr','manager','admin','owner'], '{}', 50),
  (NULL, 'approved',  'delivered', ARRAY['sales','accounts','manager','admin','owner'], '{}', 60),
  (NULL, 'approved',  'in_review', ARRAY['manager','admin','owner'], '{}', 70),
  (NULL, 'draft',     'void',      ARRAY['admin','owner'], '{}', 80),
  (NULL, 'in_review', 'void',      ARRAY['admin','owner'], '{}', 90),
  (NULL, 'approved',  'void',      ARRAY['admin','owner'], '{}', 100);
