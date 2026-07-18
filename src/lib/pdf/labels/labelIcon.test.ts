// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { thresholdIconPixels } from './labelIcon';

/** Build an RGBA buffer from [r,g,b,a] tuples. */
function rgba(...px: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(px.flat());
}

describe('thresholdIconPixels', () => {
  it('turns dark opaque pixels into opaque black', () => {
    const data = rgba([10, 10, 10, 255]);
    thresholdIconPixels(data);
    expect([...data]).toEqual([0, 0, 0, 255]);
  });

  it('turns light pixels transparent', () => {
    const data = rgba([240, 240, 240, 255]);
    thresholdIconPixels(data);
    expect(data[3]).toBe(0);
  });

  it('keeps fully transparent source pixels transparent', () => {
    const data = rgba([0, 0, 0, 0]);
    thresholdIconPixels(data);
    expect(data[3]).toBe(0);
  });

  it('respects a custom threshold', () => {
    const midGrey = rgba([120, 120, 120, 255]);
    thresholdIconPixels(midGrey, 0.3); // 0.3*255=76.5; 120 > cut → transparent
    expect(midGrey[3]).toBe(0);
    const midGrey2 = rgba([120, 120, 120, 255]);
    thresholdIconPixels(midGrey2, 0.6); // 0.6*255=153; 120 < cut → black
    expect(midGrey2[3]).toBe(255);
  });
});
