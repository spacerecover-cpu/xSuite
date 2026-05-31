import { describe, it, expect } from 'vitest';
import i18n from './i18n';

describe('ui i18n keys', () => {
  it('resolves the new ui.* keys in English', () => {
    expect(i18n.t('ui.noData')).toBe('No data available');
    expect(i18n.t('ui.processing')).toBe('Processing...');
    expect(i18n.t('ui.close')).toBe('Close');
    expect(i18n.t('ui.noOptions')).toBe('No options available');
  });

  it('resolves the Arabic translations', async () => {
    await i18n.changeLanguage('ar');
    expect(i18n.t('ui.noData')).toBe('لا توجد بيانات');
    await i18n.changeLanguage('en');
  });

  it('interpolates selectedCount', () => {
    expect(i18n.t('ui.selectedCount', { selected: 2, total: 5 })).toBe('2 of 5 selected');
  });
});

describe('phase 1 overlay ui keys', () => {
  it('resolves new overlay keys in English', () => {
    expect(i18n.t('ui.dialog')).toBe('Dialog');
    expect(i18n.t('ui.cropImage')).toBe('Crop Image');
    expect(i18n.t('ui.applyCrop')).toBe('Apply Crop');
    expect(i18n.t('ui.photoViewerClose')).toBe('Close photo viewer');
  });
});
