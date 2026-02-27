
import React, { useState, useEffect, useRef } from 'react';
import { Client, VisitLog, Media } from '../types';
import { SCRIPT_URL, generateUUID } from '../App';
import Modal from './Modal';
import { 
  CameraIcon, 
  TrashIcon, 
  VideoCameraIcon, 
  CalendarIcon, 
  DocumentTextIcon, 
  PlusCircleIcon,
  UserIcon,
  ClipboardListIcon,
  PaperClipIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  RefreshIcon
} from './icons';
import { fetchWithRetry } from '../utils/api';

// --- Helpers reused ---
const getDisplayableDriveUrl = (url: string): string => {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
  const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
  const match = url.match(driveRegex);
  if (match && match[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  if (!url.includes('/') && url.length > 20) return `https://lh3.googleusercontent.com/d/${url}`;
  return url;
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// Client-side image compression function
const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    // If it's not an image (e.g. video), return original base64
    if (!file.type.startsWith('image/')) {
       const reader = new FileReader();
       reader.readAsDataURL(file);
       reader.onload = () => resolve({ base64: reader.result as string, mimeType: file.type });
       reader.onerror = error => reject(error);
       return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Resize logic: Max dimension 1280px
      const MAX_SIZE = 1280;
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      // Compress to JPEG with 0.6 quality
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
      resolve({ base64: compressedBase64, mimeType: 'image/jpeg' });
    };
    
    reader.readAsDataURL(file);
  });
};

interface VisitManagerProps {
  client: Client;
  onUpdateClient: (client: Client) => void;
}

