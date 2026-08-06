import { useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ClipboardCheck,
  CheckCircle2,
  FileText,
  Mail,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { logger } from '../../lib/logger';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useCustomerPickerRows } from '../../lib/pickerSearch';
import { Button } from '../../components/ui/Button';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { CustomerFormModal } from '../../components/customers/CustomerFormModal';
import { EmailDocumentModal } from '../../components/cases/EmailDocumentModal';
import { DepositorSection, type DepositorValue } from '../../components/cases/checkin/DepositorSection';
import {
  IntakeDeviceRows,
  emptyDevice,
  devicesAreComplete,
  type IntakeDeviceValue,
} from '../../components/cases/checkin/IntakeDeviceRows';
import {
  AcknowledgeSection,
  useIntakeWhatsAppConsentText,
  type AcknowledgeValue,
} from '../../components/cases/checkin/AcknowledgeSection';
import { beginIntakeAttempt, clearIntakeAttempt } from '../../lib/intakeAttemptKey';
import {
  createCaseWithDevices,
  logCaseIntake,
  signIntakeReceipt,
  captureIntakeConsents,
  requireDepositorId,
  DevicesInCustodyError,
  IntakeConsentError,
  type CreateCaseWithDevicesResult,
} from '../../lib/caseIntakeService';
import { useCompanyName } from '../../components/customers/WhatsAppConsentBlock';
import { createDocumentInstance } from '../../lib/documentInstanceService';
import { shouldAutoPrintLabel } from '../../lib/labelPrefsService';
import { printCustomerCopy } from '../../lib/printUtils';
import { CASE_COMMAND_STATS_KEY } from '../../hooks/useCaseCommandStats';

interface CheckedInCase {
  caseId: string;
  caseNumber: string;
  /**
   * This submit matched an attempt that had already landed — typically a reload
   * after the devices were taken into custody. No second case, and crucially no
   * second set of DEVICE_RECEIVED events, was written.
   */
  alreadyRecorded?: boolean;
  /**
   * True only when device rows came back with ids. A REJECTED insert and an
   * insert whose response was lost are indistinguishable, so an empty list means
   * "may or may not be in custody" — never assert custody from it.
   */
  devicesConfirmed?: boolean;
}

/**
 * A check-in that took the devices into custody but did not finish writing its
 * evidence. `consentOnly` splits the one recoverable case from the rest: consent
 * is the LAST step, so its failure leaves the receipt, the depositor record and
 * the custody event all written, and the two facts it missed each have a screen
 * that can still record them. Every earlier failure has no such screen.
 */
interface StalledCheckIn extends CheckedInCase {
  consentOnly: boolean;
  whatsappPending: boolean;
  /** The custody event itself is missing — it has no other in-app writer. */
  destructivePending: boolean;
  /** Custody landed, only the internal note is missing — re-creatable in-app. */
  destructiveNotePending: boolean;
}

function useCatalog(table: 'catalog_device_types' | 'catalog_device_brands' | 'catalog_device_capacities' | 'catalog_device_conditions', key: string) {
  const { data = [] } = useQuery({
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });
  return data;
}


/**
 * Front-desk check-in. One scrolling surface rather than a stepper: counter work
 * is interrupt-driven and must stay resumable at any point.
 *
 * The submit order is load-bearing evidence handling, not a preference. The
 * receipt is signed BEFORE the custody event is appended so that event can carry
 * the receipt instance id, and consent is captured last so a consent failure can
 * never orphan custody evidence that is already written and append-only.
 */
