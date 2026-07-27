// WhatsApp automation event catalog. Single source of truth for:
// - Settings → Automations rows (label, stage, defaults)
// - rule seeding (whatsappSettingsService.ensureRules)
// - the dispatcher's event_key vocabulary (mirrored in SQL: dispatch_notification_event_whatsapp)
// Spec: docs/superpowers/specs/2026-07-27-whatsapp-communication-automation-design.md §3

export type WhatsAppConsentScope = 'utility' | 'marketing';

export interface WhatsAppEventDef {
  key: string;                    // rules table event_key
  label: string;                  // Settings label
  stage: string;                  // lifecycle grouping header
  description: string;
  requiredConsent: WhatsAppConsentScope;
  defaultDelayMinutes: number;
  scheduled?: boolean;            // driven by process_whatsapp_scheduled_reminders
  defaultReminderConfig?: { after_days: number };
}

export const WHATSAPP_EVENT_CATALOG: WhatsAppEventDef[] = [
  { key: 'case.created', label: 'Case Registered', stage: 'Intake',
    description: 'Confirmation that the case was created', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.device_received', label: 'Device Check-in Receipt', stage: 'Intake',
    description: 'Receipt when devices are checked in (one message per intake day; the delay debounces multi-device jobs so a 12-drive RAID sends ONE receipt listing all drives)',
    requiredConsent: 'utility', defaultDelayMinutes: 15 },
  { key: 'case.phase_changed:diagnosis', label: 'Accepted for Evaluation', stage: 'Diagnosis',
    description: 'Case moved into diagnosis', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'quote.created', label: 'Quote Generated', stage: 'Quotation',
    description: 'A quote was generated for the case', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'quote.sent', label: 'Quote Sent', stage: 'Quotation',
    description: 'The quote was sent to the customer', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'quote.reminder', label: 'Quote Reminder', stage: 'Quotation',
    description: 'Reminder while a sent quote awaits a decision', requiredConsent: 'utility',
    defaultDelayMinutes: 0, scheduled: true, defaultReminderConfig: { after_days: 3 } },
  { key: 'quote.approved', label: 'Quote Approved', stage: 'Quotation',
    description: 'Confirmation after the customer approves', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'quote.rejected', label: 'Quote Declined', stage: 'Quotation',
    description: 'Acknowledgement after the customer declines', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.phase_changed:recovery', label: 'Recovery Started', stage: 'Recovery',
    description: 'Recovery work has begun', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.parts_ordered', label: 'Parts Ordered', stage: 'Recovery',
    description: 'Donor parts allocated to the case (one message per day at most)',
    requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.milestone', label: 'Recovery Progress Update', stage: 'Recovery',
    description: 'Staff-triggered progress update from the case detail (Send progress update action)',
    requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.recovery_outcome', label: 'Recovery Outcome Recorded', stage: 'Recovery',
    description: 'Recovery outcome recorded — starter copy is outcome-neutral and renders {{recovery_outcome}}; per-outcome template overrides are on the roadmap',
    requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.phase_changed:ready', label: 'Ready for Collection', stage: 'Delivery',
    description: 'Recovered data / device ready for collection', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'invoice.issued', label: 'Invoice Issued', stage: 'Billing',
    description: 'A tax invoice was issued', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'payment.received.customer', label: 'Payment Received', stage: 'Billing',
    description: 'Payment receipt confirmation', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.checked_out', label: 'Device Collected', stage: 'Delivery',
    description: 'Checkout confirmation with collector details', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.phase_changed:closed', label: 'Case Closed', stage: 'Closure',
    description: 'The case is closed', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.phase_changed:no_solution', label: 'No Solution — Follow-up Plan', stage: 'Closure',
    description: 'Recovery not currently possible; explains the outcome and the scheduled future review',
    requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.phase_changed:cancelled', label: 'Case Cancelled', stage: 'Closure',
    description: 'Cancellation acknowledged; device-return arrangements',
    requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.follow_up_due', label: 'Follow-up Reminder', stage: 'Follow-up',
    description: 'Scheduled follow-ups incl. pickup and no-solution reviews', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.feedback_request', label: 'Feedback Request', stage: 'Follow-up',
    description: 'Ask for service feedback after delivery (marketing consent required)',
    requiredConsent: 'marketing', defaultDelayMinutes: 0, scheduled: true, defaultReminderConfig: { after_days: 2 } },
  { key: 'case.review_request', label: 'Google Review Request', stage: 'Follow-up',
    description: 'Ask for a public review after delivery (marketing consent required)',
    requiredConsent: 'marketing', defaultDelayMinutes: 0, scheduled: true, defaultReminderConfig: { after_days: 4 } },
];

export function effectiveEventKey(eventType: string, payload: Record<string, unknown>): string {
  if (eventType === 'case.phase_changed' || eventType === 'case.phase_changed.customer') {
    return `case.phase_changed:${String(payload.to_phase ?? '')}`;
  }
  return eventType;
}
