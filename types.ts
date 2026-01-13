
export enum PhotoSize {
  PASSPORT = 'PASSPORT',
  STAMP = 'STAMP'
}

export interface PhotoDimensions {
  widthMm: number;
  heightMm: number;
  label: string;
}

export const PHOTO_SPECS: Record<PhotoSize, PhotoDimensions> = {
  [PhotoSize.PASSPORT]: { widthMm: 35, heightMm: 45, label: 'Passport (35x45mm)' },
  [PhotoSize.STAMP]: { widthMm: 20, heightMm: 25, label: 'Stamp (20x25mm)' },
};

export interface UploadedPhoto {
  id: string;
  originalUrl: string;
  processedUrl: string;
  transparentUrl?: string;
  passportCount: number;
  stampCount: number;
  bgColor: string;
  isRemovingBg: boolean;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export const DPI = 300;
export const MM_TO_PX = (mm: number) => Math.round((mm * DPI) / 25.4);
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
