/*
 * Stale-deploy recovery for the ENTRY module graph.
 *
 * src/lib/lazyWithRetry.ts already recovers a stale chunk that fails during a
 * lazy route/component import: it reloads once, throttled, and ErrorBoundary
 * shows a recovery screen after that. But every one of those mechanisms lives
 * INSIDE the module graph. When the failing chunk is part of the entry graph
 * itself — an <script type="module"> dependency or one of Vite's
 * <link rel="modulepreload"> deps — main.tsx never executes, so:
 *
 *   - the window error/unhandledrejection handlers are never installed
 *   - React never mounts, so ErrorBoundary does not exist
 *   - lazyWithRetry is never reached
 *
 * The result is a blank page and a console message, with no recovery path.
 * Observed in production as:
 *   "Failed to load module script: Expected a JavaScript-or-Wasm module script
 *    but the server responded with a MIME type of text/html"
 * — a tab holding an index.html from an older deploy requests a content hash
 * the server has purged, and Cloudflare Pages answers with the SPA fallback.
 *
 * This file is the only code that can catch that, so it is a classic script
 * (not a module), loaded before the entry. It must stay dependency-free and
 * tiny. CSP forbids inline scripts (see index.html), so it ships as its own
 * file under script-src 'self'.
 *
 * Reloading is safe to do blind because public/_headers marks index.html
 * no-cache: the reload revalidates and picks up the current chunk hashes.
 *
 * Covered by src/lib/bootGuard.test.tsx — the reload-loop guards especially.
 */
(function () {
  var RELOAD_KEY = 'xsuite_boot_reload_at';
  var THROTTLE_MS = 20000; // matches lazyWithRetry's window
  var handled = false;

  function alreadyBooted() {
    return window.__xsuiteBooted === true;
  }

  // Only entry-graph JS can strand the boot. A stylesheet (e.g. the Google
  // Fonts link) failing is cosmetic and must not trigger a reload.
  function isEntryScript(target) {
    if (!target || !target.tagName) return false;
    var tag = String(target.tagName).toLowerCase();
    if (tag === 'script') return true;
    if (tag === 'link') {
      var rel = String(target.getAttribute('rel') || '').toLowerCase();
      return rel === 'modulepreload' || rel === 'preload';
    }
    return false;
  }

  function showFallback() {
    var root = document.getElementById('root');
    if (!root || root.getAttribute('data-boot-guard') === 'shown') return;
    root.setAttribute('data-boot-guard', 'shown');
    root.textContent = '';

    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'font:15px/1.5 system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1.5rem;text-align:center;color:#0f172a';

    var h = document.createElement('p');
    h.style.cssText = 'font-weight:600;margin:0 0 .5rem';
    h.textContent = "This page couldn't finish loading.";

    var p = document.createElement('p');
    p.style.cssText = 'margin:0 0 1.25rem;color:#475569';
    p.textContent =
      'A new version was deployed while this tab was open, and some files are no longer available. Reloading usually fixes it.';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Reload';
    btn.style.cssText =
      'font:inherit;font-weight:500;padding:.5rem 1.25rem;border:0;border-radius:.5rem;background:#162660;color:#fff;cursor:pointer';
    btn.addEventListener('click', function () {
      try { sessionStorage.removeItem(RELOAD_KEY); } catch (e) { /* private mode */ }
      window.location.reload();
    });

    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(btn);
    root.appendChild(box);
  }

  function recover() {
    if (handled || alreadyBooted()) return;

    var last = 0;
    try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch (e) { /* private mode */ }
    var now = Date.now();

    // Second failure inside the window means the reload did not help — a
    // genuinely broken deploy. Stop and hand the user an explicit action
    // rather than spinning.
    if (last && now - last < THROTTLE_MS) {
      handled = true;
      showFallback();
      return;
    }

    handled = true;
    try { sessionStorage.setItem(RELOAD_KEY, String(now)); } catch (e) { /* private mode */ }
    window.location.reload();
  }

  // Resource load errors do not bubble — capture phase on window is the only
  // way to observe them.
  window.addEventListener(
    'error',
    function (event) {
      if (isEntryScript(event.target)) recover();
    },
    true
  );

  // Backstop. The listener above can still miss an error that fired before this
  // script was parsed (Vite injects its modulepreload links into <head>, so
  // their fetches can start first). `load` fires only after every deferred
  // module script has run, so arriving here without __xsuiteBooted means the
  // entry graph definitively failed — whether or not we saw the error event.
  window.addEventListener('load', function () {
    if (!alreadyBooted()) recover();
  });
})();
