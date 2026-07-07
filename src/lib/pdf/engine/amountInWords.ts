/**
 * amountInWords — spell a monetary amount in English or Arabic words for the
 * invoice "amount in words" line (common on GCC tax invoices). Pure functions,
 * no I/O. The English speller is grammatically complete; the Arabic speller is
 * functional (positional ones/tens/hundreds/scales joined with "و") — it conveys
 * the value clearly but is not fully case-inflected.
 */
import type { ScaleSystem } from '../../regimes/types';

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function threeDigitsEn(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(`${ONES[h]} Hundred`);
  if (rest > 0) {
    if (rest < 20) parts.push(ONES[rest]);
    else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      parts.push(o > 0 ? `${TENS[t]} ${ONES[o]}` : TENS[t]);
    }
  }
  return parts.join(' ');
}

/** Spell a whole number in English words (e.g. 1050 → "One Thousand Fifty"). */
export function numberToWordsEn(value: number): string {
  if (!Number.isFinite(value)) return '';
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'Zero';
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const words = threeDigitsEn(groups[i]);
    parts.push(SCALES[i] ? `${words} ${SCALES[i]}` : words);
  }
  return parts.join(' ').trim();
}

/**
 * Spell a monetary amount in English: `<currency> <whole words> [and NN/<factor>] only`.
 * Minor units render cheque-style over the currency's minor-unit factor (10^decimals)
 * when non-zero — so OMR (3 decimals → baisa) renders `/1000` and JPY (0 decimals)
 * has no fractional part (D13). `decimals` defaults to 2 so existing callers are
 * unchanged; pass the currency's decimal_places for currency-correct minor units.
 */
export function amountInWordsEn(
  amount: number,
  currency = '',
  decimals = 2,
  scale: 'western' | 'indian' = 'western',
): string {
  const whole = Math.floor(Math.abs(amount));
  const factor = 10 ** decimals;
  const minor = Math.round((Math.abs(amount) - whole) * factor);
  // `?? ''` aligns the indian path with the western one (numberToWordsEn returns ''
  // for non-finite) and the S4 sibling formatAmountWordsForScale's null-guard, so a
  // non-finite amount degrades to no words rather than the literal "null" on a doc.
  // No-op for every valid finite amount (numberToWordsEnIndian returns a string then).
  const words = scale === 'indian' ? (numberToWordsEnIndian(whole) ?? '') : numberToWordsEn(whole);
  const minorPart = decimals > 0 && minor > 0
    ? ` and ${String(minor).padStart(decimals, '0')}/${factor}` : '';
  return `${currency ? `${currency} ` : ''}${words}${minorPart} only`;
}

const AR_ONES = [
  'صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر',
  'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];
const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const AR_HUNDREDS = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
const AR_SCALES = ['', 'ألف', 'مليون', 'مليار'];

function threeDigitsAr(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(AR_HUNDREDS[h]);
  if (rest > 0) {
    if (rest < 20) parts.push(AR_ONES[rest]);
    else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      parts.push(o > 0 ? `${AR_ONES[o]} و${AR_TENS[t]}` : AR_TENS[t]);
    }
  }
  return parts.join(' و');
}

function numberToWordsAr(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'صفر';
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const words = threeDigitsAr(groups[i]);
    parts.push(AR_SCALES[i] ? `${words} ${AR_SCALES[i]}` : words);
  }
  return parts.join(' و');
}

/**
 * Spell a monetary amount in Arabic words: `<words> [و<minor words>] <currency> فقط`.
 * `decimals` defaults to 2 (back-compat); the minor unit is spelled (no longer dropped)
 * over the currency's 10^decimals factor when non-zero, so OMR/baisa and JPY are both
 * correct (D13). */
export function amountInWordsAr(amount: number, currency = '', decimals = 2): string {
  const whole = Math.floor(Math.abs(amount));
  const factor = 10 ** decimals;
  const minor = Math.round((Math.abs(amount) - whole) * factor);
  const words = numberToWordsAr(whole);
  const minorPart = decimals > 0 && minor > 0 ? ` و${numberToWordsAr(minor)}` : '';
  return `${words}${minorPart}${currency ? ` ${currency}` : ''} فقط`;
}

/**
 * Indian numbering scale: crore (10^7), lakh (10^5), thousand, hundreds. Same word
 * tables and joining style as numberToWordsEn (threeDigitsEn). Implements the WP-S4
 * Task S4.5 hook in place (same module, same `string | null` signature, no second
 * export): returns the spelled string for valid finite non-negative input and null
 * only for the guard cases S4's stub documented (non-finite / negative), so the
 * render path OMITS the words line rather than mis-spelling an Indian statutory doc.
 */
export function numberToWordsEnIndian(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  let n = Math.floor(value);
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  if (crore > 0) parts.push(`${numberToWordsEnIndian(crore)} Crore`);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  if (lakh > 0) parts.push(`${threeDigitsEn(lakh)} Lakh`);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  if (thousand > 0) parts.push(`${threeDigitsEn(thousand)} Thousand`);
  n %= 1000;
  if (n > 0) parts.push(threeDigitsEn(n));
  return parts.join(' ').trim();
}

/** Scale-keyed amount-in-words dispatch. 'western' → the existing speller;
 *  'indian' → the L1 hook (null until implemented). Keyed on format.amount_words_scale. */
export function formatAmountWordsForScale(
  amount: number, currency: string, decimals: number, scale: ScaleSystem,
): string | null {
  if (scale === 'indian') {
    const whole = Math.floor(Math.abs(amount));
    const words = numberToWordsEnIndian(whole);
    if (words === null) return null;
    const factor = 10 ** decimals;
    const minor = Math.round((Math.abs(amount) - whole) * factor);
    const minorPart = decimals > 0 && minor > 0 ? ` and ${String(minor).padStart(decimals, '0')}/${factor}` : '';
    return `${currency ? `${currency} ` : ''}${words}${minorPart} only`;
  }
  return amountInWordsEn(amount, currency, decimals);
}
