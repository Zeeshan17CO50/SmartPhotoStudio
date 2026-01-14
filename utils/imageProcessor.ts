
import { PhotoSize, PHOTO_SPECS, MM_TO_PX } from '../types';

// Declare MediaPipe global
declare const SelfieSegmentation: any;

export const removeBackground = async (imageSrc: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      const selfieSegmentation = new SelfieSegmentation({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      });

      selfieSegmentation.setOptions({
        modelSelection: 1, // landscape/general
      });

      selfieSegmentation.onResults((results: any) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      });

      await selfieSegmentation.send({ image: img });
    };
    img.onerror = reject;
  });
};

export const preparePhoto = async (
  sourceUrl: string,
  size: PhotoSize,
  bgColor: string,
  zoom: number,
  offsetX: number,
  offsetY: number,
  borderSettings?: { useBorder: boolean; thicknessMm: number }
): Promise<string> => {
  const spec = PHOTO_SPECS[size];
  const targetW = MM_TO_PX(spec.widthMm);
  const targetH = MM_TO_PX(spec.heightMm);

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d')!;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sourceUrl;
    img.onload = () => {
      // Fill background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, targetW, targetH);

      // Calculate scale to cover target (Biometric focus)
      const imgAspect = img.width / img.height;
      const targetAspect = targetW / targetH;
      let drawW, drawH;

      if (imgAspect > targetAspect) {
        drawH = targetH;
        drawW = targetH * imgAspect;
      } else {
        drawW = targetW;
        drawH = targetW / imgAspect;
      }

      // Apply zoom
      drawW *= zoom;
      drawH *= zoom;

      // Center + User Offset
      const x = (targetW - drawW) / 2 + (offsetX * targetW);
      const y = (targetH - drawH) / 2 + (offsetY * targetH);

      ctx.drawImage(img, x, y, drawW, drawH);

      // Apply Border if enabled
      if (borderSettings?.useBorder && borderSettings.thicknessMm > 0) {
        const borderPx = MM_TO_PX(borderSettings.thicknessMm);
        ctx.lineWidth = borderPx;
        ctx.strokeStyle = 'black';
        // Stroke centered on edge: draw inside by shifting half thickness
        ctx.strokeRect(borderPx / 2, borderPx / 2, targetW - borderPx, targetH - borderPx);
      }

      resolve(canvas.toDataURL('image/png', 0.9));
    };
  });
};
