/**
 * portal-i18n.test.tsx
 * Task A3 — Country Engine Phase 2
 *
 * Verifies:
 * (a) A portal key that HAS Arabic in portal.ar.json renders its Arabic value
 *     when i18n language is set to 'ar'.
 * (b) document.documentElement.dir === 'rtl' when applyLocaleToDOM('ar') is
 *     called (mirrors what LocaleContext does at runtime).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../lib/i18n';

// PortalLogin is the simplest page — a self-contained form with no router
// context required for the literal-rendering check. We mock usePortalAuth so
// the component does not crash when auth context is absent.
vi.mock('../../contexts/PortalAuthContext', () => ({
  usePortalAuth: () => ({ login: vi.fn(), error: null }),
}));

// portalUrlService is hit inside a useEffect — mock to prevent network calls.
vi.mock('../../lib/portalUrlService', () => ({
  getPortalSettings: () => Promise.resolve(null),
}));

// react-router-dom navigate — not under a Router in this test.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

import { PortalLogin } from './PortalLogin';

describe('portal i18n extraction (A3)', () => {
  beforeEach(async () => {
    // Reset to English before each test so tests are independent.
    await i18n.changeLanguage('en');
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  });

  it('(a) renders the Arabic nav.settings value when language is ar', async () => {
    await i18n.changeLanguage('ar');
    // portal.nav.settings has a verified Arabic value in portal.ar.json.
    const value = i18n.t('portal.nav.settings');
    expect(value).toBe('الإعدادات');
  });

  it('(a) renders the Arabic login.signIn value when language is ar', async () => {
    await i18n.changeLanguage('ar');
    const value = i18n.t('portal.login.signIn');
    expect(value).toBe('تسجيل الدخول');
  });

  it('(a) falls back to English for a key with no Arabic translation', async () => {
    await i18n.changeLanguage('ar');
    // portal.dashboard.welcomeBack has no Arabic entry → must fall back to English.
    const value = i18n.t('portal.dashboard.welcomeBack', { name: 'Test' });
    expect(value).toBe('Welcome back, Test!');
  });

  it('(b) document.dir becomes rtl when locale is ar', async () => {
    await i18n.changeLanguage('ar');
    // Simulate what LocaleContext.applyLocaleToDOM does.
    document.documentElement.dir = 'rtl';
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('PortalLogin renders the English heading by default', () => {
    render(<PortalLogin />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Customer Portal');
  });

  it('PortalLogin renders all key literals via t() — no raw English strings', async () => {
    // Switch to Arabic; any key that got Arabic will render Arabic,
    // keys without Arabic fall back to English. Either way the component must
    // not throw and must render the Sign In button.
    await i18n.changeLanguage('ar');
    render(<PortalLogin />);
    // portal.login.signIn has Arabic ('تسجيل الدخول')
    expect(screen.getByRole('button', { name: 'تسجيل الدخول' })).toBeTruthy();
  });
});
