import { describe, it, expect } from 'vitest';
import { assignmentsForDrive, driveNeedsAttention } from './CloneDrivesList';

describe('assignmentsForDrive', () => {
  const assignments = [
    { id: 'a1', resource_clone_drive_id: 'drive-1' },
    { id: 'a2', resource_clone_drive_id: 'drive-2' },
    { id: 'a3', resource_clone_drive_id: null },
    { id: 'a4', resource_clone_drive_id: 'drive-1' },
  ];

  it('returns only the assignments written to the given drive', () => {
    expect(assignmentsForDrive(assignments, 'drive-1').map((a) => a.id)).toEqual(['a1', 'a4']);
  });

  it('returns nothing for a drive with no assignments, ignoring unlinked rows', () => {
    expect(assignmentsForDrive(assignments, 'drive-3')).toEqual([]);
  });
});

describe('driveNeedsAttention', () => {
  it('flags drives whose stored status needs attention', () => {
    expect(driveNeedsAttention({ status: 'maintenance' })).toBe(true);
    expect(driveNeedsAttention({ status: 'damaged' })).toBe(true);
  });

  it('does not flag healthy drives', () => {
    expect(driveNeedsAttention({ status: 'available' })).toBe(false);
    expect(driveNeedsAttention({ status: 'in_use' })).toBe(false);
    expect(driveNeedsAttention({ status: null })).toBe(false);
  });

  it('ignores health/condition fields that resource_clone_drives does not store', () => {
    const poorDrive = { status: 'available', condition_rating: 1, health_percentage: 10 };
    expect(driveNeedsAttention(poorDrive)).toBe(false);
  });
});
