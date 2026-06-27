-- Document Studio (2026-06-27): enums for the unified document instance lifecycle.
-- Additive only. See docs/superpowers/specs/2026-06-27-document-studio-design.md

CREATE TYPE document_instance_type AS ENUM (
  'office_receipt','customer_copy','checkout_form','case_label','stock_label',
  'quote','invoice','payment_receipt','payslip','chain_of_custody',
  'report','certificate_of_destruction'
);

CREATE TYPE document_instance_status AS ENUM (
  'draft','in_review','approved','rejected','issued','delivered','signed_off','superseded','void'
);

CREATE TYPE signature_method AS ENUM ('typed','drawn','uploaded_image','click_to_accept');

CREATE TYPE signature_slot AS ENUM ('engineer','qa_reviewer','approver','lab_manager','customer','witness');
