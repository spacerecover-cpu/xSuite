import { useState, useRef, useCallback } from 'react';
import { cva } from 'class-variance-authority';
import { useTranslation } from 'react-i18next';
import { Upload, X, Image as ImageIcon, Check, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { ImageCropModal } from './ImageCropModal';
import { cn } from '../../lib/utils';
import { useFieldA11y } from '../../hooks/useFieldA11y';
import { logger } from '../../lib/logger';

type Density = 'default' | 'compact';

const previewImageVariants = cva('w-full object-contain p-4', {
  variants: { density: { default: 'h-48', compact: 'h-32' } },
  defaultVariants: { density: 'default' },
});

const dropzoneVariants = cva('relative border-2 border-dashed rounded-xl transition-all', {
  variants: { density: { default: 'p-8', compact: 'p-4' } },
  defaultVariants: { density: 'default' },
});

const dropzoneInnerVariants = cva('text-center', {
  variants: { density: { default: 'space-y-3', compact: 'space-y-2' } },
  defaultVariants: { density: 'default' },
});

const dropzoneIconWrapVariants = cva('rounded-full bg-slate-200 flex items-center justify-center', {
  variants: { density: { default: 'w-14 h-14', compact: 'w-10 h-10' } },
  defaultVariants: { density: 'default' },
});

const dropzoneIconVariants = cva('text-slate-600', {
  variants: { density: { default: 'w-7 h-7', compact: 'w-5 h-5' } },
  defaultVariants: { density: 'default' },
});

const dropzonePromptVariants = cva('font-medium text-slate-900 mb-1', {
  variants: { density: { default: 'text-sm', compact: 'text-xs' } },
  defaultVariants: { density: 'default' },
});

interface ImageUploadProps {
  value?: string;
  onChange: (file: File | null, previewUrl: string | null) => void;
  /**
   * Accepted but currently unused — upload is performed by the parent via
   * fileStorageService. Kept in the signature so the 8 call sites that pass it
   * keep compiling; wiring the internal upload is deferred (see spec §8/§4.10).
   */
  onUploadComplete?: (url: string, filePath: string) => void;
  maxSizeMB?: number;
  acceptedTypes?: string[];
  label?: string;
  description?: string;
  aspectRatio?: string;
  recommendedDimensions?: string;
  /**
   * Accepted but currently unused — the parent picks the storage bucket when it
   * calls fileStorageService.uploadFile with the raw File from onChange. Kept in
   * the signature so the 8 call sites that pass it keep compiling; internal
   * upload routing is deferred (see spec §8/§4.10).
   */
  bucketName?: 'company-assets' | 'company-qrcodes';
  className?: string;
  /** Layout density. When undefined, falls back to a `compact-upload` className sniff. */
  density?: Density;
  /** When true, renders a Spinner in place of the idle dropzone icon. */
  loading?: boolean;
  enableCrop?: boolean;
  cropAspectRatio?: number;
  cropShape?: 'rect' | 'round';
  id?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  onUploadComplete: _onUploadComplete,
  maxSizeMB = 5,
  acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'],
  label,
  description,
  aspectRatio,
  recommendedDimensions,
  bucketName: _bucketName = 'company-assets',
  className = '',
  density,
  loading = false,
  enableCrop = false,
  cropAspectRatio = 1,
  cropShape = 'round',
  id,
}) => {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(value || null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [fileMetadata, setFileMetadata] = useState<{
    name: string;
    size: number;
    dimensions?: { width: number; height: number };
  } | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { fieldId, labelProps, controlProps, errorProps } = useFieldA11y({
    id,
    hasError: !!error,
  });

  // Density: explicit prop wins; otherwise fall back to the legacy raw-className
  // sniff so the only `compact-upload` consumer (CustomerProfilePage) is unchanged.
  const resolvedDensity: Density = density ?? (className.includes('compact-upload') ? 'compact' : 'default');

  const validateFile = useCallback(
    (file: File): { valid: boolean; error?: string } => {
      if (!acceptedTypes.includes(file.type)) {
        return { valid: false, error: t('ui.imageUpload.errInvalidType') };
      }

      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        return { valid: false, error: t('ui.imageUpload.errTooLarge') };
      }

      return { valid: true };
    },
    [acceptedTypes, maxSizeMB, t]
  );

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: img.width, height: img.height });
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };

      img.src = objectUrl;
    });
  };

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploadSuccess(false);

      const validation = validateFile(file);
      if (!validation.valid) {
        setError(validation.error || t('ui.imageUpload.errInvalid'));
        return;
      }

      try {
        const url = URL.createObjectURL(file);
        setOriginalFileName(file.name);

        if (enableCrop) {
          setTempImageUrl(url);
          setIsCropModalOpen(true);
        } else {
          const dimensions = await getImageDimensions(file);
          setPreviewUrl(url);
          setFileMetadata({
            name: file.name,
            size: file.size,
            dimensions,
          });
          onChange(file, url);
        }
      } catch (err) {
        setError(t('ui.imageUpload.errProcessing'));
        logger.error('Image processing error:', err);
      }
    },
    [validateFile, onChange, enableCrop, t]
  );

  const handleCropComplete = useCallback(
    async (croppedBlob: Blob, croppedUrl: string) => {
      try {
        const croppedFile = new File([croppedBlob], originalFileName, {
          type: 'image/jpeg',
        });

        const dimensions = await getImageDimensions(croppedFile);
        setPreviewUrl(croppedUrl);
        setFileMetadata({
          name: croppedFile.name,
          size: croppedFile.size,
          dimensions,
        });

        onChange(croppedFile, croppedUrl);

        if (tempImageUrl) {
          URL.revokeObjectURL(tempImageUrl);
          setTempImageUrl(null);
        }
      } catch (err) {
        setError(t('ui.imageUpload.errProcessingCropped'));
        logger.error('Crop processing error:', err);
      }
    },
    [onChange, originalFileName, tempImageUrl, t]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDropzoneKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleRemove = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setPreviewUrl(null);
    setFileMetadata(null);
    setError(null);
    setUploadSuccess(false);
    onChange(null, null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <>
      <div className={cn('space-y-3', className)}>
        {label && (
          <div>
            <label {...labelProps} className="block text-sm font-semibold text-slate-700 mb-1">
              {label}
            </label>
            {description && <p className="text-xs text-slate-500">{description}</p>}
          </div>
        )}

      {previewUrl ? (
        <div className="space-y-3">
          <div className="relative group rounded-xl border-2 border-slate-200 overflow-hidden bg-slate-50">
            <img
              src={previewUrl}
              alt={t('ui.imageUpload.previewAlt')}
              className={previewImageVariants({ density: resolvedDensity })}
              style={aspectRatio ? { aspectRatio } : undefined}
            />
            <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemove(e);
                }}
                className="bg-danger hover:bg-danger/90 text-danger-foreground"
                size="sm"
              >
                <X className="w-4 h-4 mr-2" aria-hidden="true" />
                {t('ui.remove')}
              </Button>
            </div>
            {uploadSuccess && (
              <div className="absolute top-3 right-3 bg-success text-success-foreground rounded-full p-2 shadow-lg">
                <Check className="w-4 h-4" aria-hidden="true" />
              </div>
            )}
          </div>

          {fileMetadata && (
            <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">{t('ui.imageUpload.fileLabel')}:</span>
                <span className="text-slate-900 truncate ml-2 max-w-[200px]">
                  {fileMetadata.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">{t('ui.imageUpload.sizeLabel')}:</span>
                <span className="text-slate-900">{formatFileSize(fileMetadata.size)}</span>
              </div>
              {fileMetadata.dimensions && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">{t('ui.imageUpload.dimensionsLabel')}:</span>
                  <span className="text-slate-900">
                    {fileMetadata.dimensions.width} × {fileMetadata.dimensions.height}px
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={t('ui.imageUpload.dropzoneLabel')}
          className={cn(
            dropzoneVariants({ density: resolvedDensity }),
            'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'
          )}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={handleDropzoneKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            {...controlProps}
            ref={fileInputRef}
            id={fieldId}
            type="file"
            accept={acceptedTypes.join(',')}
            onChange={handleFileInput}
            className="hidden"
          />

          <div className={dropzoneInnerVariants({ density: resolvedDensity })}>
            <div className="flex justify-center">
              <div className={dropzoneIconWrapVariants({ density: resolvedDensity })}>
                {loading ? (
                  <Spinner size={resolvedDensity === 'compact' ? 'sm' : 'md'} className="text-slate-600" />
                ) : (
                  <ImageIcon className={dropzoneIconVariants({ density: resolvedDensity })} aria-hidden="true" />
                )}
              </div>
            </div>

            <div>
              <p className={dropzonePromptVariants({ density: resolvedDensity })}>
                {t('ui.imageUpload.dragDropPrompt')}
              </p>
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                size="sm"
              >
                <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
                {t('ui.imageUpload.browse')}
              </Button>
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <p>{t('ui.imageUpload.accepted', { types: acceptedTypes.map(ty => ty.split('/')[1].toUpperCase()).join(', ') })}</p>
              <p>{t('ui.imageUpload.maxSize', { size: maxSizeMB })}</p>
              {recommendedDimensions && <p>{recommendedDimensions}</p>}
            </div>
          </div>
        </div>
      )}

        {error && (
          <div
            {...errorProps}
            aria-live="polite"
            className="flex items-start gap-2 p-3 bg-danger-muted border border-danger/30 rounded-lg"
          >
            <AlertCircle className="w-4 h-4 text-danger mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
      </div>

      {tempImageUrl && (
        <ImageCropModal
          isOpen={isCropModalOpen}
          onClose={() => {
            setIsCropModalOpen(false);
            if (tempImageUrl) {
              URL.revokeObjectURL(tempImageUrl);
              setTempImageUrl(null);
            }
          }}
          imageUrl={tempImageUrl}
          onCropComplete={handleCropComplete}
          aspectRatio={cropAspectRatio}
          cropShape={cropShape}
        />
      )}
    </>
  );
};
