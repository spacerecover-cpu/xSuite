-- Suppress the THREE fabricating AFTER-INSERT trigger functions during import.
-- Each prepends a one-line app.importing guard; ALL existing logic preserved
-- verbatim below the guard. app.importing is set transaction-local (SET LOCAL)
-- by data_migration_import_batch only -- never session-wide. Imports only INSERT,
-- so RETURN NEW is the correct skip value for every branch.

-- 1) case_devices AFTER INSERT -- do not fabricate intake custody events on import
CREATE OR REPLACE FUNCTION public.log_device_received_custody()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_name text;
  v_actor_role text;
BEGIN
  IF COALESCE(current_setting('app.importing', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT full_name, role INTO v_actor_name, v_actor_role
  FROM profiles WHERE id = auth.uid();

  INSERT INTO chain_of_custody
    (tenant_id, case_id, device_id, action_category, action, description,
     actor_id, actor_name, actor_role, custody_status, metadata)
  VALUES
    (NEW.tenant_id, NEW.case_id, NEW.id,
     'creation', 'DEVICE_RECEIVED',
     'Device received into lab custody at intake',
     auth.uid(), COALESCE(v_actor_name, 'System'), v_actor_role,
     'in_custody',
     jsonb_strip_nulls(jsonb_build_object(
       'serial_number', NEW.serial_number,
       'model', NEW.model,
       'device_type_id', NEW.device_type_id,
       'brand_id', NEW.brand_id,
       'is_primary', NEW.is_primary,
       'source', 'intake_trigger'
     )));
  RETURN NEW;
END;
$function$;

-- 2) invoices AFTER INSERT/UPDATE -- do not post VAT records on import.
-- Imports only INSERT, so guarding the whole body is safe (no UPDATE occurs
-- during import); the UPDATE void-reversal path runs untouched outside import.
CREATE OR REPLACE FUNCTION public.post_invoice_vat_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(current_setting('app.importing', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_type = 'tax_invoice' AND COALESCE(NEW.tax_amount, 0) <> 0
       AND COALESCE(NEW.status, '') NOT IN ('void', 'cancelled') THEN
      INSERT INTO vat_records (tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period)
      VALUES (NEW.tenant_id, 'sale', NEW.id, NEW.tax_amount, COALESCE(NEW.tax_rate, 0),
              to_char(COALESCE(NEW.invoice_date, now()), 'YYYY-MM'));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.invoice_type = 'tax_invoice' AND COALESCE(NEW.tax_amount, 0) <> 0
       AND NEW.status IN ('void', 'cancelled')
       AND COALESCE(OLD.status, '') NOT IN ('void', 'cancelled')
       AND EXISTS (SELECT 1 FROM vat_records WHERE record_id = NEW.id AND record_type = 'sale' AND deleted_at IS NULL) THEN
      INSERT INTO vat_records (tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period)
      VALUES (NEW.tenant_id, 'sale', NEW.id, -NEW.tax_amount, COALESCE(NEW.tax_rate, 0),
              to_char(now(), 'YYYY-MM'));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) customers_enhanced AFTER INSERT/UPDATE -- do not seed portal subscriptions on import
CREATE OR REPLACE FUNCTION public.seed_portal_customer_subscriptions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('app.importing', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.portal_enabled IS NOT true THEN RETURN NEW; END IF;
  IF (TG_OP = 'UPDATE' AND OLD.portal_enabled IS true) THEN RETURN NEW; END IF;

  INSERT INTO notification_subscriptions (tenant_id, customer_id, recipient_type, event_type, channel, enabled, frequency)
  VALUES
    (NEW.tenant_id, NEW.id, 'portal_customer', 'case.phase_changed.customer',  'email', true, 'immediate'),
    (NEW.tenant_id, NEW.id, 'portal_customer', 'case.phase_changed.customer',  'in_app', true, 'immediate'),
    (NEW.tenant_id, NEW.id, 'portal_customer', 'payment.received.customer',    'email', true, 'immediate'),
    (NEW.tenant_id, NEW.id, 'portal_customer', 'payment.received.customer',    'in_app', true, 'immediate')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;
