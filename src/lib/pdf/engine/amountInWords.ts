/**
 * amountInWords — spell a monetary amount in English or Arabic words for the
 * invoice "amount in words" line (common on GCC tax invoices). Pure functions,
 * no I/O. The English speller is grammatically complete; the Arabic speller is
 * functional (positional ones/tens/hundreds/scales joined with "و") — it conveys
 * the value clearly but is not fully case-inflected.
 */

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
 * Spell a monetary amount in English: `<currency> <whole words> [and NN/100] only`.
 * Cents render as `NN/100` (cheque style) when non-zero.
 */
export function amountInWordsEn(amount: number, currency = ''): string {
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const words = numberToWordsEn(whole);
  const centPart = cents > 0 ? ` and ${String(cents).padStart(2, '0')}/100` : '';
  return `${currency ? `${currency} ` : ''}${words}${centPart} only`;
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

/** Spell a monetary amount in Arabic words: `<words> <currency> فقط`. */
export function amountInWordsAr(amount: number, currency = ''): string {
  const words = numberToWordsAr(Math.floor(Math.abs(amount)));
  return `${words}${currency ? ` ${currency}` : ''} فقط`;
}
