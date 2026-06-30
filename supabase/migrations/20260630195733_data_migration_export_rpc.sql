create or replace function public.data_migration_export_page(
  p_entity_type text,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_limit int,
  p_filters jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := get_current_tenant_id();
  v_limit int := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  v_from timestamptz := nullif(p_filters->>'dateFrom','')::timestamptz;
  v_to   timestamptz := nullif(p_filters->>'dateTo','')::timestamptz;
  v_rows jsonb := '[]'::jsonb;
  v_next jsonb := 'null'::jsonb;
  v_last_created timestamptz;
  v_last_id uuid;
begin
  if v_tenant is null and not is_platform_admin() then
    raise exception 'no tenant context';
  end if;

  -- keyset predicate shared by every branch:
  --   (created_at, id) > (p_after_created_at, p_after_id)
  -- expressed as: created_at > after OR (created_at = after AND id > after_id)
  -- date-range filter on created_at; tenant isolation always applied (RLS-equivalent).

  if p_entity_type = 'companies' then
    with page as (
      select c.id, c.created_at, jsonb_build_object(
        'legacy_id', c.id,
        'company_number', c.company_number,
        'name', c.name,
        'email', c.email,
        'phone', c.phone,
        'website', c.website,
        'address', c.address,
        'tax_number', c.tax_number,
        'registration_number', c.registration_number,
        'notes', c.notes,
        'created_at', c.created_at
      ) as row
      from companies c
      where c.deleted_at is null
        and (c.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or c.created_at > p_after_created_at
             or (c.created_at = p_after_created_at and c.id > p_after_id))
        and (v_from is null or c.created_at >= v_from)
        and (v_to is null or c.created_at <= v_to)
      order by c.created_at, c.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  elsif p_entity_type = 'customers' then
    with page as (
      select c.id, c.created_at, jsonb_build_object(
        'legacy_id', c.id,
        'customer_number', c.customer_number,
        'name', c.customer_name,
        'email', c.email,
        'phone', c.phone,
        'mobile_number', c.mobile_number,
        'whatsapp_number', c.whatsapp_number,
        'address', c.address,
        'tax_number', c.tax_number,
        'id_type', c.id_type,
        'id_number', c.id_number,
        'notes', c.notes,
        'created_at', c.created_at
      ) as row
      from customers_enhanced c
      where c.deleted_at is null
        and (c.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or c.created_at > p_after_created_at
             or (c.created_at = p_after_created_at and c.id > p_after_id))
        and (v_from is null or c.created_at >= v_from)
        and (v_to is null or c.created_at <= v_to)
      order by c.created_at, c.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  elsif p_entity_type = 'relationships' then
    with page as (
      select r.id, r.created_at, jsonb_build_object(
        'legacy_id', r.id,
        'customer_legacy_id', r.customer_id,
        'company_legacy_id', r.company_id,
        'role', r.role,
        'is_primary', r.is_primary,
        'created_at', r.created_at
      ) as row
      from customer_company_relationships r
      where r.deleted_at is null
        and (r.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or r.created_at > p_after_created_at
             or (r.created_at = p_after_created_at and r.id > p_after_id))
        and (v_from is null or r.created_at >= v_from)
        and (v_to is null or r.created_at <= v_to)
      order by r.created_at, r.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  elsif p_entity_type = 'cases' then
    with page as (
      select k.id, k.created_at, jsonb_build_object(
        'legacy_id', k.id,
        'case_number', k.case_number,
        'customer_legacy_id', k.customer_id,
        'company_legacy_id', k.company_id,
        'status', k.status,
        'priority', k.priority,
        'title', k.title,
        'subject', k.subject,
        'description', k.description,
        'created_at', k.created_at
      ) as row
      from cases k
      where k.deleted_at is null
        and (k.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or k.created_at > p_after_created_at
             or (k.created_at = p_after_created_at and k.id > p_after_id))
        and (v_from is null or k.created_at >= v_from)
        and (v_to is null or k.created_at <= v_to)
      order by k.created_at, k.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  elsif p_entity_type = 'devices' then
    with page as (
      select d.id, d.created_at, jsonb_build_object(
        'legacy_id', d.id,
        'case_legacy_id', d.case_id,
        'device_type', dt.name,
        'brand', br.name,
        'model', d.model,
        'serial', d.serial_number,
        'capacity', cap.name,
        'interface', ifc.name,
        'condition', cond.name,
        'is_primary', d.is_primary,
        'created_at', d.created_at
      ) as row
      from case_devices d
      left join catalog_device_types dt on dt.id = d.device_type_id
      left join catalog_device_brands br on br.id = d.brand_id
      left join catalog_device_capacities cap on cap.id = d.capacity_id
      left join catalog_interfaces ifc on ifc.id = d.interface_id
      left join catalog_device_conditions cond on cond.id = d.condition_id
      where d.deleted_at is null
        and (d.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or d.created_at > p_after_created_at
             or (d.created_at = p_after_created_at and d.id > p_after_id))
        and (v_from is null or d.created_at >= v_from)
        and (v_to is null or d.created_at <= v_to)
      order by d.created_at, d.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  elsif p_entity_type = 'quotes' then
    with page as (
      select q.id, q.created_at, jsonb_build_object(
        'legacy_id', q.id,
        'quote_number', q.quote_number,
        'case_legacy_id', q.case_id,
        'status', q.status,
        'currency', q.currency,
        'subtotal', q.subtotal,
        'discount_amount', q.discount_amount,
        'tax_amount', q.tax_amount,
        'total_amount', q.total_amount,
        'quote_date', q.quote_date,
        'valid_until', q.valid_until,
        'created_at', q.created_at
      ) as row
      from quotes q
      where q.deleted_at is null
        and (q.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or q.created_at > p_after_created_at
             or (q.created_at = p_after_created_at and q.id > p_after_id))
        and (v_from is null or q.created_at >= v_from)
        and (v_to is null or q.created_at <= v_to)
      order by q.created_at, q.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  elsif p_entity_type = 'quoteItems' then
    with page as (
      select qi.id, qi.created_at, jsonb_build_object(
        'legacy_id', qi.id,
        'quote_legacy_id', qi.quote_id,
        'description', qi.description,
        'quantity', qi.quantity,
        'unit_price', qi.unit_price,
        'discount', qi.discount,
        'tax_rate', qi.tax_rate,
        'tax_amount', qi.tax_amount,
        'total', qi.total,
        'sort_order', qi.sort_order,
        'created_at', qi.created_at
      ) as row
      from quote_items qi
      where qi.deleted_at is null
        and (qi.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or qi.created_at > p_after_created_at
             or (qi.created_at = p_after_created_at and qi.id > p_after_id))
        and (v_from is null or qi.created_at >= v_from)
        and (v_to is null or qi.created_at <= v_to)
      order by qi.created_at, qi.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  elsif p_entity_type = 'invoices' then
    with page as (
      select i.id, i.created_at, jsonb_build_object(
        'legacy_id', i.id,
        'invoice_number', i.invoice_number,
        'case_legacy_id', i.case_id,
        'status', i.status,
        'currency', i.currency,
        'subtotal', i.subtotal,
        'discount_amount', i.discount_amount,
        'tax_amount', i.tax_amount,
        'total_amount', i.total_amount,
        'amount_paid', i.amount_paid,
        'balance_due', i.balance_due,
        'invoice_date', i.invoice_date,
        'due_date', i.due_date,
        'created_at', i.created_at
      ) as row
      from invoices i
      where i.deleted_at is null
        and (i.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or i.created_at > p_after_created_at
             or (i.created_at = p_after_created_at and i.id > p_after_id))
        and (v_from is null or i.created_at >= v_from)
        and (v_to is null or i.created_at <= v_to)
      order by i.created_at, i.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  elsif p_entity_type = 'invoiceLineItems' then
    with page as (
      select li.id, li.created_at, jsonb_build_object(
        'legacy_id', li.id,
        'invoice_legacy_id', li.invoice_id,
        'description', li.description,
        'quantity', li.quantity,
        'unit_price', li.unit_price,
        'discount', li.discount,
        'tax_rate', li.tax_rate,
        'tax_amount', li.tax_amount,
        'total', li.total,
        'sort_order', li.sort_order,
        'created_at', li.created_at
      ) as row
      from invoice_line_items li
      where li.deleted_at is null
        and (li.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or li.created_at > p_after_created_at
             or (li.created_at = p_after_created_at and li.id > p_after_id))
        and (v_from is null or li.created_at >= v_from)
        and (v_to is null or li.created_at <= v_to)
      order by li.created_at, li.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  elsif p_entity_type = 'notes' then
    with page as (
      select n.id, n.created_at, jsonb_build_object(
        'legacy_id', n.id,
        'case_legacy_id', n.case_id,
        'content', n.content,
        'created_at', n.created_at
      ) as row
      from case_internal_notes n
      where n.deleted_at is null
        and (n.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or n.created_at > p_after_created_at
             or (n.created_at = p_after_created_at and n.id > p_after_id))
        and (v_from is null or n.created_at >= v_from)
        and (v_to is null or n.created_at <= v_to)
      order by n.created_at, n.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  elsif p_entity_type = 'statusHistory' then
    with page as (
      select h.id, h.created_at, jsonb_build_object(
        'legacy_id', h.id,
        'case_legacy_id', h.case_id,
        'action', h.action,
        'old_value', h.old_value,
        'new_value', h.new_value,
        'performed_at', h.created_at,
        'created_at', h.created_at
      ) as row
      from case_job_history h
      where h.deleted_at is null
        and (h.tenant_id = v_tenant or is_platform_admin())
        and (p_after_created_at is null
             or h.created_at > p_after_created_at
             or (h.created_at = p_after_created_at and h.id > p_after_id))
        and (v_from is null or h.created_at >= v_from)
        and (v_to is null or h.created_at <= v_to)
      order by h.created_at, h.id
      limit v_limit
    )
    select coalesce(jsonb_agg(row order by created_at, id), '[]'::jsonb),
           max(created_at), (array_agg(id order by created_at desc, id desc))[1]
    into v_rows, v_last_created, v_last_id from page;

  else
    raise exception 'unknown entity_type: %', p_entity_type;
  end if;

  if jsonb_array_length(v_rows) = v_limit then
    v_next := jsonb_build_object('created_at', v_last_created, 'id', v_last_id);
  end if;

  return jsonb_build_object('rows', v_rows, 'next', v_next);
end;
$$;

revoke all on function public.data_migration_export_page(text, timestamptz, uuid, int, jsonb) from public;
grant execute on function public.data_migration_export_page(text, timestamptz, uuid, int, jsonb) to authenticated;
