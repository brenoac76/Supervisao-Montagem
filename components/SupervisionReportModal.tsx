
import React, { useState, useMemo, useRef } from 'react';
import { Client, Assembler, SupervisionReport, Media } from '../types';
import Modal from './Modal';
import { 
  PrinterIcon, 
  CheckCircleIcon, 
  XIcon, 
  PlusCircleIcon, 
  CalendarIcon, 
  UserIcon, 
  ArrowLeftIcon, 
  TrashIcon, 
  CameraIcon,
  ZoomInIcon,
  ZoomOutIcon,
  RefreshIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from './icons';
import { jsPDF } from 'jspdf';
import { SCRIPT_URL, generateUUID } from '../App';
import { fetchWithRetry } from '../utils/api';

interface SupervisionReportModalProps {
  client: Client;
  assemblers: Assembler[];
  onClose: () => void;
  onUpdateClient: (client: Client) => void;
}

const INSPECTION_ITEMS = [
  "ORGANIZAÇÃO",
  "LIMPEZA",
  "HORÁRIO",
  "UNIFORME",
  "O.C. / O.A. / O.T. / TODES",
  "ACABAMENTO",
  "TAPA FURO",
  "REGULAGENS"
];

// Helpers
const getDisplayableDriveUrl = (url: string): string => {
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
    const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
    const match = url.match(driveRegex);
    if (match && match[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
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

const SupervisionReportModal: React.FC<SupervisionReportModalProps> = ({ client, assemblers, onClose, onUpdateClient }) => {
  const [viewMode, setViewMode] = useState<'LIST' | 'FORM'>('LIST');
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [assemblerId, setAssemblerId] = useState('');
  const [items, setItems] = useState<Record<string, 'C' | 'NC' | null>>(
    INSPECTION_ITEMS.reduce((acc, item) => ({ ...acc, [item]: null }), {})
  );
  const [observations, setObservations] = useState('');
  const [reportMedia, setReportMedia] = useState<Media[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ImageViewer State
  const [mediaViewer, setMediaViewer] = useState<{ list: Media[], index: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });

  const sortedReports = useMemo(() => {
      return [...(client.supervisionReports || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [client.supervisionReports]);

  const handleToggle = (item: string, type: 'C' | 'NC') => {
    setItems(prev => ({
        ...prev,
        [item]: prev[item] === type ? null : type
    }));
  };

  const filteredAssemblers = assemblers.filter(a => {
      const r = (a.role || '').toLowerCase();
      return !r.includes('ajudante') && !r.includes('auxiliar');
  }).sort((a, b) => a.name.localeCompare(b.name));

  const startNewReport = () => {
      setEditingReportId(null);
      setDate(new Date().toISOString().split('T')[0]);
      setAssemblerId('');
      setItems(INSPECTION_ITEMS.reduce((acc, item) => ({ ...acc, [item]: null }), {}));
      setObservations('');
      setReportMedia([]);
      setViewMode('FORM');
  };

  const openExistingReport = (report: SupervisionReport) => {
      setEditingReportId(report.id);
      setDate(report.date);
      setAssemblerId(report.assemblerId);
      setItems(report.items);
      setObservations(report.observations);
      setReportMedia(report.media || []);
      setViewMode('FORM');
  };

  const deleteReport = (reportId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (window.confirm("Deseja excluir este registro de supervisão?")) {
          const updated = (client.supervisionReports || []).filter(r => r.id !== reportId);
          onUpdateClient({ ...client, supervisionReports: updated });
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const tempId = generateUUID();
    const localUrl = URL.createObjectURL(file);
    const tempMedia: Media = { id: tempId, type: 'image', url: localUrl, name: file.name };
    
    // Otimista
    setReportMedia(prev => [...prev, tempMedia]);

    try {
      const { base64: base64Data, mimeType } = await compressImage(file);
      const response = await fetchWithRetry(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'UPLOAD_FILE', data: { base64Data, fileName: file.name, mimeType: mimeType } }),
      });
      const result = await response.json();
      if (!result.success || !result.url) throw new Error(result.message || 'Falha no upload');
      
      setReportMedia(prev => prev.map(m => m.id === tempId ? { ...m, url: result.url } : m));
    } catch (error: any) {
        alert(`Erro no upload: ${error.message}`);
        setReportMedia(prev => prev.filter(m => m.id !== tempId));
    } finally {
        setUploading(false);
        if(fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeMedia = (id: string) => {
      if(window.confirm("Remover foto?")) {
          setReportMedia(prev => prev.filter(m => m.id !== id));
      }
  };

  const handleSaveData = () => {
      const selectedAssembler = assemblers.find(a => a.id === assemblerId);
      const reportData: SupervisionReport = {
          id: editingReportId || generateUUID(),
          date,
          assemblerId,
          assemblerName: selectedAssembler?.name || 'Não informado',
          items,
          observations,
          media: reportMedia
      };
      
      let updatedReports: SupervisionReport[];
      if (editingReportId) {
          updatedReports = (client.supervisionReports || []).map(r => r.id === editingReportId ? reportData : r);
      } else {
          updatedReports = [reportData, ...(client.supervisionReports || [])];
      }
      
      onUpdateClient({ ...client, supervisionReports: updatedReports });
      alert("Relatório salvo com sucesso!");
      setViewMode('LIST');
  };

  const handleGeneratePdf = async () => {
    setIsGenerating(true);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = Number(pdf.internal.pageSize.getWidth());
    const pageHeight = Number(pdf.internal.pageSize.getHeight());
    const margin = 10;
    let y = margin;

    const selectedAssembler = assemblers.find(a => a.id === assemblerId);

    // --- Header Logo ---
    try {
        const logoRes = await fetch(`${SCRIPT_URL}?action=GET_LOGO`).then(r => r.json());
        if (logoRes.success && logoRes.url) {
            const displayUrl = getDisplayableDriveUrl(logoRes.url);
            const imgResponse = await fetch(displayUrl);
            const imgBlob = await imgResponse.blob();
            const base64 = await blobToBase64(imgBlob);
            pdf.addImage(base64, 'PNG', pageWidth - margin - 35, y, 35, 12);
        }
    } catch (e) { console.error(e); }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text("RELATÓRIO ACOMPANHAMENTO - SUPERVISÃO", margin, y + 8);
    y += 20;

    // --- Basic Info Box ---
    pdf.setLineWidth(0.3);
    pdf.setFontSize(10);
    pdf.rect(margin, y, pageWidth - 2 * margin, 10);
    pdf.line(margin + 75, y, margin + 75, y + 10);
    pdf.line(margin + 150, y, margin + 150, y + 10);

    pdf.text("CLIENTE:", margin + 2, y + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.text(client.name.toUpperCase(), margin + 20, y + 6);

    pdf.setFont('helvetica', 'bold');
    pdf.text("MONTADOR:", margin + 77, y + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.text((selectedAssembler?.name || "---").toUpperCase(), margin + 102, y + 6);

    pdf.setFont('helvetica', 'bold');
    pdf.text("DATA:", margin + 152, y + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.text(new Date(date).toLocaleDateString('pt-BR', {timeZone: 'UTC'}), margin + 165, y + 6);
    y += 10;

    // --- Table Headers ---
    pdf.setFillColor(60, 60, 60);
    pdf.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
    pdf.setFont('helvetica', 'bold').setTextColor(255);
    
    const col1W = 75;
    const col2W = (pageWidth - 2 * margin - col1W) / 2;

    pdf.text("DESCRIÇÃO", margin + col1W/2, y + 5.5, { align: 'center' });
    pdf.text("CONFORMIDADE", margin + col1W + col2W/2, y + 5.5, { align: 'center' });
    pdf.text("NÃO CONFORMIDADE", margin + col1W + col2W + col2W/2, y + 5.5, { align: 'center' });
    y += 8;

    // --- Section Header: VISTORIA ---
    pdf.setFillColor(230, 230, 230);
    pdf.rect(margin, y, pageWidth - 2 * margin, 6, 'F');
    pdf.setTextColor(0).setFontSize(11);
    pdf.text("VISTORIA", pageWidth/2, y + 4.5, { align: 'center' });
    y += 6;

    // --- Rows ---
    const rowH = 7;
    pdf.setFontSize(10).setFont('helvetica', 'normal');
    INSPECTION_ITEMS.forEach(item => {
        pdf.rect(margin, y, pageWidth - 2 * margin, rowH);
        pdf.line(margin + col1W, y, margin + col1W, y + rowH);
        pdf.line(margin + col1W + col2W, y, margin + col1W + col2W, y + rowH);

        pdf.text(item, margin + 2, y + 5);

        const status = items[item];
        pdf.setFont('helvetica', 'bold').setFontSize(14);
        if (status === 'C') {
            pdf.text("X", margin + col1W + col2W/2, y + 5.5, { align: 'center' });
        } else if (status === 'NC') {
            pdf.text("X", margin + col1W + col2W + col2W/2, y + 5.5, { align: 'center' });
        }
        pdf.setFont('helvetica', 'normal').setFontSize(10);
        y += rowH;
    });

    // --- Observations ---
    pdf.setFont('helvetica', 'bold');
    const obsBoxH = 30;
    pdf.rect(margin, y, pageWidth - 2 * margin, obsBoxH);
    pdf.text("Observações:", margin + 2, y + 5);
    
    if (observations) {
        pdf.setFont('helvetica', 'normal');
        const splitObs = pdf.splitTextToSize(observations, pageWidth - 2 * margin - 6);
        pdf.text(splitObs, margin + 2, y + 10);
    }
    y += obsBoxH + 10;

    // --- Fotos (60mm x 60mm, 3 per row) ---
    if (reportMedia.length > 0) {
        pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(60);
        pdf.text("REGISTRO FOTOGRÁFICO", margin, y);
        y += 5;
        
        const imgSize = 60;
        const gap = 3;
        let col = 0;

        for (const media of reportMedia) {
            if (y + imgSize > pageHeight - margin) {
                pdf.addPage();
                y = margin;
            }

            try {
                const url = getDisplayableDriveUrl(media.url);
                const resp = await fetch(url);
                const blob = await resp.blob();
                const b64 = await blobToBase64(blob);
                
                const xPos = margin + (col * (imgSize + gap));
                pdf.addImage(b64, 'JPEG', xPos, y, imgSize, imgSize, undefined, 'FAST');
                pdf.rect(xPos, y, imgSize, imgSize); // Borda fina na foto
                
                col++;
                if (col >= 3) {
                    col = 0;
                    y += imgSize + gap;
                }
            } catch (e) { console.error(e); }
        }
    }

    pdf.save(`supervisao_${client.name.split(' ')[0]}_${date}.pdf`);
    setIsGenerating(false);
  };

  const handleNextMedia = () => setMediaViewer(prev => prev ? { ...prev, index: (prev.index + 1) % prev.list.length } : null);
  const handlePrevMedia = () => setMediaViewer(prev => prev ? { ...prev, index: (prev.index - 1 + prev.list.length) % prev.list.length } : null);

  const currentMedia = mediaViewer ? mediaViewer.list[mediaViewer.index] : null;

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col h-[85vh] font-montserrat">
        
        {/* --- HEADER --- */}
        <div className="flex-shrink-0 mb-6 border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
                {viewMode === 'FORM' && (
                    <button onClick={() => setViewMode('LIST')} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeftIcon className="w-5 h-5"/>
                    </button>
                )}
                <div>
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Relatórios de Supervisão</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {viewMode === 'LIST' ? 'Histórico de Acompanhamento' : editingReportId ? 'Editando Registro' : 'Novo Registro de Vistoria'}
                    </p>
                </div>
            </div>
            
            {viewMode === 'LIST' ? (
                <button onClick={startNewReport} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-md hover:bg-blue-700 transition-all active:scale-95">
                    <PlusCircleIcon className="w-4 h-4" /> Nova Supervisão
                </button>
            ) : (
                <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={handleSaveData} className="flex-1 sm:flex-none px-4 py-2 bg-slate-800 text-white text-[10px] font-black rounded-lg uppercase tracking-widest hover:bg-black transition-all">Salvar</button>
                    <button onClick={handleGeneratePdf} disabled={isGenerating} className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest hover:bg-blue-700 shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
                        <PrinterIcon className="w-4 h-4"/> {isGenerating ? '...' : 'Exportar PDF'}
                    </button>
                </div>
            )}
        </div>

        {/* --- CONTENT --- */}
        <div className="flex-grow overflow-y-auto pr-2 space-y-6">
            
            {viewMode === 'LIST' ? (
                <div className="space-y-3">
                    {sortedReports.length === 0 ? (
                        <div className="py-20 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                            <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 font-medium text-sm">Nenhuma supervisão registrada para esta obra.</p>
                            <button onClick={startNewReport} className="mt-4 text-blue-600 font-black text-[10px] uppercase tracking-widest hover:underline">Começar Primeira Vistoria</button>
                        </div>
                    ) : (
                        sortedReports.map(report => (
                            <div 
                                key={report.id} 
                                onClick={() => openExistingReport(report)}
                                className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                        <CalendarIcon className="w-5 h-5" />
                                        <span className="text-[8px] font-black mt-0.5">{new Date(report.date).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</span>
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{new Date(report.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</p>
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mt-0.5">
                                            <UserIcon className="w-3 h-3 text-slate-300" />
                                            <span>{report.assemblerName}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={(e) => deleteReport(report.id, e)}
                                        className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                    <div className="text-slate-300 group-hover:text-blue-500 transition-colors">
                                        <CheckCircleIcon className="w-6 h-6" />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <div className="space-y-6 animate-fadeIn">
                    {/* Header Form */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="col-span-1">
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Montador em Campo</label>
                            <select 
                                value={assemblerId} 
                                onChange={e => setAssemblerId(e.target.value)}
                                className="w-full p-2 border-2 border-slate-200 rounded-lg text-sm font-bold bg-white focus:border-blue-500 outline-none"
                            >
                                <option value="">Selecione o montador...</option>
                                {filteredAssemblers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                        <div className="col-span-1">
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Data da Supervisão</label>
                            <input 
                                type="date" 
                                value={date} 
                                onChange={e => setDate(e.target.value)}
                                className="w-full p-2 border-2 border-slate-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Checklist Table */}
                    <div className="border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-slate-800 text-white grid grid-cols-12 text-[9px] font-black uppercase tracking-widest">
                            <div className="col-span-6 p-3">Descrição</div>
                            <div className="col-span-3 p-3 text-center border-l border-slate-700">Conformidade</div>
                            <div className="col-span-3 p-3 text-center border-l border-slate-700">Não Conformidade</div>
                        </div>
                        <div className="bg-slate-200 p-2 text-center text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Vistoria</div>
                        <div className="divide-y-2 divide-slate-100">
                            {INSPECTION_ITEMS.map(item => (
                                <div key={item} className="grid grid-cols-12 items-center hover:bg-slate-50 transition-colors">
                                    <div className="col-span-6 p-4 text-xs font-black text-slate-700 uppercase tracking-tight">{item}</div>
                                    
                                    <div className="col-span-3 h-full border-l-2 border-slate-100 flex items-center justify-center">
                                        <button 
                                            onClick={() => handleToggle(item, 'C')}
                                            className={`w-full h-full min-h-[50px] flex items-center justify-center transition-all ${items[item] === 'C' ? 'bg-green-100' : ''}`}
                                        >
                                            {items[item] === 'C' && <CheckCircleIcon className="w-6 h-6 text-green-600" />}
                                            {items[item] !== 'C' && <div className="w-6 h-6 rounded border-2 border-slate-200"></div>}
                                        </button>
                                    </div>

                                    <div className="col-span-3 h-full border-l-2 border-slate-100 flex items-center justify-center">
                                        <button 
                                            onClick={() => handleToggle(item, 'NC')}
                                            className={`w-full h-full min-h-[50px] flex items-center justify-center transition-all ${items[item] === 'NC' ? 'bg-red-100' : ''}`}
                                        >
                                            {items[item] === 'NC' && <XIcon className="w-6 h-6 text-red-600" />}
                                            {items[item] !== 'NC' && <div className="w-6 h-6 rounded border-2 border-slate-200"></div>}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Observations Area */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Observações Detalhadas</label>
                            <textarea 
                                value={observations} 
                                onChange={e => setObservations(e.target.value)}
                                placeholder="Escreva aqui os detalhes da vistoria, pontos de atenção ou ajustes necessários..."
                                className="w-full p-4 border-2 border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none min-h-[120px] resize-none shadow-inner bg-slate-50/50"
                            />
                        </div>

                        {/* FOTOS SECTION (NOVO) */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Evidências Fotográficas</label>
                            <div className="flex flex-wrap gap-3">
                                {reportMedia.map((m, idx) => (
                                    <div key={m.id} className="relative w-20 h-20 group">
                                        <img 
                                            src={getDisplayableDriveUrl(m.url)} 
                                            className="w-full h-full object-cover rounded-xl border border-slate-200 cursor-pointer shadow-sm hover:shadow-md transition-all" 
                                            onClick={() => setMediaViewer({ list: reportMedia, index: idx })}
                                        />
                                        <button 
                                            onClick={() => removeMedia(m.id)}
                                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-sm font-bold border border-white"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                ))}
                                <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-white hover:border-blue-400 transition-all group">
                                    {uploading ? (
                                        <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                                    ) : (
                                        <>
                                            <CameraIcon className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
                                            <span className="text-[8px] font-black text-slate-400 mt-1 uppercase">Add Foto</span>
                                        </>
                                    )}
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} disabled={uploading} />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="flex-shrink-0 pt-4 border-t flex justify-end gap-3">
            <button onClick={onClose} className="px-6 py-2 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-colors">Fechar</button>
        </div>

        {/* Media Viewer Expansion */}
        {currentMedia && (
          <Modal onClose={() => setMediaViewer(null)} fullScreen={true}>
              <div className="w-full h-full flex flex-col items-center justify-center relative touch-none">
                  <div className="flex-grow w-full h-full flex items-center justify-center overflow-hidden">
                      <img 
                        src={getDisplayableDriveUrl(currentMedia.url)} 
                        alt={currentMedia.name} 
                        className="transition-transform duration-75 ease-out select-none max-h-full max-w-full object-contain" 
                        style={{ transform: `scale(${zoomLevel}) translate(${panPosition.x}px, ${panPosition.y}px)` }} 
                      />
                  </div>
                  {mediaViewer!.list.length > 1 && (
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 pointer-events-none">
                          <button onClick={handlePrevMedia} className="p-3 bg-black/30 text-white/80 rounded-full z-40 backdrop-blur-sm pointer-events-auto"><ChevronLeftIcon className="w-8 h-8" /></button>
                          <button onClick={handleNextMedia} className="p-3 bg-black/30 text-white/80 rounded-full z-40 backdrop-blur-sm pointer-events-auto"><ChevronRightIcon className="w-8 h-8" /></button>
                      </div>
                  )}
                  <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 bg-black/50 p-2 rounded-full z-40 backdrop-blur-md">
                      <button onClick={() => setZoomLevel(z => Math.max(1, z - 0.5))} className="p-2 text-white"><ZoomOutIcon className="w-6 h-6"/></button>
                      <button onClick={() => { setZoomLevel(1); setPanPosition({x:0, y:0}); }} className="p-2 text-white"><RefreshIcon className="w-6 h-6"/></button>
                      <button onClick={() => setZoomLevel(z => Math.min(4, z + 0.5))} className="p-2 text-white"><ZoomInIcon className="w-6 h-6"/></button>
                  </div>
              </div>
          </Modal>
        )}
      </div>
    </Modal>
  );
};

export default SupervisionReportModal;
