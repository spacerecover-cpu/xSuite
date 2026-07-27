import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * public/boot-guard.js is a CLASSIC script — it must run before the module
 * entry graph, so it cannot be bundled or imported. It is evaluated here as
 * source against jsdom, which is the only way to cover it: the logic it guards
 * (a forced reload) is exactly the logic that must never loop.
 */
const SOURCE = readFileSync(resolve(__dirname, '../../public/boot-guard.js'), 'utf8');

interface GuardWindow extends Window { __xsuiteBooted?: boolean }

function loadGuard() { new Function(SOURCE)(); }

function failAsset(tag: 'script' | 'link' = 'script') {
  const el = document.createElement(tag);
  el.setAttribute(tag === 'script' ? 'src' : 'href', '/assets/Button-CKWNNqtx.js');
  if (tag === 'link') el.setAttribute('rel', 'modulepreload');
  document.head.appendChild(el);
  // Resource errors do not bubble; they are only observable via a capture-phase
  // listener on window. Dispatching on the element reproduces that exactly.
  el.dispatchEvent(new Event('error'));
}

let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reload = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload, href: 'https://xsuite.space/settings' },
  });
  sessionStorage.clear();
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="root"></div>';
  delete (window as GuardWindow).__xsuiteBooted;
});

afterEach(() => { vi.useRealTimers(); });

describe('boot guard — entry-graph asset failure', () => {
  it('reloads once when an entry script fails before the app boots', () => {
    loadGuard();
    failAsset();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('also recovers a failed modulepreload link', () => {
    loadGuard();
    failAsset('link');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stays out of the way once the app has booted', () => {
    loadGuard();
    (window as GuardWindow).__xsuiteBooted = true;
    failAsset();
    expect(reload).not.toHaveBeenCalled();
  });

  // The whole risk of this file is a reload loop against a genuinely broken
  // deploy. One reload per session window, then a static message — never a loop.
  it('never reloads twice inside the throttle window', () => {
    loadGuard();
    failAsset();
    expect(reload).toHaveBeenCalledTimes(1);

    document.head.innerHTML = '';
    loadGuard();
    failAsset();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows a recovery message instead of looping on the second failure', () => {
    loadGuard();
    failAsset();
    document.head.innerHTML = '';
    loadGuard();
    failAsset();
    expect(document.body.textContent).toMatch(/couldn.t finish loading|reload/i);
  });

  it('reloads again once the throttle window has elapsed', () => {
    loadGuard();
    failAsset();
    expect(reload).toHaveBeenCalledTimes(1);

    sessionStorage.setItem('xsuite_boot_reload_at', String(Date.now() - 120000));
    document.head.innerHTML = '';
    loadGuard();
    failAsset();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  // Backstop: an error that fires before the guard's listener is registered
  // would otherwise be missed entirely. `load` only fires once every deferred
  // module script has run, so reaching it without __xsuiteBooted means the
  // entry graph definitively failed — no error event required.
  it('recovers at load time when the entry graph never booted', () => {
    loadGuard();
    window.dispatchEvent(new Event('load'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing at load time when the app booted normally', () => {
    loadGuard();
    (window as GuardWindow).__xsuiteBooted = true;
    window.dispatchEvent(new Event('load'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not double-reload when both the error and load paths fire', () => {
    loadGuard();
    failAsset();
    window.dispatchEvent(new Event('load'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores errors that are not asset loads', () => {
    loadGuard();
    const div = document.createElement('div');
    document.body.appendChild(div);
    div.dispatchEvent(new Event('error'));
    window.dispatchEvent(new Event('error'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('ignores a stylesheet failure — CSS never blocks the module entry graph', () => {
    loadGuard();
    const el = document.createElement('link');
    el.setAttribute('rel', 'stylesheet');
    el.setAttribute('href', 'https://fonts.googleapis.com/css2?family=Inter');
    document.head.appendChild(el);
    el.dispatchEvent(new Event('error'));
    expect(reload).not.toHaveBeenCalled();
  });
});
