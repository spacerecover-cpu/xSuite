/**
 * Browser Typst renderer: compile a Typst markup string to a PDF Blob via the
 * `typst.ts` WASM compiler. Lazy — the ~10 MB WASM and the fonts are fetched only
 * on first call (i.e. only when the Typst engine flag is on), so the default app
 * pays nothing. Mirrors the contract of `createPdfWithFonts(...).getBlob()`: the
 * caller gets a `Blob` it can object-URL into an iframe, hash, upload, or email —
 * the whole provability/delivery stack is unchanged.
 */
import { $typst, preloadRemoteFonts, loadFonts } from '@myriaddreamin/typst.ts';
import type { TypstAsset } from './assets';

/**
 * The Typst compiler WASM is ~27 MiB — over Cloudflare Pages' 25 MiB per-file
 * asset limit — so it is NOT bundled into `dist/` (that would fail the deploy).
 * Instead it is fetched at runtime from jsDelivr, pinned to the EXACT installed
 * package version so the compiler always matches `@myriaddreamin/typst.ts`. This
 * is preview-only egress: the compiler never touches a delivered PDF (those use
 * pdfmake), so it does not affect document provability. Keep this version in sync
 * with `@myriaddreamin/typst-ts-web-compiler` in package.json.
 */
const COMPILER_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm';

/**
 * The brand + script fonts served from `public/fonts` (at `/fonts/*`). Tajawal +
 * Noto Sans Arabic cover Arabic; Noto Sans Thai covers Thai; Roboto covers
 * Latin/Cyrillic. Noto Sans KR (Korean) is added in a later phase (large asset).
 */
const FONT_URLS = [
  '/fonts/Tajawal-Regular.ttf',
  '/fonts/Tajawal-Bold.ttf',
  '/fonts/notosansarabic-regular.ttf',
  '/fonts/notosansarabic-bold.ttf',
  '/fonts/NotoSansThai.ttf',
  '/fonts/Roboto-Regular.ttf',
  '/fonts/Roboto-Bold.ttf',
];

let initialized = false;

/** Configure the compiler (WASM module + preloaded fonts) once, before first use. */
function ensureInit(): void {
  if (initialized) return;
  $typst.setCompilerInitOptions({
    getModule: () => COMPILER_WASM_URL,
    beforeBuild: [
      // Disable typst.ts's default font fetch from the jsdelivr CDN — a forensic
      // app must not depend on external egress (and the CSP blocks it). We supply
      // only the local brand/script fonts below.
      loadFonts([], { assets: false }),
      preloadRemoteFonts(FONT_URLS),
    ],
  });
  initialized = true;
}

/**
 * Compile Typst markup to a PDF Blob (lazy WASM init on first call). `assets`
 * (e.g. the logo) are mapped into the compiler's virtual filesystem so the markup
 * can reference them by path via `#image("<path>")`.
 */
export async function renderTypstPdf(markup: string, assets: TypstAsset[] = []): Promise<Blob> {
  ensureInit();
  for (const a of assets) await $typst.mapShadow(a.path, a.bytes);
  const bytes = await $typst.pdf({ mainContent: markup });
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
