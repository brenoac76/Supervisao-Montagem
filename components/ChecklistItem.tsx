
import React, { useState, useRef, useEffect } from 'react';
import { ChecklistItem, ChecklistStatus, Media, Assembler } from '../types';
import Modal from './Modal';
import { CameraIcon, CheckCircleIcon, ExclamationCircleIcon, TrashIcon, VideoCameraIcon, PaperClipIcon, ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon, RefreshIcon, UserIcon, CalendarIcon, CubeIcon, PlusCircleIcon, PencilIcon, XIcon } from './icons';
import { SCRIPT_URL, generateUUID } from '../App';
import { fetchWithRetry } from '../utils/api';

// Helper para converter string YYYY-MM-DD para exibição BR DD/MM/AAAA sem fuso horário
const toDisplayDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const part = dateStr.split('T')[0]; // Pega apenas a parte da data
    const bits = part.split('-');
    if (bits.length !== 3) return dateStr;
    return `${bits[2]}/${bits[1]}/${bits[0]}`;
};

// Helper para converter string para input date (YYYY-MM-DD) sem fuso horário
const toInputDateString = (dateStr?: string) => {
    if (!dateStr) return '';
    return dateStr.split('T')[0];
};

const getDisplayableDriveUrl = (url: string): string => {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
  const match = url.match(driveRegex);
  let fileId: string | null = null;

  if (match && match[1]) {
    fileId = match[1];
  } else if (!url.includes('/') && url.length > 20) {
    fileId = url;
  }

  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }
  return url;
};

const DriveImage: React.FC<{
  driveUrl: string;
  alt: string;
  className: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}> = ({ driveUrl, alt, className, onClick, style }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const displayableUrl = React.useMemo(() => getDisplayableDriveUrl(driveUrl), [driveUrl]);

  useEffect(() => {
    if (!displayableUrl || displayableUrl.startsWith('blob:') || displayableUrl.startsWith('data:')) {
      setObjectUrl(displayableUrl);
      setStatus('loaded');
      return;
    }

    let isCancelled = false;
    let createdObjectUrl: string | null = null;

    const loadImage = async () => {
      setStatus('loading');
      try {
        const response = await fetch(displayableUrl);
        if (!response.ok) throw new Error(`Failed to fetch with status: ${response.status}`);
        const blob = await response.blob();
        if (!isCancelled) {
          createdObjectUrl = URL.createObjectURL(blob);
          setObjectUrl(createdObjectUrl);
          setStatus('loaded');
        }
      } catch (error) {
        console.error('Failed to load Google Drive image:', error);
        if (!isCancelled) {
          setStatus('error');
        }
      }
    };

    loadImage();

    return () => {
      isCancelled = true;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [displayableUrl]);

  if (status === 'loading') {
    return <div className={`${className} bg-slate-800 flex items-center justify-center animate-pulse`}><PaperClipIcon className="text-slate-500" /></div>;
  }
  
  if (status === 'error') {
    return <div title={alt} className={`${className} bg-red-900/20 flex items-center justify-center`}><ExclamationCircleIcon className="w-6 h-6 text-red-400" /></div>;
  }

  return (
    <img 
        src={objectUrl!} 
        alt={alt} 
        className={className} 
        onClick={onClick} 
        style={style}
        draggable={false}
    />
  );
};

const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
       const reader = new FileReader();
       reader.readAsDataURL(file);
       reader.onload = () => resolve({ base64: reader.result as string, mimeType: file.type });
       reader.onerror = error => reject(error);
       return;
    }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target?.result as string; };
    reader.onerror = (err) => reject(err);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 1280;
      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
      resolve({ base64: compressedBase64, mimeType: 'image/jpeg' });
    };
    reader.readAsDataURL(file);
  });
};

interface ChecklistItemProps {
  item: ChecklistItem;
  assemblers: Assembler[];
  onUpdate: (item: ChecklistItem) => void;
  onDelete: (itemId: string) => void;
}

