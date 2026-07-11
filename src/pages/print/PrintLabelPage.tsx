import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { printCaseLabels, type LabelPrintOptions } from '../../lib/pdf/labels/labelPrintService';
import { Printer, X, Loader2, AlertCircle, RefreshCw, Tag, SlidersHorizontal } from 'lucide-react';
import { LabelPrintDialog } from '../../components/labels/LabelPrintDialog';

export const PrintLabelPage = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  const runPrint = async (opts: LabelPrintOptions = { output: 'print' }) => {
    if (!caseId) return;
    setIsGenerating(true);
    setError(null);
    const result = await printCaseLabels(caseId, opts);
    if (!result.success) {
      setError(result.error || 'Failed to generate PDF');
    } else {
      setShowOptions(false);
    }
    setIsGenerating(false);
  };

  useEffect(() => {
    if (!caseId) {
      setError('Invalid case ID');
      setIsGenerating(false);
      return;
    }
    void runPrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const handleRetry = () => void runPrint();

  const handleDownload = () => {
    if (caseId) {
      printCaseLabels(caseId, { output: 'download' });
    }
  };

  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      navigate(-1);
    }
  };

  if (!caseId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Invalid Case ID</h2>
          <p className="text-slate-600 mb-6">No case ID was provided.</p>
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        {isGenerating ? (
          <>
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Generating Label</h2>
            <p className="text-slate-600">Please wait while your case label is being generated...</p>
          </>
        ) : error ? (
          <>
            <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Generation Failed</h2>
            <p className="text-slate-600 mb-6">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
              <button
                onClick={handleClose}
                className="flex items-center gap-2 px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <Tag className="w-16 h-16 text-success mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Label Ready</h2>
            <p className="text-slate-600 mb-6">Your case labels were sent to the print dialog — one label per device.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={() => setShowOptions(true)}
                className="flex items-center gap-2 px-6 py-2 border border-slate-200 bg-white text-sm font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Print options
              </button>
              <button
                onClick={handleClose}
                className="flex items-center gap-2 px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
                Close
              </button>
            </div>
          </>
        )}
      </div>

      {/* One-off print overrides (size / copies / QR) — nothing persisted */}
      <LabelPrintDialog
        entity="case"
        isOpen={showOptions}
        busy={isGenerating}
        onClose={() => setShowOptions(false)}
        onPrint={(config) => void runPrint({ output: 'print', config })}
      />
    </div>
  );
};

export default PrintLabelPage;
