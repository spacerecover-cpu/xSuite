-- EXP-052/053: create the private 'expense-receipts' storage bucket (it did not
-- exist, so uploadExpenseAttachment always failed) with tenant-folder RLS so a
-- user in tenant B can never read tenant A's receipts. Modeled on case-report-pdfs.
-- Upload path is tenant-prefixed (${tenant_id}/${expense_id}/...) in expensesService.
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

create policy "Tenant members can read expense receipts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'expense-receipts'
    and ((storage.foldername(name))[1] = (select get_current_tenant_id())::text
         or (select is_platform_admin()))
  );

create policy "Tenant staff can upload expense receipts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = (select get_current_tenant_id())::text
    and (select is_staff_user())
  );

create policy "Tenant staff can update expense receipts"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = (select get_current_tenant_id())::text
    and (select is_staff_user())
  );

create policy "Tenant staff can delete expense receipts"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = (select get_current_tenant_id())::text
    and (select is_staff_user())
  );
