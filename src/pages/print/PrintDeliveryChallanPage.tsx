import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { generateDeliveryChallan } from '../../lib/pdf/pdfService';
import { Printer, X, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export const PrintDeliveryChallanPage = () => {
  const { caseId, batchId } = useParams<{ caseId: string; batchId: string }>();
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, batch: string) => {
    setIsGenerating(true);
    setError(null);
    const result = await generateDeliveryChallan(id, batch, false);
    if (!result.success) setError(result.error || 'Failed to generate PDF');
    setIsGenerating(false);
  };

  useEffect(() => {
    if (!caseId || !batchId) {
      setError('Invalid delivery challan reference');
      setIsGenerating(false);
      return;
    }
    void run(caseId, batchId);
  }, [caseId, batchId]);

  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        {isGenerating ? (
          <>
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Generating PDF</h2>
            <p className="text-slate-600">Preparing the Rule 55 delivery challan (triplicate)...</p>
          </>
        ) : error ? (
          <>
            <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Generation Failed</h2>
            <p className="text-slate-600 mb-6">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => caseId && batchId && void run(caseId, batchId)}
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
            <Printer className="w-16 h-16 text-success mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">PDF Ready</h2>
            <p className="text-slate-600 mb-6">The delivery challan has been generated and opened.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => caseId && batchId && generateDeliveryChallan(caseId, batchId, true)}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Download
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
    </div>
  );
};

export default PrintDeliveryChallanPage;