export function CaseCheckIn() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const toast = useToast();
  const whatsappConsentText = useIntakeWhatsAppConsentText();
  const companyName = useCompanyName();
  const blockerId = useId();

  const [customerId, setCustomerId] = useState('');
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  // The templated body says "please find attached", so the modal must not open
  // until the receipt actually exists as a blob.
  const [emailAttachment, setEmailAttachment] = useState<{ blob: Blob; filename: string } | null>(null);
  const [preparingEmail, setPreparingEmail] = useState(false);
  const [result, setResult] = useState<CheckedInCase | null>(null);
  // The five submit writes are not one transaction. Once the case_devices insert
  // has been sent, a plain retry would re-run createCaseWithDevices and append a
  // second, uncorrectable set of DEVICE_RECEIVED custody events for the same
  // physical media — so a failure past that point must not offer one. That
  // includes createCaseWithDevices' OWN failures: it throws
  // DevicesInCustodyError once the rows may have been committed.
  const createdCase = useRef<CheckedInCase | null>(null);
  // Flipped once the only writes left are the consent facts, which decides
  // whether the stall screen can honestly offer a remedy.
  const consentStepReached = useRef(false);
  const [stalled, setStalled] = useState<StalledCheckIn | null>(null);

  const [depositor, setDepositor] = useState<DepositorValue>({
    name: '', mobile: '', nationalId: '', relationship: 'self',
  });
  const [devices, setDevices] = useState<IntakeDeviceValue[]>([emptyDevice('device-0')]);
  const [ack, setAck] = useState<AcknowledgeValue>({
    termsAccepted: false, whatsappUtility: false, destructiveAuthorized: false, signature: null,
  });

  const { rows: customers, onSearchTermChange: onCustomerSearch } = useCustomerPickerRows(
    customerId || undefined,
  );
  const customer = customers.find((c) => c.id === customerId);

  const deviceTypes = useCatalog('catalog_device_types', 'device_types');
  const brands = useCatalog('catalog_device_brands', 'brands');
  const capacities = useCatalog('catalog_device_capacities', 'capacities');
  const conditions = useCatalog('catalog_device_conditions', 'device_conditions');

  const customerOptions = useMemo(
    () => customers.map((c) => ({
      id: c.id,
      name: c.customer_name,
      keywords: [c.customer_number, c.email, c.mobile_number].filter(Boolean).join(' '),
    })),
    [customers],
  );

  function handleCustomer(id: string) {
    setCustomerId(id);
    const picked = customers.find((c) => c.id === id);
    if (depositor.relationship === 'self') {
      setDepositor((d) => ({ ...d, name: picked?.customer_name ?? '' }));
    }
    // Switching to a customer with no mobile must drop a tick already made
    // against the previous one — whatsapp_consents is append-only, so an opt-in
    // row with a null phone is a permanent, undeliverable consent record.
    if (!picked?.mobile_number) {
      setAck((a) => (a.whatsappUtility ? { ...a, whatsappUtility: false } : a));
    }
  }

  const whatsappUnavailableReason = customer?.mobile_number
    ? null
    : customerId
      ? 'No mobile number on this customer’s record — add one to their profile before opting them in.'
      : 'Select the customer first — the opt-in is recorded against their mobile number.';

  const depositorDone =
    depositor.name.trim() !== '' &&
    (!requireDepositorId(depositor.relationship) || depositor.nationalId.trim() !== '');

  // Counter work is interrupt-driven: the rail says where you got to, the
  // sticky bar says what is still holding the check-in up.
  const progress = [
    { name: 'Customer', done: customerId !== '' },
    { name: 'Depositor', done: depositorDone },
    { name: 'Devices', done: devicesAreComplete(devices) },
    { name: 'Acknowledge', done: ack.termsAccepted },
  ];

  const blocker = !customerId
    ? 'Select the customer this case belongs to.'
    : !depositor.name.trim()
      ? 'Record who is handing the devices over.'
      : requireDepositorId(depositor.relationship) && !depositor.nationalId.trim()
        ? 'A National ID is required when the depositor is not the customer.'
        : !devicesAreComplete(devices)
          ? 'Every device needs a recorded condition before it can be accepted.'
          : !ack.termsAccepted
            ? 'The customer must accept the terms of service.'
            : null;

  const checkIn = useMutation({
    mutationFn: async (): Promise<CheckedInCase> => {
      if (!profile?.tenant_id) throw new Error('No active tenant — please sign in again.');
      const tenantId = profile.tenant_id;
      createdCase.current = null;
      consentStepReached.current = false;

      let created: CreateCaseWithDevicesResult;
      try {
        created = await createCaseWithDevices({
          tenantId,
          profileId: profile.id ?? null,
          profileRole: profile.role ?? null,
          customerId,
          customerName: customer?.customer_name ?? 'Customer',
          priority: null,
          // Survives a reload, so a resubmit of THIS hand-over returns the case
          // the first submit created rather than taking the devices in twice.
          idempotencyKey: beginIntakeAttempt(customerId),
          devices: devices.map((d, i) => ({
            device_type_id: d.device_type_id,
            brand_id: d.brand_id,
            model: d.model || null,
            serial_number: d.serial_number || null,
            capacity_id: d.capacity_id,
            condition_id: d.condition_id,
            notes: d.notes || null,
            created_by: profile.id ?? null,
            isPrimary: i === 0,
          })),
        });
      } catch (error) {
        // The devices may already be in custody even though creation rejected —
        // record the identity so onError lands on the stalled screen instead of
        // letting the operator retry one physical hand-over into two cases.
        if (error instanceof DevicesInCustodyError) {
          createdCase.current = {
            caseId: error.created.caseId,
            caseNumber: error.created.caseNumber,
            devicesConfirmed: error.created.deviceIds.length > 0,
          };
        }
        throw error;
      }

      const { caseId, caseNumber, deviceIds } = created;
      createdCase.current = { caseId, caseNumber, devicesConfirmed: deviceIds.length > 0 };

      // The evidence steps below already ran on the submit that created this case.
      // Re-running them would raise a second receipt instance and a second
      // signature for one hand-over, so stop here and say what happened.
      if (created.reused) {
        clearIntakeAttempt();
        return { caseId, caseNumber, alreadyRecorded: true };
      }

      const instance = await createDocumentInstance({
        docType: 'customer_copy',
        title: `Check-in receipt ${caseNumber}`,
        caseId,
        customerId,
      });

      if (ack.signature) {
        await signIntakeReceipt(instance.id, ack.signature, customerId);
      }

      await logCaseIntake({
        caseId,
        deviceIds,
        depositorName: depositor.name,
        depositorMobile: depositor.mobile,
        depositorId: depositor.nationalId,
        depositorRelationship: depositor.relationship,
        receiptInstanceId: instance.id,
      });

      consentStepReached.current = true;
      await captureIntakeConsents({
        tenantId,
        customerId,
        caseId,
        phoneE164: customer?.mobile_number ?? null,
        whatsappUtility: ack.whatsappUtility,
        destructiveAuthorized: ack.destructiveAuthorized,
        consentText: whatsappConsentText,
      });

      return { caseId, caseNumber };
    },
    onSuccess: (checkedIn) => {
      createdCase.current = null;
      clearIntakeAttempt();
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases_count'] });
      queryClient.invalidateQueries({ queryKey: [CASE_COMMAND_STATS_KEY] });
      setResult(checkedIn);

      // Fire-and-forget: a printer fault must never block intake or discard the
      // evidence already written above.
      void shouldAutoPrintLabel('case')
        .then(async (enabled) => {
          if (!enabled) return;
          const { printCaseLabels } = await import('../../lib/pdf/labels/labelPrintService');
          await printCaseLabels(checkedIn.caseId, { output: 'print' });
        })
        .catch((error) => logger.error('Case label print failed after check-in:', error));
    },
    onError: (error: Error) => {
      logger.error('Check-in failed:', error);
      const created = createdCase.current;
      // Once the devices are in custody the stalled screen is the whole account
      // of this failure: no toast beside it, because these messages ask for the
      // retry (the 40001 one says so verbatim) that the screen exists to refuse.
      if (!created) {
        toast.error(`Check-in failed: ${error.message}`);
        return;
      }
      // What actually landed, not what the operator ticked — the two diverge
      // exactly when a consent write fails half way.
      const recorded = error instanceof IntakeConsentError ? error.recorded : null;
      const whatsappPending = consentStepReached.current && ack.whatsappUtility
        && !(recorded?.whatsapp ?? false);
      const destructivePending = consentStepReached.current && ack.destructiveAuthorized
        && !(recorded?.destructiveCustody ?? false);
      const destructiveNotePending = consentStepReached.current && ack.destructiveAuthorized
        && (recorded?.destructiveCustody ?? false) && !(recorded?.destructiveNote ?? false);
      setStalled({
        ...created,
        consentOnly: whatsappPending || destructivePending || destructiveNotePending,
        whatsappPending,
        destructivePending,
        destructiveNotePending,
      });
    },
  });

  function resetForAnother() {
    clearIntakeAttempt();
    setResult(null);
    setStalled(null);
    createdCase.current = null;
    consentStepReached.current = false;
    setEmailModalOpen(false);
    setEmailAttachment(null);
    setCustomerId('');
    setDepositor({ name: '', mobile: '', nationalId: '', relationship: 'self' });
    setDevices([emptyDevice(`device-${Date.now()}`)]);
    setAck({ termsAccepted: false, whatsappUtility: false, destructiveAuthorized: false, signature: null });
  }

  if (stalled) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <PageHeaderSlot title="Check in devices" icon={ClipboardCheck} iconColor="rgb(var(--color-primary))" />
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-warning-muted">
            <AlertTriangle aria-hidden="true" className="h-9 w-9 text-warning" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            {stalled.consentOnly
              ? `${stalled.caseNumber} was created — its consent record is incomplete`
              : `${stalled.caseNumber} was created — its intake evidence is incomplete`}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            {stalled.consentOnly
              ? `The devices are in custody and the ${ack.signature ? 'signed receipt' : 'receipt'}, depositor identity and custody event are all recorded — only the consent step did not complete. Checking in again would take the same devices into custody a second time, so this check-in cannot be retried.`
              : stalled.devicesConfirmed
                ? 'The devices are in custody, but the signed receipt, depositor identity or custody event did not complete. Checking in again would take the same devices into custody a second time, so this check-in cannot be retried.'
                : `${stalled.caseNumber} was created, but the devices may or may not have been recorded against it — the request failed at exactly the point that is impossible to tell apart from the outside. Checking in again could take the same devices into custody twice, so this check-in cannot be retried.`}
          </p>
          {stalled.consentOnly ? (
            <div className="mx-auto mt-3 max-w-md text-start text-sm text-slate-500">
              <p>Record what the customer agreed to at the counter from these screens instead:</p>
              <ul className="mt-2 list-disc space-y-1 ps-5">
                {stalled.whatsappPending && (
                  <li>
                    The WhatsApp opt-in — on the customer&apos;s profile, under Edit Profile →
                    WhatsApp updates.
                  </li>
                )}
                {stalled.destructivePending && (
                  <li>
                    The authorization for recovery attempts that may alter the media did not reach
                    the custody log, and no screen can append it after the fact. Escalate{' '}
                    {stalled.caseNumber} to a lab administrator before those attempts begin.
                  </li>
                )}
                {stalled.destructiveNotePending && (
                  <li>
                    The authorization is in the custody log, but its internal note is missing — add
                    it on {stalled.caseNumber} so the next engineer sees it.
                  </li>
                )}
              </ul>
            </div>
          ) : (
            <p className="mx-auto mt-3 max-w-md text-sm text-slate-500">
              {stalled.devicesConfirmed
                ? `No screen in the app can write the missing intake evidence after the fact. Keep the paper receipt with the devices and escalate ${stalled.caseNumber} to a lab administrator.`
                : `Open ${stalled.caseNumber} and check which devices were recorded. Add any that are missing there — that records them properly. Keep the paper receipt with the devices and escalate if anything looks wrong.`}
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => navigate(`/cases/${stalled.caseId}`)}>
              Open the case
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 border-t border-border pt-6 text-sm">
            <button
              type="button"
              onClick={resetForAnother}
              className="font-medium text-slate-600 hover:text-slate-900"
            >
              Check in another
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (result) {
    const canSend = Boolean(customer?.email);
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <PageHeaderSlot title="Check in devices" icon={ClipboardCheck} iconColor="rgb(var(--color-primary))" />
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success-muted">
            <CheckCircle2 aria-hidden="true" className="h-9 w-9 text-success" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            {result.alreadyRecorded
              ? `${result.caseNumber} was already checked in`
              : `${result.caseNumber} is in custody`}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            {result.alreadyRecorded ? (
              <>
                This hand-over had already been recorded, so the devices were not
                taken in a second time and nothing you just re-entered was saved.
                Open the case to confirm what was recorded.
              </>
            ) : (
              <>
                {devices.length} device{devices.length === 1 ? '' : 's'} received from{' '}
                {depositor.name || customer?.customer_name}. Hand the customer their copy of the receipt.
              </>
            )}
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => printCustomerCopy(result.caseId, result.caseNumber)}>
              <FileText aria-hidden="true" className="me-2 h-4 w-4" />
              Print customer copy
            </Button>
            <Button
              variant="secondary"
              disabled={!canSend || preparingEmail}
              onClick={async () => {
                setPreparingEmail(true);
                try {
                  const { generateCustomerCopyAsBlob } = await import('../../lib/pdf/pdfService');
                  const pdf = await generateCustomerCopyAsBlob(result.caseId);
                  if (!pdf.success || !pdf.blob) {
                    toast.error(pdf.error ?? 'Could not prepare the receipt to send.');
                    return;
                  }
                  setEmailAttachment({
                    blob: pdf.blob,
                    filename: pdf.filename ?? `check-in-receipt-${result.caseNumber}.pdf`,
                  });
                  setEmailModalOpen(true);
                } finally {
                  setPreparingEmail(false);
                }
              }}
            >
              <Mail aria-hidden="true" className="me-2 h-4 w-4" />
              Send to customer
            </Button>
          </div>
          {!canSend && (
            <p className="mt-3 text-xs text-slate-500">
              No email on file — print the copy instead.
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 border-t border-border pt-6 text-sm">
            <button
              type="button"
              onClick={() => navigate(`/cases/${result.caseId}`)}
              className="font-medium text-primary hover:underline"
            >
              Open the case
            </button>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <button
              type="button"
              onClick={resetForAnother}
              className="font-medium text-slate-600 hover:text-slate-900"
            >
              Check in another
            </button>
          </div>
        </div>

        <EmailDocumentModal
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          blob={emailAttachment?.blob}
          filename={emailAttachment?.filename}
          documentType="customer_copy"
          caseId={result.caseId}
          caseNumber={result.caseNumber}
          customerName={customer?.customer_name ?? 'Customer'}
          customerEmail={customer?.email ?? undefined}
          companyName={companyName}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-8">
      <PageHeaderSlot title="Check in devices" icon={ClipboardCheck} iconColor="rgb(var(--color-primary))" />

      <header className="mb-8">
        <h1 className="text-xl font-semibold text-slate-900">Check in devices</h1>
        <p className="mt-1 text-sm text-slate-500">
          Records the moment the lab takes custody. The receipt this produces is the
          proof of what arrived, in what condition, and from whom.
        </p>
        <ol className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium">
          {progress.map(({ name, done }) => (
            <li
              key={name}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                done ? 'bg-success-muted text-success' : 'bg-surface-muted text-slate-500'
              }`}
            >
              <CheckCircle2
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${done ? '' : 'opacity-30'}`}
              />
              {name}
              <span className="sr-only">{done ? ' — complete' : ' — outstanding'}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className="space-y-10">
        <section className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Customer</h2>
            <p className="mt-1 text-sm text-slate-500">
              The party the recovered data will be released to.
            </p>
          </div>
          <SearchableSelect
            floatingLabel
            label="Customer"
            name="customer"
            required
            value={customerId}
            onChange={handleCustomer}
            options={customerOptions}
            onSearchTermChange={onCustomerSearch}
            placeholder="Search by name, email, mobile or number"
            onAddNew={() => setCustomerModalOpen(true)}
            addNewLabel="Add a new customer"
          />
          {customer && (
            <dl className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Number</dt>
                <dd className="mt-0.5 text-slate-900">{customer.customer_number ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Mobile</dt>
                <dd className="mt-0.5 text-slate-900">{customer.mobile_number ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
                <dd className="mt-0.5 truncate text-slate-900">{customer.email ?? '—'}</dd>
              </div>
            </dl>
          )}
        </section>

        <DepositorSection
          value={depositor}
          customerName={customer?.customer_name ?? ''}
          onChange={setDepositor}
        />

        <IntakeDeviceRows
          value={devices}
          deviceTypes={deviceTypes}
          brands={brands}
          capacities={capacities}
          conditions={conditions}
          onChange={setDevices}
        />

        <AcknowledgeSection
          value={ack}
          onChange={setAck}
          whatsappUnavailableReason={whatsappUnavailableReason}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p id={blockerId} role="status" className="flex items-center gap-2 text-sm text-slate-500">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
            {blocker ?? 'Ready — this will take the devices into custody.'}
          </p>
          <Button
            onClick={() => checkIn.mutate()}
            disabled={blocker !== null || checkIn.isPending}
            isLoading={checkIn.isPending}
            aria-describedby={blockerId}
          >
            <Plus aria-hidden="true" className="me-2 h-4 w-4" />
            Complete check-in
          </Button>
        </div>
      </div>

      <CustomerFormModal
        isOpen={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        consentSource="intake_form"
        onSuccess={(created) => {
          const id = (created as { id?: string }).id;
          if (id) handleCustomer(id);
          setCustomerModalOpen(false);
        }}
      />
    </div>
  );
}
