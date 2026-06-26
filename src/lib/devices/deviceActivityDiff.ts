// src/lib/devices/deviceActivityDiff.ts
// Pure helper that turns a device save (loaded vs new form state) into a list of
// discrete activity drafts for the case_device_activity log. No I/O — unit-tested.
import type { DeviceFieldDef } from './deviceFieldConfig';
import type { ComponentMeta } from '../diagnosticsTransform';

export interface DeviceActivityDraft {
  activity_type: string;
  title: string;
  description?: string | null;
  status?: string | null;
  component_key?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  metadata?: Record<string, unknown>;
}

interface BeforeState {
  device: Record<string, unknown>;
  diagnostics: Record<string, unknown> | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const asMeta = (v: unknown): Record<string, ComponentMeta> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, ComponentMeta>) : {};

/**
 * Compare the loaded device/diagnostics against the new form state and emit one
 * activity draft per meaningful change. Returns [] when nothing changed.
 */
export function buildDeviceActivityEvents(args: {
  before: BeforeState;
  afterState: Record<string, unknown>;
  componentDefs: DeviceFieldDef[];
  isNewDevice: boolean;
}): DeviceActivityDraft[] {
  const { before, afterState, componentDefs, isNewDevice } = args;
  const events: DeviceActivityDraft[] = [];
  const beforeDiag = (before.diagnostics ?? {}) as Record<string, unknown>;
  const beforeMeta = asMeta(beforeDiag.component_meta);
  const afterMeta = asMeta(afterState.component_meta);

  if (isNewDevice) {
    events.push({
      activity_type: 'device_received',
      title: 'Device Received',
      description: 'Device received and logged in.',
    });
  }

  for (const def of componentDefs) {
    const ck = def.componentKey;
    if (!ck) continue;
    const label = def.labelFallback;

    const oldStatus = str(beforeDiag[def.key]);
    const newStatus = str(afterState[def.key]);
    if (newStatus && newStatus !== oldStatus) {
      events.push({
        activity_type: 'component_status_updated',
        title: 'Component Status Updated',
        description: `${label} marked as ${newStatus}`,
        status: newStatus,
        component_key: ck,
        old_value: oldStatus || null,
        new_value: newStatus,
      });
    }

    const oldNote = str(beforeMeta[ck]?.notes);
    const newNote = str(afterMeta[ck]?.notes);
    if (newNote && newNote !== oldNote) {
      events.push({
        activity_type: 'component_note_added',
        title: 'Component Note Added',
        description: newNote,
        component_key: ck,
        metadata: { component: label },
      });
    }

    const oldTest = str(beforeMeta[ck]?.test_method);
    const newTest = str(afterMeta[ck]?.test_method);
    if (newTest && newTest !== oldTest) {
      events.push({
        activity_type: 'diagnostic_test_performed',
        title: 'Diagnostic Test Performed',
        description: newTest,
        component_key: ck,
        metadata: { component: label, test_method: newTest },
      });
    }
  }

  const oldDiagNote = str(beforeDiag.diagnostic_notes);
  const newDiagNote = str(afterState.diagnostic_notes);
  if (newDiagNote && newDiagNote !== oldDiagNote) {
    events.push({
      activity_type: 'diagnostic_note_added',
      title: 'Diagnostic Note Added',
      description: newDiagNote,
    });
  }

  return events;
}
