
import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Trash2, 
  Printer, 
  Download, 
  Scissors, 
  Image as ImageIcon,
  Palette,
  LayoutGrid,
  ZoomIn,
  Move,
  RefreshCw,
  CheckSquare,
  Square,
  Loader2,
  Plus,
  Minus,
  CheckCircle2,
  FileText,
  Settings
} from 'lucide-react';
import { PhotoSize, PHOTO_SPECS, UploadedPhoto, A4_WIDTH_MM, A4_HEIGHT_MM, MM_TO_PX } from './types';
import { removeBackground, preparePhoto } from './utils/imageProcessor';

// Global jsPDF from script tag
declare const jspdf: any;

const DEFAULT_PASSPORT_COUNT = 30;
const COLOR_PRESETS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Sky Blue', value: '#87CEEB' },
  { name: 'Royal Blue', value: '#4169E1' },
  { name: 'Light Red', value: '#FFCCCB' }
];

const App: React.FC = () => {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<Set<PhotoSize>>(new Set([PhotoSize.PASSPORT]));
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [activeSheets, setActiveSheets] = useState<string[]>([]);
  
  // Border Settings
  const [useBorder, setUseBorder] = useState(false);
  const [borderThicknessMm, setBorderThicknessMm] = useState(0.2);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (photos.length > 0 && photos.every(p => p.passportCount === 0 && p.stampCount === 0)) {
      const baseCount = Math.floor(DEFAULT_PASSPORT_COUNT / photos.length);
      const remainder = DEFAULT_PASSPORT_COUNT % photos.length;
      setPhotos(prev => prev.map((p, idx) => ({
        ...p,
        passportCount: idx < remainder ? baseCount + 1 : baseCount,
        stampCount: 0
      })));
    }
  }, [photos.length]);

  // Handle reprocessing preview when global border settings change
  useEffect(() => {
    if (photos.length > 0) {
      photos.forEach(photo => {
        const source = photo.isRemovingBg && photo.transparentUrl ? photo.transparentUrl : photo.originalUrl;
        preparePhoto(source, PhotoSize.PASSPORT, photo.bgColor, photo.zoom, photo.offsetX, photo.offsetY, { useBorder, thicknessMm: borderThicknessMm })
          .then(url => {
            setPhotos(current => current.map(p => p.id === photo.id ? { ...p, processedUrl: url } : p));
          });
      });
    }
  }, [useBorder, borderThicknessMm]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;

    const newPhotos: UploadedPhoto[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      originalUrl: URL.createObjectURL(file),
      processedUrl: URL.createObjectURL(file),
      passportCount: 0,
      stampCount: 0,
      bgColor: '#FFFFFF',
      isRemovingBg: false,
      zoom: 1.1,
      offsetX: 0,
      offsetY: 0
    }));

    setPhotos(prev => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const updatePhotoAndReprocess = async (id: string, updates: Partial<UploadedPhoto>) => {
    setPhotos(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      const photo = next.find(p => p.id === id);
      if (photo) {
        const source = photo.isRemovingBg && photo.transparentUrl ? photo.transparentUrl : photo.originalUrl;
        preparePhoto(source, PhotoSize.PASSPORT, photo.bgColor, photo.zoom, photo.offsetX, photo.offsetY, { useBorder, thicknessMm: borderThicknessMm })
          .then(url => {
            setPhotos(current => current.map(p => p.id === id ? { ...p, processedUrl: url } : p));
          });
      }
      return next;
    });
  };

  const handleQuantityChange = (id: string, type: 'passport' | 'stamp', value: string) => {
    const sanitized = value.replace(/[^0-9]/g, '');
    const numValue = sanitized === '' ? 0 : parseInt(sanitized, 10);
    setPhotos(prev => prev.map(p => p.id === id ? { 
      ...p, 
      [type === 'passport' ? 'passportCount' : 'stampCount']: numValue 
    } : p));
  };

  const toggleBgRemoval = async (id: string) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;
    const targetState = !photo.isRemovingBg;
    if (targetState && !photo.transparentUrl) {
      setProcessingIds(prev => new Set(prev).add(id));
      try {
        const transparentUrl = await removeBackground(photo.originalUrl);
        const finalPreview = await preparePhoto(transparentUrl, PhotoSize.PASSPORT, photo.bgColor, photo.zoom, photo.offsetX, photo.offsetY, { useBorder, thicknessMm: borderThicknessMm });
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, isRemovingBg: true, transparentUrl, processedUrl: finalPreview } : p));
      } catch (err) { console.error(err); } 
      finally { setProcessingIds(prev => { const n = new Set(prev); n.delete(id); return n; }); }
    } else {
      const source = targetState ? (photo.transparentUrl || photo.originalUrl) : photo.originalUrl;
      const finalPreview = await preparePhoto(source, PhotoSize.PASSPORT, photo.bgColor, photo.zoom, photo.offsetX, photo.offsetY, { useBorder, thicknessMm: borderThicknessMm });
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, isRemovingBg: targetState, processedUrl: finalPreview } : p));
    }
  };

  const toggleFormat = (size: PhotoSize) => {
    setSelectedFormats(prev => {
      const next = new Set(prev);
      if (next.has(size)) { if (next.size > 1) next.delete(size); } 
      else { next.add(size); }
      return next;
    });
  };

  const generateAllSheets = async () => {
    setIsProcessing(true);
    const pages: HTMLCanvasElement[] = [];
    
    const createNewPage = () => {
      const canvas = document.createElement('canvas');
      canvas.width = MM_TO_PX(A4_WIDTH_MM);
      canvas.height = MM_TO_PX(A4_HEIGHT_MM);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      pages.push(canvas);
      return { canvas, ctx };
    };

    let { canvas, ctx } = createNewPage();
    
    const topMargin = MM_TO_PX(6);
    const bottomMargin = MM_TO_PX(5);
    const horizontalMargin = MM_TO_PX(10);
    const gap = MM_TO_PX(1.2); 

    let curY = topMargin;
    const order = [PhotoSize.PASSPORT, PhotoSize.STAMP];

    for (const size of order) {
      if (!selectedFormats.has(size)) continue;

      const spec = PHOTO_SPECS[size];
      const pW = MM_TO_PX(spec.widthMm);
      const pH = MM_TO_PX(spec.heightMm);
      
      const maxCols = Math.floor((canvas.width - 2 * horizontalMargin + gap) / (pW + gap));
      
      const photosForSize = await Promise.all(photos.map(async p => {
        const count = size === PhotoSize.PASSPORT ? p.passportCount : p.stampCount;
        if (count === 0) return null;
        const source = p.isRemovingBg && p.transparentUrl ? p.transparentUrl : p.originalUrl;
        const url = await preparePhoto(source, size, p.bgColor, p.zoom, p.offsetX, p.offsetY, { useBorder, thicknessMm: borderThicknessMm });
        return { url, count };
      }));

      const activePhotos = photosForSize.filter(x => x !== null) as { url: string, count: number }[];
      if (activePhotos.length === 0) continue;

      if (curY > topMargin + MM_TO_PX(2)) {
        curY += MM_TO_PX(4);
      }

      ctx.font = `bold ${MM_TO_PX(3.5)}px Inter, sans-serif`;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(spec.label.toUpperCase(), horizontalMargin, curY + MM_TO_PX(3));
      curY += MM_TO_PX(5);

      let colIdx = 0;
      const gridWidth = (maxCols * pW + (maxCols - 1) * gap);
      const startX = (canvas.width - gridWidth) / 2;

      for (const item of activePhotos) {
        for (let i = 0; i < item.count; i++) {
          const img = await new Promise<HTMLImageElement>((res) => {
            const imgObj = new Image();
            imgObj.onload = () => res(imgObj);
            imgObj.src = item.url;
          });

          if (curY + pH > canvas.height - bottomMargin) {
            const next = createNewPage();
            canvas = next.canvas;
            ctx = next.ctx;
            curY = topMargin;
            colIdx = 0;
            
            ctx.font = `bold ${MM_TO_PX(3)}px Inter, sans-serif`;
            ctx.fillStyle = '#cbd5e1';
            ctx.fillText(spec.label.toUpperCase() + " (CONT.)", horizontalMargin, curY + MM_TO_PX(3));
            curY += MM_TO_PX(5);
          }

          const drawX = startX + (colIdx * (pW + gap));
          ctx.drawImage(img, drawX, curY, pW, pH);
          
          // Outer cut guides
          ctx.strokeStyle = '#f1f5f9';
          ctx.lineWidth = 1;
          ctx.strokeRect(drawX, curY, pW, pH);
          
          colIdx++;
          if (colIdx >= maxCols) {
            colIdx = 0;
            curY += pH + gap;
          }
        }
      }
      
      if (colIdx !== 0) {
        curY += pH + gap;
      }
    }

    setActiveSheets(pages.map(c => c.toDataURL('image/png', 1.0)));
    setIsProcessing(false);
  };

  const handlePdfDownload = (url: string, index: number) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    doc.addImage(url, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
    doc.save(`SnapPrint-Page-${index + 1}.pdf`);
  };

  const totalPassport = photos.reduce((acc, p) => acc + p.passportCount, 0);
  const totalStamp = photos.reduce((acc, p) => acc + p.stampCount, 0);

  return (
    <div className="min-h-screen bg-[#fcfcfd] pb-20 font-sans text-slate-900">
      <header className="bg-white border-b sticky top-0 z-40 px-6 py-4 flex justify-between items-center shadow-sm no-print">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg">
            <ImageIcon className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase italic">Snap<span className="text-indigo-600">Print</span> Pro</h1>
        </div>
        <div className="flex gap-4">
          {activeSheets.length > 0 && (
            <button onClick={() => setActiveSheets([])} className="bg-slate-900 text-white px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest hover:bg-indigo-600 transition-colors shadow-lg flex items-center gap-2">
              <RefreshCw size={14} /> Back to Studio
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 lg:p-10">
        {activeSheets.length === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Editor Area */}
            <div className="lg:col-span-8 space-y-10">
              <div onClick={() => fileInputRef.current?.click()} className="border-4 border-dashed border-slate-200 rounded-[2.5rem] p-12 bg-white hover:border-indigo-400 transition-all cursor-pointer group text-center shadow-xl">
                <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept="image/*" className="hidden" />
                <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform shadow-inner">
                  <Upload className="text-indigo-600 w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Import Subjects</h3>
                <p className="text-slate-400 mt-1 font-bold uppercase tracking-widest text-[10px]">High DPI Production Ready</p>
              </div>

              <div className="space-y-8">
                {photos.map((photo) => (
                  <div key={photo.id} className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden ring-1 ring-slate-100">
                    <div className="flex flex-col lg:flex-row">
                      <div className="w-full lg:w-64 bg-[#f8fafc] p-8 flex flex-col items-center justify-center border-b lg:border-b-0 lg:border-r border-slate-100 shrink-0">
                        <div className="relative overflow-hidden rounded-2xl shadow-2xl bg-white border-4 border-white" style={{ width: '150px', height: '190px' }}>
                          {processingIds.has(photo.id) ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3">
                               <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                               <span className="text-[9px] font-black text-indigo-600 uppercase">Analyzing...</span>
                            </div>
                          ) : <img src={photo.processedUrl} className="max-h-full max-w-full object-contain mx-auto" alt="Preview" />}
                        </div>
                        <button onClick={() => removePhoto(photo.id)} className="mt-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={14} /> Remove Photo
                        </button>
                      </div>
                      
                      <div className="flex-1 p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-6">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block">Retouching</label>
                          <button disabled={processingIds.has(photo.id)} onClick={() => toggleBgRemoval(photo.id)} className={`w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${photo.isRemovingBg ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-white'}`}>
                            {photo.isRemovingBg ? <CheckCircle2 size={16} /> : <Scissors size={16} />}
                            {photo.isRemovingBg ? 'Background Clear' : 'Remove Background'}
                          </button>
                          <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 px-4 py-3 rounded-2xl">
                            <Palette size={16} className="text-slate-400 shrink-0" />
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                              {COLOR_PRESETS.map(c => (
                                <button key={c.value} onClick={() => updatePhotoAndReprocess(photo.id, { bgColor: c.value })} className={`w-6 h-6 rounded-full border-2 transition-transform ${photo.bgColor === c.value ? 'border-indigo-600 scale-110' : 'border-white'}`} style={{ backgroundColor: c.value }} />
                              ))}
                              <input type="color" value={photo.bgColor} onChange={(e) => updatePhotoAndReprocess(photo.id, { bgColor: e.target.value })} className="w-6 h-6 border-2 border-white rounded-full cursor-pointer p-0" />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="flex items-center gap-4">
                              <ZoomIn size={16} className="text-slate-400 shrink-0" />
                              <input type="range" min="0.5" max="3" step="0.05" value={photo.zoom} onChange={(e) => updatePhotoAndReprocess(photo.id, { zoom: parseFloat(e.target.value) })} className="flex-1 accent-indigo-600 h-1.5 bg-slate-100 rounded-full appearance-none" />
                            </div>
                            <div className="flex items-center gap-4">
                              <Move size={16} className="text-slate-400 shrink-0" />
                              <div className="flex gap-2 flex-1">
                                <input type="range" min="-0.5" max="0.5" step="0.01" value={photo.offsetX} onChange={(e) => updatePhotoAndReprocess(photo.id, { offsetX: parseFloat(e.target.value) })} className="flex-1 accent-indigo-600 h-1.5 bg-slate-100 rounded-full appearance-none" />
                                <input type="range" min="-0.5" max="0.5" step="0.01" value={photo.offsetY} onChange={(e) => updatePhotoAndReprocess(photo.id, { offsetY: parseFloat(e.target.value) })} className="flex-1 accent-indigo-600 h-1.5 bg-slate-100 rounded-full appearance-none" />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block">Production Quantities</label>
                          
                          <div className="space-y-2">
                             <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                                <span>Passport Size</span>
                                <span>{photo.passportCount} pcs</span>
                             </div>
                             <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                                <button onClick={() => setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, passportCount: Math.max(0, p.passportCount - 1) } : p))} className="w-10 h-10 flex bg-white rounded-xl shadow-sm items-center justify-center hover:text-indigo-600 transition-all shrink-0 border border-slate-100"><Minus size={14} /></button>
                                <input type="text" value={photo.passportCount} onChange={(e) => handleQuantityChange(photo.id, 'passport', e.target.value)} className="w-full h-10 bg-transparent text-center font-black text-sm focus:outline-none" />
                                <button onClick={() => setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, passportCount: p.passportCount + 1 } : p))} className="w-10 h-10 flex bg-white rounded-xl shadow-sm items-center justify-center hover:text-indigo-600 transition-all shrink-0 border border-slate-100"><Plus size={14} /></button>
                             </div>
                          </div>

                          <div className="space-y-2">
                             <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                                <span>Stamp Size</span>
                                <span>{photo.stampCount} pcs</span>
                             </div>
                             <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                                <button onClick={() => setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, stampCount: Math.max(0, p.stampCount - 1) } : p))} className="w-10 h-10 flex bg-white rounded-xl shadow-sm items-center justify-center hover:text-indigo-600 transition-all shrink-0 border border-slate-100"><Minus size={14} /></button>
                                <input type="text" value={photo.stampCount} onChange={(e) => handleQuantityChange(photo.id, 'stamp', e.target.value)} className="w-full h-10 bg-transparent text-center font-black text-sm focus:outline-none" />
                                <button onClick={() => setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, stampCount: p.stampCount + 1 } : p))} className="w-10 h-10 flex bg-white rounded-xl shadow-sm items-center justify-center hover:text-indigo-600 transition-all shrink-0 border border-slate-100"><Plus size={14} /></button>
                             </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4">
              <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 p-10 sticky top-28 space-y-10">
                <div>
                  <h3 className="text-xs font-black text-slate-900 mb-8 flex items-center gap-3 uppercase tracking-widest">
                    <LayoutGrid className="text-indigo-600 w-5 h-5" /> Active Formats
                  </h3>
                  <div className="space-y-4">
                    {Object.entries(PhotoSize).map(([key, value]) => (
                      <button key={value} onClick={() => toggleFormat(value as PhotoSize)} className={`w-full flex items-center justify-between px-8 py-6 rounded-[1.5rem] border-2 transition-all ${selectedFormats.has(value as PhotoSize) ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl' : 'bg-white border-slate-100 text-slate-400'}`}>
                        <div className="flex flex-col items-start">
                          <span className="font-black uppercase tracking-widest text-[11px]">{PHOTO_SPECS[value as PhotoSize].label}</span>
                        </div>
                        {selectedFormats.has(value as PhotoSize) ? <CheckSquare size={22} /> : <Square size={22} className="opacity-20" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ENHANCEMENT 2: Photo Border Toggle Section */}
                <div>
                  <h3 className="text-xs font-black text-slate-900 mb-8 flex items-center gap-3 uppercase tracking-widest">
                    <Settings className="text-indigo-600 w-5 h-5" /> Photo Border
                  </h3>
                  <div className="bg-slate-50 p-6 rounded-[1.5rem] border border-slate-100 space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Apply Border</span>
                      <button 
                        onClick={() => setUseBorder(!useBorder)}
                        className={`w-12 h-6 rounded-full transition-all relative ${useBorder ? 'bg-indigo-600' : 'bg-slate-200'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${useBorder ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                    {useBorder && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          <span>Thickness</span>
                          <span>{borderThicknessMm} mm</span>
                        </div>
                        <input 
                          type="range" 
                          min="0.1" 
                          max="2" 
                          step="0.1" 
                          value={borderThicknessMm} 
                          onChange={(e) => setBorderThicknessMm(parseFloat(e.target.value))}
                          className="w-full accent-indigo-600 h-1.5 bg-white rounded-full appearance-none"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-50 pt-10">
                  <div className="space-y-4 mb-8">
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Passport Total</span>
                        <span className="font-black text-slate-900">{totalPassport}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stamp Total</span>
                        <span className="font-black text-slate-900">{totalStamp}</span>
                     </div>
                  </div>
                  <button disabled={photos.length === 0 || (totalPassport === 0 && totalStamp === 0) || isProcessing} onClick={generateAllSheets} className="w-full bg-slate-900 text-white py-6 rounded-3xl font-black uppercase tracking-[0.3em] text-xs shadow-2xl hover:bg-indigo-600 disabled:opacity-30 transition-all flex items-center justify-center gap-4">
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer size={18} />}
                    Finalize Layout
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-24 animate-in fade-in zoom-in-95 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-center gap-8 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl no-print">
              <div>
                <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">Print Preview</h2>
                <p className="text-slate-400 font-black uppercase text-[10px] tracking-[0.3em] mt-3">Ready for High-Quality Output ({activeSheets.length} Sheets)</p>
              </div>
              <div className="flex gap-4 w-full md:w-auto">
                <button onClick={() => window.print()} className="flex-1 md:flex-none px-12 py-5 bg-indigo-600 text-white rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 shadow-xl transition-all flex items-center justify-center gap-3">
                  <Printer size={18} /> Print All
                </button>
              </div>
            </div>

            {activeSheets.map((url, idx) => (
              <div key={idx} className="space-y-8 no-print">
                <div className="bg-slate-50 rounded-[4rem] p-10 lg:p-20 border-8 border-white shadow-2xl flex justify-center items-start overflow-hidden">
                   <div style={{ transform: 'scale(0.7)', transformOrigin: 'top center', height: 'calc(297mm * 0.7)', width: '210mm' }}>
                      <div className="a4-sheet shadow-2xl ring-1 ring-slate-200">
                        <img src={url} className="w-full h-full" alt={`Layout Page ${idx + 1}`} />
                      </div>
                   </div>
                </div>
                <div className="flex flex-wrap justify-center gap-4">
                   <a href={url} download={`SnapPrint-Page-${idx+1}.png`} className="inline-flex items-center gap-3 px-8 py-4 bg-white border border-slate-200 rounded-full font-black text-[10px] uppercase tracking-widest hover:border-indigo-600 transition-colors">
                      <Download size={14} /> Download PNG
                   </a>
                   <button onClick={() => handlePdfDownload(url, idx)} className="inline-flex items-center gap-3 px-8 py-4 bg-white border border-slate-200 rounded-full font-black text-[10px] uppercase tracking-widest hover:border-indigo-600 transition-colors">
                      <FileText size={14} /> Download PDF
                   </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <div className="hidden print:block">
        {activeSheets.map((url, idx) => (
          <div key={idx} className="a4-print-page" style={{ margin: 0, padding: 0, height: '297mm', width: '210mm', overflow: 'hidden' }}>
            <img 
              src={url} 
              style={{ 
                width: '210mm', 
                height: '297mm', 
                display: 'block',
                margin: 0,
                padding: 0
              }} 
              alt={`Print Page ${idx + 1}`} 
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
