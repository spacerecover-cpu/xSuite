import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { sanitizeFilterValue } from './postgrestSanitizer';
import { baseAmount } from './financialMath';

type Tenant = Database['public']['Tables']['tenants']['Row'];
type TenantSubscription = Database['public']['Tables']['tenant_subscriptions']['Row'];
type TenantHealthMetric = Database['public']['Tables']['tenant_health_metrics']['Row'];
type SupportTicket = Database['public']['Tables']['support_tickets']['Row'];
type SupportTicketMessage = Database['public']['Tables']['support_ticket_messages']['Row'];
type PlatformAnnouncement = Database['public']['Tables']['platform_announcements']['Row'];

export interface DashboardStats {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  mrr: number;
  arr: number;
  totalUsers: number;
  activeUsersToday: number;
  openTickets: number;
}

export interface TenantWithHealth extends Tenant {
  subscription?: TenantSubscription;
  health?: TenantHealthMetric;
  userCount?: number;
  caseCount?: number;
}

export interface TicketWithDetails extends SupportTicket {
  customer?: {
    id: string;
    email: string;
    full_name: string;
  };
  tenant?: {
    id: string;
    company_name: string;
  };
  assigned_admin?: {
    id: string;
    full_name: string;
  };
  message_count?: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [tenantsRes, subscriptionsRes, usersRes, activeUsersRes, ticketsRes] = await Promise.all([
    supabase.from('tenants').select('id, status', { count: 'exact', head: true }),
    supabase.from('tenant_subscriptions').select('status'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('user_activity_sessions')
      .select('id', { count: 'exact', head: true })
      .gte('session_start', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress'])
      .is('deleted_at', null),
  ]);

  const subscriptions = subscriptionsRes.data || [];
  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
  const trialSubscriptions = subscriptions.filter(s => s.status === 'trialing');

  const mrrCalc = await supabase
    .from('tenant_subscriptions')
    .select('subscription_plans(price_monthly)')
    .eq('status', 'active')
    .eq('billing_interval', 'month');

  const annualCalc = await supabase
    .from('tenant_subscriptions')
    .select('subscription_plans(price_yearly)')
    .eq('status', 'active')
    .eq('billing_interval', 'year');

  const mrr = (mrrCalc.data || []).reduce(
    (sum, sub) => sum + (sub.subscription_plans?.price_monthly ?? 0),
    0,
  );
  const annualMrr = (annualCalc.data || []).reduce(
    (sum, sub) => sum + (sub.subscription_plans?.price_yearly ?? 0),
    0,
  ) / 12;

  return {
    totalTenants: tenantsRes.count || 0,
    activeTenants: activeSubscriptions.length,
    trialTenants: trialSubscriptions.length,
    mrr: mrr + annualMrr,
    arr: (mrr + annualMrr) * 12,
    totalUsers: usersRes.count || 0,
    activeUsersToday: activeUsersRes.count || 0,
    openTickets: ticketsRes.count || 0,
  };
}

export async function getMRRTrend(days: number = 30): Promise<Array<{ date: string; mrr: number }>> {
  const { data } = await supabase
    .from('platform_metrics')
    .select('metric_date, mrr')
    .gte('metric_date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('metric_date', { ascending: true });

  return (data || []).map(d => ({
    date: d.metric_date,
    mrr: parseFloat(d.mrr as any) || 0,
  }));
}

export async function getPlanDistribution(): Promise<Array<{ plan: string; count: number }>> {
  const { data } = await supabase
    .from('tenant_subscriptions')
    .select('subscription_plans(code)')
    .eq('status', 'active');

  const distribution: Record<string, number> = {};
  (data || []).forEach(sub => {
    const plan = sub.subscription_plans?.code || 'unknown';
    distribution[plan] = (distribution[plan] || 0) + 1;
  });

  return Object.entries(distribution).map(([plan, count]) => ({ plan, count }));
}

export async function getAtRiskTenants(limit: number = 5): Promise<TenantWithHealth[]> {
  const { data: healthMetrics } = await supabase
    .from('tenant_health_metrics')
    .select(`
      *,
      tenants!inner(*)
    `)
    .in('churn_risk', ['high', 'critical'])
    .order('health_score', { ascending: true })
    .limit(limit);

  if (!healthMetrics) return [];

  return healthMetrics.map((metric: any) => ({
    ...metric.tenants,
    health: metric,
  }));
}

export async function getTenantsList(filters?: {
  status?: string;
  plan?: string;
  search?: string;
  churnRisk?: string;
}): Promise<TenantWithHealth[]> {
  let query = supabase
    .from('tenants')
    .select(`
      *,
      tenant_subscriptions(*, subscription_plans(code)),
      profiles(count)
    `)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.search) {
    const s = sanitizeFilterValue(filters.search);
    query = query.or(`company_name.ilike.%${s}%,email.ilike.%${s}%,tenant_code.ilike.%${s}%`);
  }

  const { data: tenants } = await query;
  if (!tenants) return [];

  const tenantIds = tenants.map(t => t.id);
  const { data: healthMetrics } = await supabase
    .from('tenant_health_metrics')
    .select('*')
    .in('tenant_id', tenantIds)
    .order('recorded_at', { ascending: false });

  const healthMap = new Map<string, TenantHealthMetric>();
  healthMetrics?.forEach(h => {
    if (!healthMap.has(h.tenant_id)) {
      healthMap.set(h.tenant_id, h);
    }
  });

  let results = tenants.map((tenant: any) => ({
    ...tenant,
    subscription: tenant.tenant_subscriptions?.[0],
    health: healthMap.get(tenant.id),
    userCount: tenant.profiles?.[0]?.count || 0,
  }));

  if (filters?.plan) {
    results = results.filter(t => t.subscription?.subscription_plans?.code === filters.plan);
  }

  if (filters?.churnRisk) {
    results = results.filter(t => t.health?.churn_risk === filters.churnRisk);
  }

  return results;
}

export async function getTenantDetails(tenantId: string): Promise<TenantWithHealth | null> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle();

  if (!tenant) return null;

  const [subscriptionRes, healthRes, usersRes, casesRes] = await Promise.all([
    supabase.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle(),
    supabase
      .from('tenant_health_metrics')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
  ]);

  return {
    ...tenant,
    subscription: subscriptionRes.data || undefined,
    health: healthRes.data || undefined,
    userCount: usersRes.count || 0,
    caseCount: casesRes.count || 0,
  };
}

export async function calculateHealthScore(tenantId: string): Promise<{
  score: number;
  churnRisk: 'low' | 'medium' | 'high' | 'critical';
  engagementLevel: 'inactive' | 'low' | 'moderate' | 'high' | 'very_high';
  daysSinceLogin: number;
  activeUsers: number;
}> {
  const [usersRes, activeUsersRes, casesRes, paymentsRes, ticketsRes] = await Promise.all([
    supabase.from('profiles').select('id, last_login_at').eq('tenant_id', tenantId),
    supabase
      .from('user_activity_sessions')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .gte('session_start', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .is('deleted_at', null),
    supabase
      .from('payments')
      .select('amount, amount_base')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('status', 'completed')
      .gte('payment_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'in_progress'])
      .is('deleted_at', null),
  ]);

  const totalUsers = usersRes.data?.length || 0;
  const activeUsers = new Set((activeUsersRes.data || []).map(s => s.user_id)).size;
  const casesLast30d = casesRes.count || 0;
  const revenue = (paymentsRes.data || []).reduce((sum, p) => sum + baseAmount(p, 'amount'), 0);
  const openTickets = ticketsRes.count || 0;

  const lastLoginDate = usersRes.data
    ?.map(u => u.last_login_at)
    .filter((value): value is string => value !== null)
    .sort()
    .reverse()[0];
  const daysSinceLogin = lastLoginDate
    ? Math.floor((Date.now() - new Date(lastLoginDate).getTime()) / (24 * 60 * 60 * 1000))
    : 999;

  let score = 100;
  score -= Math.min(daysSinceLogin * 2, 40);
  score -= totalUsers === 0 ? 20 : 0;
  score -= activeUsers === 0 ? 20 : Math.max(0, (1 - activeUsers / Math.max(totalUsers, 1)) * 20);
  score -= casesLast30d === 0 ? 10 : 0;
  score -= revenue === 0 ? 10 : 0;
  score -= openTickets * 2;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let churnRisk: 'low' | 'medium' | 'high' | 'critical';
  if (score >= 70) churnRisk = 'low';
  else if (score >= 50) churnRisk = 'medium';
  else if (score >= 30) churnRisk = 'high';
  else churnRisk = 'critical';

  let engagementLevel: 'inactive' | 'low' | 'moderate' | 'high' | 'very_high';
  if (activeUsers === 0) engagementLevel = 'inactive';
  else if (casesLast30d === 0) engagementLevel = 'low';
  else if (casesLast30d < 5) engagementLevel = 'moderate';
  else if (casesLast30d < 20) engagementLevel = 'high';
  else engagementLevel = 'very_high';

  return { score, churnRisk, engagementLevel, daysSinceLogin, activeUsers };
}

export async function recordHealthMetrics(tenantId: string): Promise<void> {
  const health = await calculateHealthScore(tenantId);

  const [casesRes, revenueRes, ticketsRes] = await Promise.all([
    supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .is('deleted_at', null),
    supabase
      .from('payments')
      .select('amount, amount_base')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('status', 'completed')
      .gte('payment_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'in_progress'])
      .is('deleted_at', null),
  ]);

  const revenue = (revenueRes.data || []).reduce((sum, p) => sum + baseAmount(p, 'amount'), 0);

  await supabase.from('tenant_health_metrics').insert({
    tenant_id: tenantId,
    health_score: health.score,
    churn_risk: health.churnRisk,
    engagement_level: health.engagementLevel,
    active_users_count: health.activeUsers,
    cases_created_last_30d: casesRes.count || 0,
    revenue_last_30d: revenue,
    support_tickets_open: ticketsRes.count || 0,
    days_since_last_login: health.daysSinceLogin,
  });
}

export async function suspendTenant(tenantId: string): Promise<void> {
  await supabase.from('tenants').update({ status: 'suspended' }).eq('id', tenantId);
}

export async function reactivateTenant(tenantId: string): Promise<void> {
  await supabase.from('tenants').update({ status: 'active' }).eq('id', tenantId);
}

// support_tickets.customer_id FKs to auth.users (not profiles), so PostgREST
// cannot embed the customer profile. Fetch the profiles directly by id instead.
async function fetchCustomerProfiles(
  customerIds: Array<string | null | undefined>,
): Promise<Map<string, { id: string; email: string; full_name: string }>> {
  const ids = [...new Set(customerIds.filter((id): id is string => !!id))];
  const map = new Map<string, { id: string; email: string; full_name: string }>();
  if (ids.length === 0) return map;

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', ids);

  (data || []).forEach(p => {
    map.set(p.id, { id: p.id, email: p.email ?? '', full_name: p.full_name ?? '' });
  });

  return map;
}

export async function getSupportTickets(filters?: {
  status?: string;
  priority?: string;
  category?: string;
  assignedTo?: string;
  search?: string;
}): Promise<TicketWithDetails[]> {
  let query = supabase
    .from('support_tickets')
    .select(`
      *,
      tenants(id, company_name),
      platform_admins(id, full_name)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.priority) {
    query = query.eq('priority', filters.priority);
  }
  if (filters?.category) {
    query = query.eq('category', filters.category);
  }
  if (filters?.assignedTo) {
    query = query.eq('assigned_to', filters.assignedTo);
  }
  if (filters?.search) {
    const ts = sanitizeFilterValue(filters.search);
    query = query.or(`ticket_number.ilike.%${ts}%,subject.ilike.%${ts}%`);
  }

  const { data } = await query;

  const rows = data || [];
  const customerProfiles = await fetchCustomerProfiles(
    rows.map((ticket: any) => ticket.customer_id),
  );

  return rows.map((ticket: any) => ({
    ...ticket,
    customer: customerProfiles.get(ticket.customer_id),
    tenant: ticket.tenants,
    assigned_admin: ticket.platform_admins,
  }));
}

export async function getTicketDetails(ticketId: string): Promise<TicketWithDetails | null> {
  const { data: ticket } = await supabase
    .from('support_tickets')
    .select(`
      *,
      tenants(id, company_name),
      platform_admins(id, full_name)
    `)
    .eq('id', ticketId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!ticket) return null;

  const customerProfiles = await fetchCustomerProfiles([(ticket as any).customer_id]);

  return {
    ...(ticket as any),
    customer: customerProfiles.get((ticket as any).customer_id),
    tenant: (ticket as any).tenants,
    assigned_admin: (ticket as any).platform_admins,
  };
}

export async function getTicketMessages(ticketId: string): Promise<SupportTicketMessage[]> {
  const { data } = await supabase
    .from('support_ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  return data || [];
}

export async function createTicket(ticket: {
  tenantId: string;
  customerId: string;
  subject: string;
  message: string;
  category?: string;
  priority?: string;
}): Promise<SupportTicket> {
  const { data: ticketNumber } = await supabase.rpc('get_next_ticket_number');
  if (!ticketNumber) throw new Error('Failed to generate ticket number');

  const { data: newTicket, error } = await supabase
    .from('support_tickets')
    .insert({
      ticket_number: ticketNumber,
      tenant_id: ticket.tenantId,
      customer_id: ticket.customerId,
      subject: ticket.subject,
      category: ticket.category || 'general',
      priority: ticket.priority || 'medium',
      status: 'open',
    })
    .select()
    .maybeSingle();

  if (error || !newTicket) throw error;

  await supabase.from('support_ticket_messages').insert({
    ticket_id: newTicket.id,
    sender_type: 'customer',
    sender_id: ticket.customerId,
    message: ticket.message,
  });

  return newTicket;
}

export async function addTicketMessage(
  ticketId: string,
  senderId: string,
  message: string,
  senderType: 'customer' | 'support',
  isInternalNote: boolean = false
): Promise<SupportTicketMessage> {
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticketId,
      sender_type: senderType,
      sender_id: senderId,
      message,
      is_internal_note: isInternalNote,
    })
    .select()
    .maybeSingle();

  if (error || !data) throw error;

  await supabase
    .from('support_tickets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', ticketId);

  return data;
}

export async function updateTicketStatus(
  ticketId: string,
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed',
  resolutionNotes?: string
): Promise<void> {
  const updates: any = { status, updated_at: new Date().toISOString() };

  if (status === 'resolved') {
    updates.resolved_at = new Date().toISOString();
    if (resolutionNotes) updates.resolution_notes = resolutionNotes;
  }

  if (status === 'closed') {
    updates.closed_at = new Date().toISOString();
  }

  await supabase.from('support_tickets').update(updates).eq('id', ticketId);
}

export async function assignTicket(ticketId: string, adminId: string | null): Promise<void> {
  await supabase
    .from('support_tickets')
    .update({ assigned_to: adminId, updated_at: new Date().toISOString() })
    .eq('id', ticketId);
}

export async function getAnnouncements(includeInactive: boolean = false): Promise<PlatformAnnouncement[]> {
  let query = supabase
    .from('platform_announcements')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (!includeInactive) {
    query = query
      .eq('is_active', true)
      .lte('start_date', new Date().toISOString())
      .or('end_date.is.null,end_date.gte.' + new Date().toISOString());
  }

  const { data } = await query;
  return data || [];
}

export async function createAnnouncement(announcement: {
  titleEn: string;
  titleAr?: string;
  contentEn: string;
  contentAr?: string;
  type?: string;
  targetAudience?: string;
  showAsBanner?: boolean;
  isDismissible?: boolean;
  startDate?: string;
  endDate?: string;
  createdBy: string;
}): Promise<PlatformAnnouncement> {
  const { data, error } = await supabase
    .from('platform_announcements')
    .insert({
      title_en: announcement.titleEn,
      title_ar: announcement.titleAr,
      content_en: announcement.contentEn,
      content_ar: announcement.contentAr,
      announcement_type: announcement.type || 'info',
      target_audience: announcement.targetAudience || 'all',
      show_as_banner: announcement.showAsBanner ?? true,
      is_dismissible: announcement.isDismissible ?? true,
      start_date: announcement.startDate || new Date().toISOString(),
      end_date: announcement.endDate,
      created_by: announcement.createdBy,
    })
    .select()
    .maybeSingle();

  if (error || !data) throw error;
  return data;
}

export async function dismissAnnouncement(announcementId: string, userId: string): Promise<void> {
  await supabase.from('announcement_dismissals').insert({
    announcement_id: announcementId,
    user_id: userId,
  });
}

export async function getAnnouncementDismissals(announcementId: string): Promise<number> {
  const { count } = await supabase
    .from('announcement_dismissals')
    .select('id', { count: 'exact', head: true })
    .eq('announcement_id', announcementId);

  return count || 0;
}

export async function getCurrentPlatformAdmin(): Promise<{
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
} | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('platform_admins')
    .select('id, user_id, full_name, email, role, created_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    user_id: data.user_id,
    name: data.full_name,
    email: data.email,
    role: data.role,
    created_at: data.created_at,
  };
}

export async function getTenantUsers(tenantId: string) {
  // profiles.last_sign_in_at does not exist in v1.0.0 schema; the column is `last_login_at`.
  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, last_login_at, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  return data || [];
}

export async function getTenantBillingHistory(tenantId: string) {
  const { data } = await supabase
    .from('billing_invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('invoice_date', { ascending: false });

  return data || [];
}

export async function getTenantActivityLog(tenantId: string, limit: number = 50) {
  const { data } = await supabase
    .from('tenant_activity_log')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

export async function getHealthMetricsHistory(tenantId: string, days: number = 30) {
  const { data } = await supabase
    .from('tenant_health_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('recorded_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('recorded_at', { ascending: true });

  return data || [];
}

export async function getTenantNotes(tenantId: string) {
  const { data } = await supabase
    .from('tenant_activity_log')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('activity_type', 'internal_note')
    .order('created_at', { ascending: false });

  return data || [];
}

export async function addTenantNote(
  tenantId: string,
  note: string,
  adminId: string,
  adminName: string
): Promise<void> {
  await supabase.from('tenant_activity_log').insert({
    tenant_id: tenantId,
    activity_type: 'internal_note',
    activity_details: {
      note,
      admin_id: adminId,
      admin_name: adminName,
    },
  });
}

export async function getTicketStats(): Promise<{
  open: number;
  inProgress: number;
  waitingCustomer: number;
  resolvedToday: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [openRes, inProgressRes, waitingRes, resolvedRes] = await Promise.all([
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .is('deleted_at', null),
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'in_progress')
      .is('deleted_at', null),
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'waiting_customer')
      .is('deleted_at', null),
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'resolved')
      .gte('resolved_at', today.toISOString())
      .is('deleted_at', null),
  ]);

  return {
    open: openRes.count || 0,
    inProgress: inProgressRes.count || 0,
    waitingCustomer: waitingRes.count || 0,
    resolvedToday: resolvedRes.count || 0,
  };
}

export async function duplicateAnnouncement(id: string): Promise<PlatformAnnouncement> {
  const { data: original } = await supabase
    .from('platform_announcements')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!original) throw new Error('Announcement not found');

  const { data, error } = await supabase
    .from('platform_announcements')
    .insert({
      title_en: `${original.title_en} (Copy)`,
      title_ar: original.title_ar ? `${original.title_ar} (نسخة)` : undefined,
      content_en: original.content_en,
      content_ar: original.content_ar,
      announcement_type: original.announcement_type,
      target_audience: original.target_audience,
      show_as_banner: original.show_as_banner,
      is_dismissible: original.is_dismissible,
      show_in_app: original.show_in_app,
      is_active: false,
      start_date: new Date().toISOString(),
      end_date: original.end_date,
      created_by: original.created_by,
    })
    .select()
    .maybeSingle();

  if (error || !data) throw error;
  return data;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase
    .from('platform_announcements')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function updateAnnouncement(
  id: string,
  updates: Partial<Database['public']['Tables']['platform_announcements']['Update']>
): Promise<PlatformAnnouncement> {
  const { data, error } = await supabase
    .from('platform_announcements')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !data) throw error;
  return data;
}

export async function getActiveAnnouncementsForUser(
  userId: string,
  planCode: string
): Promise<PlatformAnnouncement[]> {
  const now = new Date().toISOString();

  const { data: announcements } = await supabase
    .from('platform_announcements')
    .select('*')
    .eq('is_active', true)
    .eq('show_in_app', true)
    .eq('show_as_banner', true)
    .lte('start_date', now)
    .or(`end_date.is.null,end_date.gte.${sanitizeFilterValue(now)}`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (!announcements) return [];

  const filteredByAudience = announcements.filter(
    a => a.target_audience === 'all' || a.target_audience === planCode
  );

  const { data: dismissals } = await supabase
    .from('announcement_dismissals')
    .select('announcement_id')
    .eq('user_id', userId)
    .in('announcement_id', filteredByAudience.map(a => a.id));

  const dismissedIds = new Set(dismissals?.map(d => d.announcement_id) || []);

  return filteredByAudience.filter(a => !dismissedIds.has(a.id));
}
