
import { PHOTO_SPECS, PhotoSize, MM_TO_PX } from '../types';

// Declare global for MediaPipe loaded in index.html
declare var SelfieSegmentation: any;

let selfieSegmentation: any = null;

/**
 * Lazy initializer for MediaPipe Selfie Segmentation model
 */
const initSegmentation = async () => {
  if (selfieSegmentation) return selfieSegmentation;
  
  selfieSegmentation = new SelfieSegmentation({
    locateFile: (file: string) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
    }
  });

  selfieSegmentation.setOptions({
    modelSelection: 1, // 1 for Landscape (higher accuracy), 0 for general
  });

  return selfieSegmentation;
};

/**
 * True ML-based background removal using MediaPipe
 */
export const removeBackground = async (imageSrc: string): Promise<string> => {
  const model = await initSegmentation();
  const img = new Image();
  img.crossOrigin = 'anonymous';
  
  return new Promise((resolve) => {
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = img.width;
      canvas.height = img.height;

      model.onResults((results: any) => {
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Use the segmentation mask
        ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
        
        // Smooth the mask edges using alpha composite
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        
        ctx.restore();
        resolve(canvas.toDataURL('image/png'));
      });

      await model.send({ image: img });
    };
    img.src = imageSrc;
  });
};

/**
 * Composites a subject (optionally transparent) with a background and user transforms.
 */
export const preparePhoto = async (
  imageSrc: string, 
  size: PhotoSize, 
  bgColor: string,
  zoom: number = 1,
  offsetX: number = 0,
  offsetY: number = 0
): Promise<string> => {
  return new Promise((resolve) => {
    const spec = PHOTO_SPECS[size];
    const targetW = MM_TO_PX(spec.widthMm);
    const targetH = MM_TO_PX(spec.heightMm);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      canvas.width = targetW;
      canvas.height = targetH;

      // 1. Draw solid background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, targetW, targetH);

      // 2. Calculate subject scaling
      const imgAspect = img.width / img.height;
      const targetAspect = targetW / targetH;

      let baseW, baseH;
      if (imgAspect > targetAspect) {
        baseH = targetH;
        baseW = targetH * imgAspect;
      } else {
        baseW = targetW;
        baseH = targetW / imgAspect;
      }

      const drawW = baseW * zoom;
      const drawH = baseH * zoom;
      const x = (targetW - drawW) / 2 + (offsetX * targetW);
      const y = (targetH - drawH) / 2 + (offsetY * targetH);

      // 3. Draw subject
      ctx.drawImage(img, x, y, drawW, drawH);
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(imageSrc);
    img.src = imageSrc;
  });
};
