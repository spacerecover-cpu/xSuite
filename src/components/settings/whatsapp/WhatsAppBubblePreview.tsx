interface Props { bodyText: string; footerText?: string; sampleValues: Record<string, string>; headerText?: string; }

export function WhatsAppBubblePreview({ bodyText, footerText, headerText, sampleValues }: Props) {
  const render = (t: string) => t.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k: string) => sampleValues[k] ?? `{{${k}}}`);
  return (
    <div className="rounded-xl bg-slate-100 p-4">
      <div className="max-w-xs rounded-lg rounded-tl-none bg-white p-3 shadow-sm">
        {headerText && <div className="mb-1 text-sm font-semibold text-slate-900">{render(headerText)}</div>}
        <div className="whitespace-pre-wrap text-sm text-slate-800">{render(bodyText)}</div>
        {footerText && <div className="mt-2 text-xxs text-slate-400">{footerText}</div>}
        <div className="mt-1 text-right text-xxs text-slate-400">12:30 ✓✓</div>
      </div>
    </div>
  );
}