const ChecklistItemComponent: React.FC<ChecklistItemProps> = ({ item, assemblers, onUpdate, onDelete }) => {
  const [viewingMediaIndex, setViewingMediaIndex] = useState<{ list: Media[], index: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const astecaFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMediaIds, setUploadingMediaIds] = useState<string[]>([]);
  
  // States for description editing
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [tempDesc, setTempDesc] = useState(item.description);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  
  const lastTouchRef = useRef<{ x: number, y: number } | null>(null);
  const startPinchDistRef = useRef<number | null>(null);
  const startZoomLevelRef = useRef<number>(1);
  const swipeStartRef = useRef<{ x: number, y: number } | null>(null);

  const currentProgress = item.progress !== undefined ? item.progress : (item.status === ChecklistStatus.Completed ? 100 : 0);

  useEffect(() => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  }, [viewingMediaIndex]);

  useEffect(() => {
    setTempDesc(item.description);
  }, [item.description]);

  const getVisualStatus = () => {
    if (item.isDelivery) {
        return item.status === ChecklistStatus.Completed 
            ? { label: 'Entrega Concluída', color: 'orange' }
            : { label: 'Entrega', color: 'orange' };
    }
    if (item.status === ChecklistStatus.Completed) return { label: 'Concluído', color: 'green' };
    if (item.status === ChecklistStatus.Defective) return { label: 'ASTECA', color: 'red' };
    if (!item.scheduledStart && !item.scheduledEnd) return { label: 'Não Iniciado', color: 'slate' };
    if (item.scheduledEnd) {
        const end = new Date(item.scheduledEnd);
        if (end < new Date()) return { label: 'Pausado', color: 'red' };
    }
    return { label: 'Em Andamento', color: 'blue' };
  };

  const visualStatus = getVisualStatus();

  const getStatusClasses = () => {
      switch(visualStatus.color) {
          case 'green': return 'border-green-400 bg-green-50/10 shadow-green-100/50';
          case 'red': return 'border-red-400 bg-red-50/10 shadow-red-100/50';
          case 'blue': return 'border-blue-400 bg-blue-50/10 shadow-blue-100/50';
          case 'orange': return 'border-orange-400 bg-orange-50/10 shadow-orange-100/50';
          default: return 'border-slate-300 bg-white';
      }
  };

  const getTagClasses = () => {
      switch(visualStatus.color) {
          case 'green': return 'bg-green-100 text-green-700 border-green-200';
          case 'red': return 'bg-red-100 text-red-700 border-red-200';
          case 'blue': return 'bg-blue-100 text-blue-700 border-blue-200';
          case 'orange': return 'bg-orange-100 text-orange-700 border-orange-200';
          default: return 'bg-slate-100 text-slate-600 border-slate-200';
      }
  };

  const handleStatusChange = (newStatus: ChecklistStatus) => {
    let newProgress = currentProgress;
    if (newStatus === ChecklistStatus.Completed) {
        newProgress = 100;
    } else if (newStatus === ChecklistStatus.Pending && currentProgress === 100) {
        newProgress = 0;
    }

    const updatedItem: ChecklistItem = { 
        ...item, 
        status: newStatus,
        progress: newProgress 
    };

    if (newStatus === ChecklistStatus.Completed) {
        // Salva apenas o YYYY-MM-DD textual local (evita UTC bug)
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        updatedItem.completionDate = item.completionDate || `${y}-${m}-${d}`;
        delete updatedItem.defectDate;
    } else if (newStatus === ChecklistStatus.Defective) {
        updatedItem.defectDate = new Date().toISOString();
    } else if (newStatus === ChecklistStatus.Pending) {
        delete updatedItem.completionDate;
        delete updatedItem.defectDate;
    }
    onUpdate(updatedItem);
  };

  const handleSaveDesc = () => {
      if (tempDesc.trim() && tempDesc !== item.description) {
          onUpdate({ ...item, description: tempDesc.trim() });
      }
      setIsEditingDesc(false);
  };

  const handleObservationChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({ ...item, observations: e.target.value });
  };

  const handleMediaObservationChange = (text: string) => {
    if (viewingMediaIndex === null) return;
    const isAstecaList = viewingMediaIndex.list === item.astecaMedia;
    
    if (isAstecaList) {
        const updatedAstecaMedia = [...(item.astecaMedia || [])];
        updatedAstecaMedia[viewingMediaIndex.index] = { ...updatedAstecaMedia[viewingMediaIndex.index], observation: text };
        onUpdate({ ...item, astecaMedia: updatedAstecaMedia });
        setViewingMediaIndex({ ...viewingMediaIndex, list: updatedAstecaMedia });
    } else {
        const updatedMediaList = [...item.media];
        updatedMediaList[viewingMediaIndex.index] = { ...updatedMediaList[viewingMediaIndex.index], observation: text };
        onUpdate({ ...item, media: updatedMediaList });
        setViewingMediaIndex({ ...viewingMediaIndex, list: updatedMediaList });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, isAsteca: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const tempId = generateUUID();
    const localUrl = URL.createObjectURL(file);
    const tempMedia: Media = {
      id: tempId,
      type: file.type.startsWith('image/') ? 'image' : 'video',
      url: localUrl,
      name: file.name,
      observation: ''
    };

    let optimisticMediaList: Media[];
    if (isAsteca) {
        optimisticMediaList = [...(item.astecaMedia || []), tempMedia];
        onUpdate({ ...item, astecaMedia: optimisticMediaList });
    } else {
        optimisticMediaList = [...item.media, tempMedia];
        onUpdate({ ...item, media: optimisticMediaList });
    }
    
    setUploadingMediaIds(prev => [...prev, tempId]);

    try {
      const { base64: base64Data, mimeType } = await compressImage(file);
      const response = await fetchWithRetry(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'UPLOAD_FILE',
          data: { base64Data, fileName: file.name, mimeType: mimeType }
        }),
      });
      const result = await response.json();
      if (!result.success || !result.url) throw new Error(result.message || 'Falha no upload');
      
      const finalMedia: Media = { ...tempMedia, url: result.url };
      URL.revokeObjectURL(localUrl);
      
      if (isAsteca) {
          const finalMediaList = optimisticMediaList.map(m => m.id === tempId ? finalMedia : m);
          onUpdate({ ...item, astecaMedia: finalMediaList });
      } else {
          const finalMediaList = optimisticMediaList.map(m => m.id === tempId ? finalMedia : m);
          onUpdate({ ...item, media: finalMediaList });
      }
    } catch (error: any) {
      alert(`Erro: ${error?.message}`);
      URL.revokeObjectURL(localUrl);
      if (isAsteca) {
          onUpdate({ ...item, astecaMedia: optimisticMediaList.filter(m => m.id !== tempId) });
      } else {
          onUpdate({ ...item, media: optimisticMediaList.filter(m => m.id !== tempId) });
      }
    } finally {
      setUploadingMediaIds(prev => prev.filter(id => id !== tempId));
    }
  };

  const removeMedia = (mediaId: string, isAsteca: boolean = false) => {
    if (window.confirm("Remover esta mídia?")) {
        if (isAsteca) {
            onUpdate({ ...item, astecaMedia: (item.astecaMedia || []).filter(m => m.id !== mediaId) });
        } else {
            onUpdate({ ...item, media: item.media.filter(m => m.id !== mediaId) });
        }
    }
  };

  const handleNextMedia = () => {
    if (viewingMediaIndex === null) return;
    setViewingMediaIndex({
        ...viewingMediaIndex,
        index: (viewingMediaIndex.index + 1) % viewingMediaIndex.list.length
    });
  };

  const handlePrevMedia = () => {
    if (viewingMediaIndex === null) return;
    setViewingMediaIndex({
        ...viewingMediaIndex,
        index: (viewingMediaIndex.index - 1 + viewingMediaIndex.list.length) % viewingMediaIndex.list.length
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
          const dist = Math.sqrt(Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) + Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2));
          startPinchDistRef.current = dist;
          startZoomLevelRef.current = zoomLevel;
      } else if (e.touches.length === 1) {
          lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          setIsDragging(true);
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (e.touches.length === 2 && startPinchDistRef.current !== null) {
          const dist = Math.sqrt(Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) + Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2));
          const scaleFactor = dist / startPinchDistRef.current;
          setZoomLevel(Math.max(1, Math.min(startZoomLevelRef.current * scaleFactor, 5)));
      } else if (e.touches.length === 1 && isDragging && lastTouchRef.current) {
          if (zoomLevel > 1) {
              const dx = e.touches[0].clientX - lastTouchRef.current.x;
              const dy = e.touches[0].clientY - lastTouchRef.current.y;
              setPanPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
              lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }
      }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      setIsDragging(false);
      if (zoomLevel === 1 && swipeStartRef.current && e.changedTouches.length === 1) {
          const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
          if (Math.abs(dx) > 50) {
              if (dx > 0) handlePrevMedia();
              else handleNextMedia();
          }
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
        setIsDragging(true);
        lastTouchRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1 && lastTouchRef.current) {
        const dx = e.clientX - lastTouchRef.current.x;
        const dy = e.clientY - lastTouchRef.current.y;
        setPanPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastTouchRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.5, 5));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPanPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const currentMedia = viewingMediaIndex !== null ? viewingMediaIndex.list[viewingMediaIndex.index] : null;

  return (
    <div className={`p-4 rounded-lg shadow-md border-2 relative transition-all duration-300 group ${getStatusClasses()}`}>
      
      {/* --- ETIQUETA DE STATUS SEMPRE NO TOPO DIREITO --- */}
      <div className={`absolute top-0 right-0 ${getTagClasses()} text-[10px] font-medium px-2 py-1 rounded-bl-lg border-b border-l uppercase tracking-wider shadow-sm z-10 flex flex-col items-center min-w-[80px]`}>
          <span>{visualStatus.label}</span>
          {item.status === ChecklistStatus.Completed && item.completionDate && (
              <span className="text-[7.5px] font-bold lowercase opacity-80 mt-[-1px]">
                  {toDisplayDate(item.completionDate)}
              </span>
          )}
      </div>

      <div className="flex flex-col">
        <div className="flex-1 pr-20"> {/* Dá espaço para a etiqueta não cobrir o texto */}
            {isEditingDesc ? (
                <div className="flex items-center gap-2 animate-fadeIn">
                    <input 
                        autoFocus
                        value={tempDesc}
                        onChange={e => setTempDesc(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveDesc()}
                        onBlur={handleSaveDesc}
                        className="w-full text-sm font-medium text-slate-800 border-b border-blue-500 outline-none bg-transparent"
                    />
                    <button onClick={handleSaveDesc} className="text-green-600 hover:text-green-700">
                        <CheckCircleIcon className="w-4 h-4"/>
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2 group/title">
                    <p className={`text-slate-800 break-words ${item.isDelivery ? 'font-normal' : 'font-medium'}`}>{item.description}</p>
                    <button 
                        onClick={() => setIsEditingDesc(true)} 
                        className="text-slate-400 hover:text-blue-600 opacity-0 group-hover/title:opacity-100 transition-opacity"
                    >
                        <PencilIcon className="w-3.5 h-3.5"/>
                    </button>
                </div>
            )}

            {/* --- SEÇÃO DE DATA DE CONCLUSÃO - SINCRONIZADA E SEM FUSO --- */}
            {item.status === ChecklistStatus.Completed && (
                <div className="mt-2 flex flex-col gap-1 animate-fadeIn bg-green-50/50 p-2 rounded border border-green-100 w-fit">
                    <label className="text-[9px] font-black text-green-600 uppercase tracking-widest">Finalizado em:</label>
                    <input 
                        type="date"
                        value={toInputDateString(item.completionDate)}
                        onChange={e => onUpdate({ ...item, completionDate: e.target.value })}
                        className="text-[10px] border border-green-200 rounded px-2 py-1 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-green-400 font-bold"
                    />
                </div>
            )}
        </div>
      </div>

      {/* --- FORMULÁRIO ASTECA --- */}
      {item.status === ChecklistStatus.Defective && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg space-y-2 animate-fadeIn">
              <h5 className="text-[10px] font-medium text-red-700 uppercase tracking-widest flex items-center gap-1">
                  <RefreshIcon className="w-3 h-3"/> Dados da Assistência Técnica
              </h5>
              <div className="grid grid-cols-2 gap-2">
                  <div>
                      <label className="block text-[9px] font-medium text-red-600 uppercase">Ordem de Compra</label>
                      <input 
                        type="text" 
                        value={item.astecaOC || ''} 
                        onChange={e => onUpdate({...item, astecaOC: e.target.value})}
                        className="w-full p-1 text-xs border border-red-200 rounded focus:ring-1 focus:ring-red-400 outline-none font-normal"
                        placeholder="Ex: MJF123"
                      />
                  </div>
                  <div>
                      <label className="block text-[9px] font-medium text-red-600 uppercase">Nº da Asteca</label>
                      <input 
                        type="text" 
                        value={item.astecaNumber || ''} 
                        onChange={e => onUpdate({...item, astecaNumber: e.target.value})}
                        className="w-full p-1 text-xs border border-red-200 rounded focus:ring-1 focus:ring-red-400 outline-none font-normal"
                        placeholder="Ex: 5040"
                      />
                  </div>
                  <div>
                      <label className="block text-[9px] font-medium text-red-600 uppercase">Data Asteca</label>
                      <input 
                        type="date" 
                        value={item.astecaDate || ''} 
                        onChange={e => onUpdate({...item, astecaDate: e.target.value})}
                        className="w-full p-1 text-xs border border-red-200 rounded focus:ring-1 focus:ring-red-400 outline-none font-normal"
                      />
                  </div>
                  <div className="col-span-1">
                       <label className="block text-[9px] font-medium text-red-600 uppercase">Motivo</label>
                       <input 
                        type="text" 
                        value={item.astecaReason || ''} 
                        onChange={e => onUpdate({...item, astecaReason: e.target.value})}
                        className="w-full p-1 text-xs border border-red-200 rounded focus:ring-1 focus:ring-red-400 outline-none font-normal"
                        placeholder="Ex: Peça batida"
                      />
                  </div>
              </div>

              <div className="mt-2 border-t border-red-100 pt-2">
                  <label className="block text-[9px] font-medium text-red-600 uppercase mb-2 flex items-center gap-1">
                    <CameraIcon className="w-3 h-3"/> Fotos das Partes Danificadas (ASTECA)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(item.astecaMedia || []).map((m, idx) => (
                      <div key={m.id} className="relative group/asteca">
                        <div className="w-12 h-12 rounded border border-red-200 overflow-hidden bg-white">
                           <DriveImage
                              driveUrl={m.url}
                              alt={m.name}
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => setViewingMediaIndex({ list: item.astecaMedia || [], index: idx })}
                           />
                        </div>
                        <button onClick={() => removeMedia(m.id, true)} className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px] opacity-0 group-hover/asteca:opacity-100 transition-opacity">&times;</button>
                      </div>
                    ))}
                    <button 
                        onClick={() => astecaFileInputRef.current?.click()}
                        className="w-12 h-12 flex flex-col items-center justify-center border-2 border-dashed border-red-200 rounded bg-white hover:bg-red-50 transition-colors"
                    >
                        {uploadingMediaIds.some(id => (item.astecaMedia || []).some(m => m.id === id)) ? <RefreshIcon className="w-4 h-4 animate-spin text-red-400"/> : <PlusCircleIcon className="w-5 h-5 text-red-300"/>}
                    </button>
                    <input type="file" ref={astecaFileInputRef} className="hidden" accept="image/*" onChange={e => handleFileChange(e, true)} />
                  </div>
              </div>
          </div>
      )}

      <div className="mt-3">
          <label htmlFor={`obs-${item.id}`} className="block text-[10px] font-medium text-slate-500 mb-1">OBSERVAÇÕES:</label>
          <textarea
            id={`obs-${item.id}`}
            value={item.observations || item.defectObservation || ''}
            onChange={handleObservationChange}
            placeholder="Adicione observações..."
            rows={2}
            className="w-full p-2 border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none font-normal"
          />
      </div>

      <input type="file" ref={fileInputRef} onChange={e => handleFileChange(e, false)} className="hidden" accept="image/*,video/*" />

      {item.media.length > 0 && (
        <div className="mt-3">
          <h4 className="text-[10px] font-medium text-slate-500 mb-2 flex items-center gap-1 uppercase"><PaperClipIcon /> Anexos do Item</h4>
          <div className="flex flex-wrap gap-2">
            {item.media.map((media, idx) => (
              <div key={media.id} className="relative group/media">
                <div className="w-16 h-16 rounded-md border-2 border-slate-200 overflow-hidden relative">
                    {media.type === 'image' ? (
                    <DriveImage
                        driveUrl={media.url}
                        alt={media.name}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setViewingMediaIndex({ list: item.media, index: idx })}
                    />
                    ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center cursor-pointer" onClick={() => setViewingMediaIndex({ list: item.media, index: idx })}>
                        <VideoCameraIcon />
                    </div>
                    )}
                    {uploadingMediaIds.includes(media.id) && (
                        <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                        </div>
                    )}
                </div>
                {!uploadingMediaIds.includes(media.id) && (
                    <button onClick={() => removeMedia(media.id, false)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover/media:opacity-100 transition-opacity">
                        &times;
                    </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- RODAPÉ DE AÇÕES REPOSICIONADO PARA EVITAR CONFLITO COM A TAG --- */}
      <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
             {/* Movi a Câmera e Excluir para cá */}
             <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-500 hover:text-blue-600 transition-colors bg-slate-100 rounded-lg" title="Anexar mídia">
                <CameraIcon className="w-5 h-5" />
             </button>
             <button onClick={() => onDelete(item.id)} className="p-2 text-slate-300 hover:text-red-600 transition-colors rounded-lg" title="Excluir item">
                <TrashIcon className="w-5 h-5"/>
             </button>
        </div>
        
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-400 font-bold uppercase tracking-tighter mr-1">Status:</span>
          {item.status !== ChecklistStatus.Completed && (
            <button onClick={() => handleStatusChange(ChecklistStatus.Completed)} className="flex items-center gap-1 text-green-600 hover:bg-green-50 px-2 py-1 rounded border border-green-200 font-bold transition-colors">
              <CheckCircleIcon className="w-4 h-4" /> OK
            </button>
          )}
          {item.status !== ChecklistStatus.Pending && (
            <button onClick={() => handleStatusChange(ChecklistStatus.Pending)} className="flex items-center gap-1 text-yellow-600 hover:bg-yellow-50 px-2 py-1 rounded border border-yellow-200 font-bold transition-colors">
              <ExclamationCircleIcon className="w-4 h-4" /> FALTA
            </button>
          )}
          {item.status !== ChecklistStatus.Defective && (
              <button onClick={() => handleStatusChange(ChecklistStatus.Defective)} className="flex items-center gap-1 text-red-600 hover:bg-red-50 px-2 py-1 rounded border border-red-200 font-bold transition-colors">
                  <ExclamationCircleIcon className="w-4 h-4" /> ASTECA
              </button>
          )}
        </div>
      </div>

      {viewingMediaIndex !== null && (
        <Modal onClose={() => setViewingMediaIndex(null)} fullScreen={true}>
            <div className="w-full h-full flex flex-col items-center justify-center relative touch-none">
                <div 
                    className="flex-grow w-full h-full flex items-center justify-center overflow-hidden bg-black/90 pb-20"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                >
                    {currentMedia?.type === 'image' ? (
                       <DriveImage 
                           driveUrl={currentMedia.url} 
                           alt={currentMedia.name} 
                           className="transition-transform duration-75 ease-out select-none"
                           style={{ 
                               transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
                               cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                               maxHeight: '100%',
                               maxWidth: '100%',
                               objectFit: 'contain'
                           }}
                       />
                    ) : (
                       <video src={getDisplayableDriveUrl(currentMedia?.url || '') ?? ''} controls autoPlay className="max-w-full max-h-full object-contain" />
                    )}
                </div>
                <div className="absolute bottom-20 left-4 right-4 z-50 pointer-events-auto">
                    <input
                        type="text"
                        value={currentMedia?.observation || ''}
                        onChange={(e) => handleMediaObservationChange(e.target.value)}
                        placeholder="Adicionar observação nesta foto..."
                        className="w-full bg-black/60 text-white placeholder-slate-300 border border-slate-500 rounded-lg p-3 shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm font-normal"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
                <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none z-40">
                    <div className="bg-black/40 text-white px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm shadow-sm pointer-events-auto">
                        {viewingMediaIndex.index + 1} / {viewingMediaIndex.list.length}
                    </div>
                </div>
                {viewingMediaIndex.list.length > 1 && zoomLevel === 1 && (
                    <>
                        <button onClick={(e) => { e.stopPropagation(); handlePrevMedia(); }} className="absolute left-2 top-1/2 -translate-y-1/2 p-3 bg-black/30 text-white/80 rounded-full hover:bg-black/50 z-40 backdrop-blur-sm">
                            <ChevronLeftIcon className="w-8 h-8" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleNextMedia(); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-black/30 text-white/80 rounded-full hover:bg-black/50 z-40 backdrop-blur-sm">
                            <ChevronRightIcon className="w-8 h-8" />
                        </button>
                    </>
                )}
                {currentMedia?.type === 'image' && (
                    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 bg-black/50 p-2 rounded-full z-40 backdrop-blur-md pointer-events-auto">
                        <button onClick={handleZoomOut} className="p-2 text-white hover:text-blue-200 active:scale-90 transition-transform"><ZoomOutIcon className="w-6 h-6"/></button>
                        <button onClick={handleResetZoom} className="p-2 text-white hover:text-blue-200 active:scale-90 transition-transform"><RefreshIcon className="w-6 h-6"/></button>
                        <button onClick={handleZoomIn} className="p-2 text-white hover:text-blue-200 active:scale-90 transition-transform"><ZoomInIcon className="w-6 h-6"/></button>
                    </div>
                )}
            </div>
        </Modal>
      )}
    </div>
  );
};

export default ChecklistItemComponent;
