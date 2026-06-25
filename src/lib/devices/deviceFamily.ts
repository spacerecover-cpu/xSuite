// src/lib/devices/deviceFamily.ts
export type DeviceFamily =
  | 'hdd' | 'ssd' | 'usb_flash' | 'memory_card' | 'mobile' | 'raid' | 'nas' | 'other';

/** Explicit map from the live catalog_device_types names → family. */
const EXPLICIT: Record<string, DeviceFamily> = {
  '2.5" hdd': 'hdd', '3.5" hdd': 'hdd', 'hybrid drive': 'hdd',
  '2.5" ssd': 'ssd', 'm.2 ssd': 'ssd', 'nvme ssd': 'ssd', 'ssd external': 'ssd',
  'usb drive': 'usb_flash', 'memory stick': 'usb_flash',
  'sd card': 'memory_card', 'microsd card': 'memory_card', 'cf card': 'memory_card',
  'mobile phone': 'mobile', 'tablet': 'mobile',
  'raid array': 'raid', 'server': 'raid',
  'nas device': 'nas',
  'dvr/camera': 'other',
};

/** Substring fallback for catalog rows added later that are not in EXPLICIT. */
function heuristic(name: string): DeviceFamily {
  if (/\bnas\b/.test(name)) return 'nas';
  if (/raid|server/.test(name)) return 'raid';
  if (/phone|tablet|mobile/.test(name)) return 'mobile';
  if (/sd card|microsd|cf card|memory card/.test(name)) return 'memory_card';
  if (/usb|flash|memory stick|thumb/.test(name)) return 'usb_flash';
  if (/ssd|nvme|m\.2|solid state/.test(name)) return 'ssd';
  if (/hdd|hard|mechanical|hybrid|sshd/.test(name)) return 'hdd';
  return 'other';
}

export function resolveDeviceFamily(typeName: string | null | undefined): DeviceFamily {
  const key = (typeName ?? '').trim().toLowerCase();
  if (!key) return 'other';
  return EXPLICIT[key] ?? heuristic(key);
}
