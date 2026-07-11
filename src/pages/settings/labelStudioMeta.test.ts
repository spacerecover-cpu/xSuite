import { describe, it, expect } from 'vitest';
import { LABEL_CARDS } from './labelStudioMeta';

describe('labelStudioMeta', () => {
  it('surfaces case, stock AND inventory as thermal label cards', () => {
    expect(LABEL_CARDS.map((c) => c.entity)).toEqual(['case', 'stock', 'inventory']);
    for (const c of LABEL_CARDS) {
      expect(c.label.length, `label for ${c.entity}`).toBeGreaterThan(0);
      expect(c.description.length, `description for ${c.entity}`).toBeGreaterThan(0);
      expect(c.icon, `icon for ${c.entity}`).toBeTruthy();
    }
  });
});
