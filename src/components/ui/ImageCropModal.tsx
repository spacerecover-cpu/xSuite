import { useState, useCallback } from 'react';
import Cropper, { Point, Area } from 'react-easy-crop';
import { Modal } from './Modal';
import { Button } from './Button';
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { logger } from '../../lib/logger';

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onCropComplete: (croppedImageBlob: Blob, croppedImageUrl: string) => void;
  aspectRatio?: number;
  cropShape?: 'rect' | 'round';
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  onCropComplete,
  aspectRatio = 1,
  cropShape = 'round',
}) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  const onCropChange = (crop: Point) => {
    setCrop(crop);
  };

  const onZoomChange = (zoom: number) => {
    setZoom(zoom);
  };

  const onCropCompleteInternal = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
    rotation = 0
  ): Promise<{ blob: Blob; url: string }> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    const maxSize = Math.max(image.width, image.height);
    const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

    canvas.width = safeArea;
    canvas.height = safeArea;

    ctx.translate(safeArea / 2, safeArea / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-safeArea / 2, -safeArea / 2);

    ctx.drawImage(
      image,
      safeArea / 2 - image.width * 0.5,
      safeArea / 2 - image.height * 0.5
    );

    const data = ctx.getImageData(0, 0, safeArea, safeArea);

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.putImageData(
      data,
      Math.round(0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x),
      Math.round(0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y)
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        const url = URL.createObjectURL(blob);
        resolve({ blob, url });
      }, 'image/jpeg', 0.95);
    });
  };

  const handleCrop = async () => {
    if (!croppedAreaPixels) return;

    try {
      setIsCropping(true);
      const { blob, url } = await getCroppedImg(imageUrl, croppedAreaPixels, rotation);
      onCropComplete(blob, url);
      onClose();
    } catch (error) {
      logger.error('Error cropping image:', error);
    } finally {
      setIsCropping(false);
    }
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.1, 1));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crop Image" size="large">
      <div className="space-y-6">
        <div className="relative h-96 bg-slate-900 rounded-xl overflow-hidden">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspectRatio}
            cropShape={cropShape}
            showGrid={true}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropCompleteInternal}
          />
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Zoom
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                disabled={zoom <= 1}
              >
                <ZoomOut className="w-5 h-5 text-slate-600" />
              </button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                disabled={zoom >= 3}
              >
                <ZoomIn className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Rotation
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRotate}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <RotateCw className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">Rotate 90°</span>
              </button>
              <span className="text-sm text-slate-600">Current: {rotation}°</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-3 border-t">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isCropping}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCrop}
            disabled={isCropping}
          >
            {isCropping ? 'Cropping...' : 'Apply Crop'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
