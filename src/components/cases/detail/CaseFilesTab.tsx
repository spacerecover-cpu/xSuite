import React, { useRef, useState } from 'react';
import { FileText, Upload, Download, Trash2, FileStack, FileImage, FileArchive, File } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';
import { formatDate } from '@/lib/format';

interface CaseAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_size?: number | null;
  file_type?: string | null;
  category?: string | null;
  created_at?: string | null;
}

interface CaseFilesTabProps {
  caseId: string;
  attachments: CaseAttachment[];
  uploadedBy: string;
}

const BUCKET = 'case-attachments';

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType === 'application/pdf') return FileText;
  if (mimeType.includes('zip') || mimeType.includes('archive')) return FileArchive;
  return FileStack;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CaseFilesTab: React.FC<CaseFilesTabProps> = ({ caseId, attachments, uploadedBy }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    let uploaded = 0;

    for (const file of Array.from(files)) {
      if (file.size > 26214400) {
        toast.error(`${file.name} exceeds the 25MB size limit`);
        continue;
      }

      setUploadProgress(`Uploading ${file.name}...`);

      try {
        const timestamp = Date.now();
        const filePath = `${caseId}/${timestamp}_${file.name}`;

        const { error: storageError } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, file, { upsert: false });

        if (storageError) throw storageError;

        const { error: dbError } = await supabase.from('case_attachments').insert({
          case_id: caseId,
          file_name: file.name,
          file_url: filePath,
          file_size: file.size,
          file_type: file.type || null,
          category: 'other',
          uploaded_by: uploadedBy || null,
          // tenant_id is populated by the set_tenant_and_audit_fields trigger.
          tenant_id: undefined as unknown as string,
        });

        if (dbError) {
          await supabase.storage.from(BUCKET).remove([filePath]);
          throw dbError;
        }

        uploaded++;
      } catch (err: unknown) {
        toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    setUploading(false);
    setUploadProgress(null);

    if (uploaded > 0) {
      toast.success(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded successfully`);
      queryClient.invalidateQueries({ queryKey: ['case_attachments', caseId] });
    }
  };

  const handleDownload = async (attachment: { id: string; file_url: string; file_name: string }) => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(attachment.file_url, 3600);

      if (error) throw error;

      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = attachment.file_name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: unknown) {
      toast.error(`Failed to download file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async (attachment: { id: string; file_url: string; file_name: string }) => {
    if (!window.confirm(`Delete "${attachment.file_name}"? This cannot be undone.`)) return;

    setDeletingId(attachment.id);
    try {
      await supabase.storage.from(BUCKET).remove([attachment.file_url]);

      const { error } = await supabase
        .from('case_attachments')
        .delete()
        .eq('id', attachment.id);

      if (error) throw error;

      toast.success('File deleted');
      queryClient.invalidateQueries({ queryKey: ['case_attachments', caseId] });
    } catch (err: unknown) {
      toast.error(`Failed to delete file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">Files & Attachments</h2>
          <Button
            style={{ backgroundColor: 'rgb(var(--color-primary))' }}
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Uploading...' : 'Upload File'}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
          onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
        />

        {uploading && uploadProgress && (
          <div className="mb-4 flex items-center gap-2 text-sm text-primary bg-info-muted border border-info/30 rounded-lg p-3">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
            {uploadProgress}
          </div>
        )}

        {attachments.length === 0 && !uploading ? (
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
              isDragOver ? 'border-primary/60 bg-primary/10' : 'border-slate-300 bg-slate-50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <FileStack className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-600 font-medium mb-1">No files attached yet</p>
            <p className="text-sm text-slate-500 mb-4">Drag & drop files here, or click Upload File</p>
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Browse Files
            </Button>
            <p className="text-xs text-slate-400 mt-3">Max 25MB per file</p>
          </div>
        ) : (
          <>
            <div
              className={`mb-4 border-2 border-dashed rounded-lg p-4 text-center text-sm text-slate-500 transition-colors ${
                isDragOver ? 'border-primary/60 bg-primary/10 text-primary' : 'border-slate-200'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="w-4 h-4 inline mr-1" />
              Drop files here to upload
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {attachments.map((file) => {
                const FileIcon = getFileIcon(file.file_type ?? null);
                return (
                  <div
                    key={file.id}
                    className="border border-slate-200 rounded-lg p-3 hover:border-primary/40 transition-colors bg-white"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                        <FileIcon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate" title={file.file_name}>
                          {file.file_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {file.category ?? '—'} • {formatFileSize(file.file_size ?? null)}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{file.created_at ? formatDate(file.created_at) : '—'}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDownload(file)}
                          title="Download"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDelete(file)}
                          disabled={deletingId === file.id}
                          title="Delete"
                        >
                          {deletingId === file.id ? (
                            <div className="w-3 h-3 border border-danger border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3 text-danger" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Card>
  );
};
