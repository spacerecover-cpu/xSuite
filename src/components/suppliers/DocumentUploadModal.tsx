import React, { useState, useEffect } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { supabase, resolveTenantId } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  supplierId: string;
}

export default function DocumentUploadModal({ isOpen, onClose, onSuccess, supplierId }: DocumentUploadModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    document_type: 'contract',
    description: '',
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setFormData({
        document_type: 'contract',
        description: '',
      });
    }
  }, [isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const filePath = `${supplierId}/${Date.now()}_${selectedFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from('supplier-documents')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const tenantId = await resolveTenantId();

      // Map UI fields to actual DB columns (name, file_url, file_type, file_size, uploaded_by)
      const { error: dbError } = await supabase
        .from('supplier_documents')
        .insert({
          tenant_id: tenantId,
          supplier_id: supplierId,
          name: selectedFile.name,
          file_url: filePath,
          file_type: selectedFile.type || null,
          file_size: selectedFile.size,
          uploaded_by: user.id,
        });

      if (dbError) throw dbError;

      toast.success('Document uploaded successfully');
      onSuccess();
      onClose();
    } catch (error: unknown) {
      logger.error('Error uploading document:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload document');
    } finally {
      setLoading(false);
    }
  };

  const documentTypes = [
    { value: 'contract', label: 'Contract' },
    { value: 'invoice', label: 'Invoice' },
    { value: 'quote', label: 'Quote' },
    { value: 'certification', label: 'Certification' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'compliance', label: 'Compliance Document' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload Document">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="supplier-doc-type" className="block text-sm font-medium text-slate-700 mb-1">
            Document Type *
          </label>
          <select
            id="supplier-doc-type"
            value={formData.document_type}
            onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            required
          >
            {documentTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Description
          </label>
          <Input
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of the document"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Select File * (Max 10MB)
          </label>

          {!selectedFile ? (
            <label className="flex flex-col items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 hover:border-slate-400">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-10 h-10 mb-3 text-slate-400" />
                <p className="mb-2 text-sm text-slate-500">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-slate-500">PDF, DOC, DOCX, XLS, XLSX, or images</p>
              </div>
              <input
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              />
            </label>
          ) : (
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium text-slate-900">{selectedFile.name}</p>
                  <p className="text-sm text-slate-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="text-danger hover:text-danger/80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !selectedFile}>
            {loading ? 'Uploading...' : 'Upload Document'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
