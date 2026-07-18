/**
 * Turn an uploaded image into a thermal-ready label icon: downscaled and
 * thresholded to 1-bit (opaque black on transparent), returned as a compact PNG
 * data URL. Direct-thermal heads are 1-bit, so a colour/gradient logo prints as
 * a grey smudge — thresholding at upload guarantees a crisp mark and the tenant
 * approves the actual result in the live preview.
 */

export const MAX_ICON_PX = 96;
export const ICON_THRESHOLD = 0.5;
export const MAX_ICON_DATAURL_BYTES = 65536;

/** Threshold RGBA IN PLACE: dark pixels → opaque black, everything else → transparent. */
export function thresholdIconPixels(data: Uint8ClampedArray, threshold = ICON_THRESHOLD): void {
  const cut = threshold * 255;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const dark = a > 10 && lum < cut;
    data[i] = data[i + 1] = data[i + 2] = 0;
    data[i + 3] = dark ? 255 : 0;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the image'));
    img.src = src;
  });
}

/** Read → downscale ≤MAX_ICON_PX → threshold to 1-bit → PNG data URL. Throws on
 *  an unreadable image or an oversized result. */
export async function fileToLabelIconDataUrl(file: File): Promise<string> {
  const img = await loadImage(await readFileAsDataUrl(file));
  const scale = Math.min(1, MAX_ICON_PX / Math.max(img.width, img.height, 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser');
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  thresholdIconPixels(imageData.data);
  ctx.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  if (dataUrl.length > MAX_ICON_DATAURL_BYTES) {
    throw new Error('That image is too detailed for a label icon — use a simpler mark.');
  }
  return dataUrl;
}
