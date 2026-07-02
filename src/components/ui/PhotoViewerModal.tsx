import { Trans, useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';

interface PhotoViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  altText?: string;
}

export function PhotoViewerModal({ isOpen, onClose, imageUrl, altText }: PhotoViewerModalProps) {
  const { t } = useTranslation();
  const alt = altText ?? t('ui.photoViewerDefaultAlt');

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      closeOnBackdrop
      closeOnEscape
      label={alt}
      overlayClassName="z-popover"
      backdropClassName="bg-black/90 backdrop-blur-sm"
      className="bg-transparent shadow-none max-w-7xl w-auto overflow-visible p-0"
    >
      <button
        onClick={onClose}
        aria-label={t('ui.photoViewerClose')}
        className="absolute top-3 end-3 z-10 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20 transition-colors"
      >
        {t('ui.close')}
      </button>

      <img
        src={imageUrl}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full object-contain rounded-lg shadow-2xl"
        style={{ maxHeight: '90vh' }}
      />

      <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
        <div className="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full">
          <p className="text-white text-sm font-medium">
            <Trans i18nKey="ui.photoViewerHint" components={{ bold: <span className="font-bold" /> }} />
          </p>
        </div>
      </div>
    </Dialog>
  );
}