const VisitManager: React.FC<VisitManagerProps> = ({ client, onUpdateClient }) => {
  const [newVisitDate, setNewVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [newVisitNotes, setNewVisitNotes] = useState('');
  const [newVisitResponsible, setNewVisitResponsible] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const [uploadingVisitIds, setUploadingVisitIds] = useState<string[]>([]);
  const [mediaViewer, setMediaViewer] = useState<{ list: Media[], index: number, visitId: string } | null>(null);
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Zoom State
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Touch Handling State
  const lastTouchRef = useRef<{ x: number, y: number } | null>(null);
  const startPinchDistRef = useRef<number | null>(null);
  const startZoomLevelRef = useRef<number>(1);
  const swipeStartRef = useRef<{ x: number, y: number } | null>(null);

  // Reset zoom when switching images
  useEffect(() => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  }, [mediaViewer?.index]);

  const sortedVisits = [...client.visitLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleAddVisit = (e: React.FormEvent) => {
      e.preventDefault();
      if (newVisitDate) {
          // Adjust date to be UTC midnight
          const dateParts = newVisitDate.split('-').map(Number);
          const utcDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));

          const newLog: VisitLog = {
              id: generateUUID(),
              date: utcDate.toISOString(),
              notes: newVisitNotes.trim(),
              responsible: newVisitResponsible.trim(),
              media: [],
              requests: ''
          };
          onUpdateClient({ ...client, visitLogs: [newLog, ...client.visitLogs] });
          setNewVisitNotes('');
          setNewVisitResponsible('');
          setIsAdding(false);
      }
  };

  const handleUpdateVisit = (updatedVisit: VisitLog) => {
      const updatedLogs = client.visitLogs.map(log => log.id === updatedVisit.id ? updatedVisit : log);
      onUpdateClient({ ...client, visitLogs: updatedLogs });
  };

  const handleDeleteVisit = (id: string) => {
      if (window.confirm("Tem certeza que deseja excluir este registro de visita?")) {
          const updatedLogs = client.visitLogs.filter(log => log.id !== id);
          onUpdateClient({ ...client, visitLogs: updatedLogs });
      }
  };

  const handleMediaObservationChange = (text: string) => {
    if (!mediaViewer) return;
    const visit = client.visitLogs.find(v => v.id === mediaViewer.visitId);
    if (!visit) return;

    const updatedMediaList = [...visit.media];
    updatedMediaList[mediaViewer.index] = { ...updatedMediaList[mediaViewer.index], observation: text };
    
    handleUpdateVisit({ ...visit, media: updatedMediaList });
    
    // Update local viewer state to reflect change immediately
    setMediaViewer({ ...mediaViewer, list: updatedMediaList });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, visit: VisitLog) => {
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

    // Optimistic Update
    const optimisticMedia = [...(visit.media || []), tempMedia];
    handleUpdateVisit({ ...visit, media: optimisticMedia });
    setUploadingVisitIds(prev => [...prev, visit.id]);

    try {
      // Compress image
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

      const finalMedia = { ...tempMedia, url: result.url };
      URL.revokeObjectURL(localUrl);
      
      const finalMediaList = optimisticMedia.map(m => m.id === tempId ? finalMedia : m);
      handleUpdateVisit({ ...visit, media: finalMediaList });

    } catch (error: any) {
        alert(`Erro ao enviar arquivo: ${error.message}`);
        URL.revokeObjectURL(localUrl);
        const revertedMedia = optimisticMedia.filter(m => m.id !== tempId);
        handleUpdateVisit({ ...visit, media: revertedMedia });
    } finally {
        setUploadingVisitIds(prev => prev.filter(id => id !== visit.id));
    }
  };

  // --- PDF GENERATION: RELATÓRIO GERAL (TIMELINE) ---
  const generateTimelineReport = async () => {
    // Basic timeline logic preserved
    setIsGenerating(true);
    if (!(window as any).jspdf) {
        alert("Biblioteca PDF não carregada.");
        setIsGenerating(false);
        return;
    }

    try {
        const { jsPDF } = (window as any).jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 15;
        let yPos = margin;

        const checkPageBreak = (needed = 20) => {
            if (yPos + needed > pageHeight - margin) {
                pdf.addPage();
                yPos = margin;
                return true;
            }
            return false;
        }

        // Title
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(18);
        pdf.text(`Relatório de Visitas`, margin, yPos);
        yPos += 8;

        // Client Info
        pdf.setFontSize(12);
        pdf.text(`Cliente: ${client.name}`, margin, yPos);
        yPos += 6;
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Endereço: ${client.address}`, margin, yPos);
        yPos += 6;
        pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
        yPos += 10;
        
        pdf.setLineWidth(0.5);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;

        if (sortedVisits.length === 0) {
             pdf.setFont('helvetica', 'italic');
             pdf.text("Nenhuma visita registrada.", margin, yPos);
        }

        for (const visit of sortedVisits) {
            checkPageBreak(30);

            // Date & Responsible Header
            const dateStr = new Date(visit.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setFillColor(241, 245, 249); // slate-100 equivalent
            pdf.rect(margin, yPos, pageWidth - margin * 2, 8, 'F');
            pdf.text(dateStr, margin + 2, yPos + 5.5);
            
            if (visit.responsible) {
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'italic');
                pdf.text(`Responsável: ${visit.responsible}`, pageWidth - margin - 2, yPos + 5.5, { align: 'right' });
            }
            yPos += 12;

            // Notes
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            const notesText = `Notas: ${visit.notes}`;
            const splitNotes = pdf.splitTextToSize(notesText, pageWidth - margin * 2);
            pdf.text(splitNotes, margin, yPos);
            yPos += splitNotes.length * 5 + 2;

            // Requests (if any)
            if (visit.requests) {
                checkPageBreak(20);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(234, 88, 12); // Orange-600
                pdf.text("Solicitações / Requisições:", margin, yPos);
                yPos += 5;
                pdf.setTextColor(0);
                pdf.setFont('helvetica', 'normal');
                
                const splitRequests = pdf.splitTextToSize(visit.requests, pageWidth - margin * 2);
                pdf.text(splitRequests, margin, yPos);
                yPos += splitRequests.length * 5 + 2;
            }

            // Images logic simplified for general report (stacking vertically)
            const images = (visit.media || []).filter(m => m.type === 'image');
            if (images.length > 0) {
                yPos += 5;
                // REDUZIDO DE 50 PARA 25 PARA ECONOMIZAR PAPEL
                const imgSize = 25; 
                
                for (const img of images) {
                    let blockHeight = imgSize + 5;
                    checkPageBreak(blockHeight);
                    
                    try {
                        const url = getDisplayableDriveUrl(img.url);
                        const resp = await fetch(url);
                        const blob = await resp.blob();
                        const base64 = await blobToBase64(blob);
                        const format = blob.type.split('/')[1]?.toUpperCase() || 'JPEG';
                        
                        pdf.addImage(base64, format, margin, yPos, imgSize, imgSize, undefined, 'FAST');
                        
                        if (img.observation) {
                            pdf.setFontSize(9);
                            pdf.text(`Obs: ${img.observation}`, margin + imgSize + 5, yPos + 5, { maxWidth: pageWidth - margin*2 - imgSize - 5 });
                        }
                        
                        yPos += imgSize + 5;
                    } catch (e) {}
                }
            }
            yPos += 5;
        }

        pdf.save(`visitas-${client.name.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
        console.error(e);
        alert("Erro ao gerar PDF.");
    } finally {
        setIsGenerating(false);
    }
  };

  // --- PDF GENERATION: VISITA INDIVIDUAL (LAYOUT EM CARDS) ---
  const generateSingleVisitReport = async (visit: VisitLog) => {
    setIsGenerating(true);
    if (!(window as any).jspdf) {
        alert("Biblioteca PDF não carregada. Tente recarregar a página.");
        setIsGenerating(false);
        return;
    }

    try {
        const { jsPDF } = (window as any).jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 15;
        let yPos = margin;

        const checkPageBreak = (needed = 20) => {
            if (yPos + needed > pageHeight - margin) {
                pdf.addPage();
                yPos = margin;
                return true;
            }
            return false;
        }

        // Title
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(18);
        pdf.text("Relatório de Visita", margin, yPos);
        yPos += 8;

        // Client Info
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Cliente: ${client.name}`, margin, yPos);
        yPos += 6;
        pdf.setFontSize(10);
        pdf.text(`Endereço: ${client.address}`, margin, yPos);
        yPos += 6;
        pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
        yPos += 10;
        
        pdf.setLineWidth(0.5);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;

        // --- Visit Details Block ---

        // Date & Responsible Header
        const dateStr = new Date(visit.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.setFillColor(241, 245, 249); // slate-100 equivalent
        pdf.rect(margin, yPos, pageWidth - margin * 2, 8, 'F');
        pdf.text(dateStr, margin + 2, yPos + 5.5);
        
        if (visit.responsible) {
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'italic');
            pdf.text(`Responsável: ${visit.responsible}`, pageWidth - margin - 2, yPos + 5.5, { align: 'right' });
        }
        yPos += 12;

        // Notes
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(11);
        const notesText = `Notas: ${visit.notes}`;
        const splitNotes = pdf.splitTextToSize(notesText, pageWidth - margin * 2);
        pdf.text(splitNotes, margin, yPos);
        yPos += splitNotes.length * 5 + 2;

        // Requests (if any)
        if (visit.requests) {
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(234, 88, 12); // Orange-600
            pdf.text("Solicitações / Requisições:", margin, yPos);
            yPos += 5;
            pdf.setTextColor(0);
            pdf.setFont('helvetica', 'normal');
            
            const splitRequests = pdf.splitTextToSize(visit.requests, pageWidth - margin * 2);
            pdf.text(splitRequests, margin, yPos);
            yPos += splitRequests.length * 5 + 2;
        }

        // --- Images Section (Card Layout) ---
        const images = (visit.media || []).filter(m => m.type === 'image');
        if (images.length > 0) {
            yPos += 5;
            // REDUZIDO DE 60 PARA 35 PARA ECONOMIZAR PAPEL
            const imgWidth = 35; 
            const gap = 5;
            const textX = margin + imgWidth + gap;
            const textMaxWidth = pageWidth - margin - textX - 2; // Available width for text
            
            for (const img of images) {
                // Calculate required height
                let obsLines: string[] = [];
                let textHeight = 0;
                
                if (img.observation) {
                    pdf.setFontSize(9); // Font menor
                    pdf.setFont('helvetica', 'normal');
                    obsLines = pdf.splitTextToSize(img.observation, textMaxWidth);
                    textHeight = (obsLines.length * 4); // Approx 4mm per line
                }

                // Minimum height is image height, expand if text is longer
                const contentHeight = Math.max(imgWidth, textHeight); // Assuming square image aspect ratio for layout calc
                const cardHeight = contentHeight + 6; // Compact padding

                checkPageBreak(cardHeight + 5);

                // Draw Card Border
                pdf.setDrawColor(200);
                pdf.setLineWidth(0.2);
                pdf.setFillColor(255, 255, 255);
                pdf.rect(margin, yPos, pageWidth - margin * 2, cardHeight);

                try {
                    const url = getDisplayableDriveUrl(img.url);
                    const resp = await fetch(url);
                    const blob = await resp.blob();
                    const base64 = await blobToBase64(blob);
                    const format = blob.type.split('/')[1]?.toUpperCase() || 'JPEG';
                    
                    // Draw Image on Left (with 3mm padding)
                    // We constrain the image to fit within the imgWidth x imgWidth box
                    const props = pdf.getImageProperties(base64);
                    const ratio = props.width / props.height;
                    let drawW = imgWidth;
                    let drawH = imgWidth / ratio;
                    
                    // If height exceeds width box (portrait), constrain height
                    if (drawH > imgWidth) {
                        drawH = imgWidth;
                        drawW = imgWidth * ratio;
                    }

                    // Center image in its space vertically/horizontally
                    const imgX = margin + 3 + (imgWidth - drawW) / 2;
                    const imgY = yPos + 3 + (imgWidth - drawH) / 2;

                    pdf.addImage(base64, format, imgX, imgY, drawW, drawH, undefined, 'FAST');
                    
                    // Draw Text on Right
                    if (img.observation && obsLines.length > 0) {
                        pdf.setTextColor(50);
                        // Vertical alignment of text: start 3mm from top
                        pdf.text(obsLines, textX, yPos + 6);
                        pdf.setTextColor(0);
                    } else {
                        // Placeholder if no text
                        pdf.setFontSize(8);
                        pdf.setTextColor(150);
                        pdf.text("Sem observações.", textX, yPos + 8);
                        pdf.setTextColor(0);
                    }

                } catch (e) {
                    console.error("Erro ao adicionar imagem ao PDF", e);
                    pdf.setFontSize(8);
                    pdf.setTextColor(150);
                    pdf.text("[Imagem indisponível]", margin + 5, yPos + 8);
                    pdf.setTextColor(0);
                }
                
                yPos += cardHeight + 3; // Reduced spacing between cards
            }
        }

        const safeDate = dateStr.replace(/\//g, '-');
        pdf.save(`visita-${client.name.replace(/\s+/g, '_')}-${safeDate}.pdf`);

    } catch(e) {
        console.error(e);
        alert("Erro ao gerar PDF de visita.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleNextMedia = () => {
    if (!mediaViewer) return;
    setMediaViewer(prev => {
        if (!prev) return null;
        return { ...prev, index: (prev.index + 1) % prev.list.length };
    });
  };

  const handlePrevMedia = () => {
    if (!mediaViewer) return;
    setMediaViewer(prev => {
        if (!prev) return null;
        return { ...prev, index: (prev.index - 1 + prev.list.length) % prev.list.length };
    });
  };
  
    // Zoom Handlers
   const handleZoomIn = () => {
      setZoomLevel(prev => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
      setZoomLevel(prev => {
          const newZoom = Math.max(prev - 0.5, 1);
          if (newZoom === 1) setPanPosition({ x: 0, y: 0 });
          return newZoom;
      });
  };

  const handleResetZoom = () => {
      setZoomLevel(1);
      setPanPosition({ x: 0, y: 0 });
  };

  // --- TOUCH HANDLERS ---
  const getDistance = (touch1: React.Touch, touch2: React.Touch) => {
      return Math.sqrt(Math.pow(touch1.clientX - touch2.clientX, 2) + Math.pow(touch1.clientY - touch2.clientY, 2));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
          const dist = getDistance(e.touches[0], e.touches[1]);
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
          const dist = getDistance(e.touches[0], e.touches[1]);
          const scaleFactor = dist / startPinchDistRef.current;
          const newZoom = Math.max(1, Math.min(startZoomLevelRef.current * scaleFactor, 5));
          setZoomLevel(newZoom);
          if (newZoom === 1) setPanPosition({ x: 0, y: 0 });
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
      lastTouchRef.current = null;
      startPinchDistRef.current = null;

      if (zoomLevel === 1 && swipeStartRef.current && e.changedTouches.length === 1) {
          const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
          const dx = touchEnd.x - swipeStartRef.current.x;
          const dy = touchEnd.y - swipeStartRef.current.y;

          if (Math.abs(dx) > 50 && Math.abs(dy) < 50) {
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

  const handleMouseUp = () => setIsDragging(false);

  const currentMedia = mediaViewer ? mediaViewer.list[mediaViewer.index] : null;

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center border-b border-slate-200 pb-3">
           <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
               <UserIcon className="w-5 h-5" />
               Histórico de Visitas ({client.visitLogs.length})
           </h3>
           <div className="flex gap-2">
               {client.visitLogs.length > 0 && (
                   <button 
                    onClick={generateTimelineReport}
                    disabled={isGenerating}
                    className="text-sm bg-slate-100 text-slate-700 px-3 py-2 rounded hover:bg-slate-200 flex items-center gap-1 disabled:opacity-50"
                   >
                       <DocumentTextIcon className="w-4 h-4" /> {isGenerating ? 'Gerando...' : 'Relatório Geral'}
                   </button>
               )}
               <button 
                onClick={() => setIsAdding(!isAdding)}
                className="text-sm bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 flex items-center gap-1"
               >
                   <PlusCircleIcon className="w-4 h-4" /> Nova Visita
               </button>
           </div>
       </div>

       {isAdding && (
           <form onSubmit={handleAddVisit} className="bg-slate-50 p-4 rounded-lg border border-blue-100 animate-fadeIn">
               {/* ... (Form content unchanged) ... */}
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-3">
                    <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-slate-500 mb-1">DATA</label>
                        <input
                            type="date"
                            value={newVisitDate}
                            onChange={e => setNewVisitDate(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded"
                            required
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1">RESPONSÁVEL</label>
                        <input
                            type="text"
                            value={newVisitResponsible}
                            onChange={e => setNewVisitResponsible(e.target.value)}
                            placeholder="Nome do responsável..."
                            className="w-full p-2 border border-slate-300 rounded"
                        />
                    </div>
                    <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-slate-500 mb-1">RESUMO / ANOTAÇÕES</label>
                        <input
                            type="text"
                            value={newVisitNotes}
                            onChange={e => setNewVisitNotes(e.target.value)}
                            placeholder="Ex: Medição inicial, verificação de parede..."
                            className="w-full p-2 border border-slate-300 rounded"
                            required
                        />
                    </div>
               </div>
               <div className="flex justify-end gap-2">
                   <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-1 bg-slate-200 rounded text-slate-700">Cancelar</button>
                   <button type="submit" className="px-3 py-1 bg-blue-600 rounded text-white">Salvar Visita</button>
               </div>
           </form>
       )}

       <div className="space-y-4">
           {sortedVisits.map(visit => {
               const isExpanded = expandedVisitId === visit.id;
               const images = (visit.media || []).filter(m => m.type === 'image');

               return (
                   <div key={visit.id} className={`bg-white border rounded-lg transition-all ${isExpanded ? 'border-blue-300 shadow-md' : 'border-slate-200'}`}>
                       {/* ... (List Item Header unchanged) ... */}
                        <div 
                        className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 rounded-t-lg"
                        onClick={() => setExpandedVisitId(isExpanded ? null : visit.id)}
                       >
                           <div className="flex items-center gap-4">
                               <div className="flex flex-col items-center bg-slate-100 p-2 rounded min-w-[60px]">
                                   <CalendarIcon className="w-5 h-5 text-slate-500"/>
                                   <span className="text-xs font-bold text-slate-700 mt-1">
                                       {new Date(visit.date).toLocaleDateString('pt-BR', {timeZone: 'UTC', day:'2-digit', month:'2-digit'})}
                                   </span>
                               </div>
                               <div>
                                   <div className="flex items-center gap-2">
                                       <p className="font-semibold text-slate-800">{visit.notes}</p>
                                       {visit.responsible && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{visit.responsible}</span>}
                                   </div>
                                   <div className="flex gap-3 mt-1 text-xs text-slate-500">
                                       {visit.requests && <span className="text-orange-600 font-medium flex items-center gap-1"><ClipboardListIcon className="w-3 h-3"/> Tem Solicitações</span>}
                                       {images.length > 0 && <span className="text-blue-600 font-medium flex items-center gap-1"><CameraIcon className="w-3 h-3"/> {images.length} Fotos</span>}
                                   </div>
                               </div>
                           </div>
                           <div className="text-slate-400">
                               {isExpanded ? '▼' : '▶'}
                           </div>
                       </div>

                       {isExpanded && (
                           <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-lg space-y-4">
                               {/* ... (Visit details form) ... */}
                               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">OBSERVAÇÕES DA VISITA</label>
                                        <textarea
                                            value={visit.notes}
                                            onChange={e => handleUpdateVisit({...visit, notes: e.target.value})}
                                            className="w-full p-2 border border-slate-300 rounded text-sm resize-none"
                                            rows={2}
                                        />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">RESPONSÁVEL</label>
                                        <input
                                            type="text"
                                            value={visit.responsible || ''}
                                            onChange={e => handleUpdateVisit({...visit, responsible: e.target.value})}
                                            className="w-full p-2 border border-slate-300 rounded text-sm"
                                            placeholder="Nome do responsável"
                                        />
                                    </div>
                               </div>
                               
                               <div>
                                   <label className="block text-xs font-bold text-orange-600 mb-1 flex items-center gap-1">
                                       <ClipboardListIcon className="w-4 h-4"/> SOLICITAÇÕES / REQUISIÇÕES
                                   </label>
                                   <textarea
                                       value={visit.requests || ''}
                                       onChange={e => handleUpdateVisit({...visit, requests: e.target.value})}
                                       className="w-full p-2 border border-orange-200 bg-orange-50 rounded text-sm focus:ring-orange-400 focus:border-orange-400 resize-none"
                                       placeholder="Liste materiais ou solicitações necessárias..."
                                       rows={3}
                                   />
                               </div>

                               <div>
                                   <label className="block text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                                       <PaperClipIcon className="w-4 h-4"/> ANEXOS DA VISITA
                                   </label>
                                   <div className="flex flex-wrap gap-2">
                                       {(visit.media || []).map((m, idx) => (
                                           <div key={m.id} className="relative w-20 h-20 group">
                                               <img 
                                                   src={m.type === 'video' ? '' : getDisplayableDriveUrl(m.url)} 
                                                   className="w-full h-full object-cover rounded border border-slate-300 cursor-pointer hover:opacity-90"
                                                   onClick={() => setMediaViewer({ list: visit.media, index: idx, visitId: visit.id })}
                                               />
                                               <button 
                                                   onClick={() => {
                                                       if(window.confirm('Remover anexo?')) {
                                                           handleUpdateVisit({...visit, media: visit.media.filter(x => x.id !== m.id)})
                                                       }
                                                   }}
                                                   className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                               >
                                                   &times;
                                               </button>
                                           </div>
                                       ))}
                                       <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded cursor-pointer hover:bg-slate-100 hover:border-blue-400 transition-colors">
                                           <CameraIcon className="w-6 h-6 text-slate-400"/>
                                           <span className="text-[10px] text-slate-500 mt-1">Adicionar</span>
                                           <input type="file" className="hidden" accept="image/*,video/*" onChange={(e) => handleFileChange(e, visit)} />
                                       </label>
                                       {uploadingVisitIds.includes(visit.id) && <span className="text-xs text-slate-500 self-center animate-pulse">Enviando...</span>}
                                   </div>
                               </div>

                               <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                                   <button onClick={() => handleDeleteVisit(visit.id)} className="text-red-500 text-sm hover:underline flex items-center gap-1">
                                       <TrashIcon className="w-4 h-4"/> Excluir Visita
                                   </button>
                                   <button onClick={() => generateSingleVisitReport(visit)} className="bg-slate-800 text-white px-3 py-1.5 rounded text-sm hover:bg-slate-900 flex items-center gap-2 shadow-sm">
                                       <DocumentTextIcon className="w-4 h-4"/> Relatório Visita
                                   </button>
                               </div>
                           </div>
                       )}
                   </div>
               )
           })}
           {sortedVisits.length === 0 && <p className="text-center text-slate-400 py-4">Nenhuma visita registrada.</p>}
       </div>

       {currentMedia && (
        <Modal onClose={() => setMediaViewer(null)} fullScreen={true}>
            <div className="w-full h-full flex flex-col items-center justify-center relative touch-none">
                
                {/* Media Container with Touch Listeners */}
                <div 
                    className="flex-grow w-full h-full flex items-center justify-center overflow-hidden bg-black/90 pb-20" // Padding for input
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {currentMedia.type === 'image' ? (
                       <img 
                           src={getDisplayableDriveUrl(currentMedia.url)} 
                           alt={currentMedia.name} 
                           className="transition-transform duration-75 ease-out select-none"
                           style={{ 
                               transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
                               cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                               maxHeight: '100%',
                               maxWidth: '100%',
                               objectFit: 'contain'
                           }}
                           draggable={false}
                       />
                    ) : (
                       <video src={getDisplayableDriveUrl(currentMedia.url) ?? ''} controls autoPlay className="max-w-full max-h-full object-contain" />
                    )}
                </div>

                {/* Specific Observation Input */}
                <div className="absolute bottom-20 left-4 right-4 z-50 pointer-events-auto">
                    <input
                        type="text"
                        value={currentMedia.observation || ''}
                        onChange={(e) => handleMediaObservationChange(e.target.value)}
                        placeholder="Adicionar observação nesta foto..."
                        className="w-full bg-black/60 text-white placeholder-slate-300 border border-slate-500 rounded-lg p-3 shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>

                {/* Counter */}
                <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none z-40">
                    <div className="bg-black/40 text-white px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm shadow-sm pointer-events-auto">
                        {mediaViewer!.index + 1} / {mediaViewer!.list.length}
                    </div>
                </div>

                {/* Nav Arrows */}
                {mediaViewer!.list.length > 1 && zoomLevel === 1 && (
                    <>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handlePrevMedia(); }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-3 bg-black/30 text-white/80 rounded-full hover:bg-black/50 z-40 backdrop-blur-sm"
                        >
                            <ChevronLeftIcon className="w-8 h-8" />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleNextMedia(); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-black/30 text-white/80 rounded-full hover:bg-black/50 z-40 backdrop-blur-sm"
                        >
                            <ChevronRightIcon className="w-8 h-8" />
                        </button>
                    </>
                )}

                {/* Zoom Controls */}
                {currentMedia.type === 'image' && (
                    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 bg-black/50 p-2 rounded-full z-40 backdrop-blur-md pointer-events-auto">
                        <button onClick={handleZoomOut} className="p-2 text-white hover:text-blue-200 active:scale-90 transition-transform">
                            <ZoomOutIcon className="w-6 h-6"/>
                        </button>
                        <button onClick={handleResetZoom} className="p-2 text-white hover:text-blue-200 active:scale-90 transition-transform">
                            <RefreshIcon className="w-6 h-6"/>
                        </button>
                        <button onClick={handleZoomIn} className="p-2 text-white hover:text-blue-200 active:scale-90 transition-transform">
                            <ZoomInIcon className="w-6 h-6"/>
                        </button>
                    </div>
                )}
            </div>
        </Modal>
      )}
    </div>
  );
};

export default VisitManager;
