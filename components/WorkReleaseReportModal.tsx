import React, { useState, useRef } from 'react';
import { Client, WorkReleaseChecklist, Media } from '../types';
import Modal from './Modal';
import { CheckCircleIcon, PrinterIcon, CameraIcon, RefreshIcon, PaperClipIcon } from './icons';
import SignaturePad from './SignaturePad';
import { jsPDF } from 'jspdf';
import { SCRIPT_URL, generateUUID } from '../App';
import { fetchWithRetry } from '../utils/api';

interface WorkReleaseReportModalProps {
  client: Client;
  onClose: () => void;
  onUpdateClient: (client: Client) => void;
}

// Helpers para processamento de imagens
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

const WorkReleaseReportModal: React.FC<WorkReleaseReportModalProps> = ({ client, onClose, onUpdateClient }) => {
  const [data, setData] = useState<WorkReleaseChecklist>(() => {
    if (client.workReleaseChecklist) return client.workReleaseChecklist;
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISODate = new Date(now.getTime() - tzOffset).toISOString();
    return {
        clientName: client.name || '',
        date: localISODate.split('T')[0],
        time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        location: client.address || '',
        items: {
            power: null,
            lighting: null,
            cleanEnvironment: null,
            stonesForCutting: null,
            thirdPartiesWorking: null,
            hydraulicElectricProjects: null,
            finalPaint: null,
            windowsInstalled: null,
        },
        cuttingDate: '',
        missingWindowsDetails: '',
        media: [],
        observations: '',
        signatureBase64: ''
    };
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdate = (updates: Partial<WorkReleaseChecklist>) => {
    const newState = { ...data, ...updates };
    setData(newState);
    onUpdateClient({ ...client, workReleaseChecklist: newState });
  };

  const handleItemChange = (key: keyof WorkReleaseChecklist['items'], value: 'SIM' | 'NÃO') => {
    const newItems = { ...data.items, [key]: value };
    handleUpdate({ items: newItems });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const tempId = generateUUID();
    const localUrl = URL.createObjectURL(file);
    const tempMedia: Media = { id: tempId, type: 'image', url: localUrl, name: file.name };
    const mediaBeforeUpload = [...(data.media || []), tempMedia];
    setData(prev => ({ ...prev, media: mediaBeforeUpload }));
    try {
      const { base64: base64Data, mimeType } = await compressImage(file);
      const response = await fetchWithRetry(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'UPLOAD_FILE', data: { base64Data, fileName: file.name, mimeType: mimeType } }),
      });
      const result = await response.json();
      if (!result.success || !result.url) throw new Error(result.message || 'Falha no upload');
      const finalMedia: Media = { ...tempMedia, url: result.url };
      URL.revokeObjectURL(localUrl);
      const updatedMediaList = mediaBeforeUpload.map(m => m.id === tempId ? finalMedia : m);
      handleUpdate({ media: updatedMediaList });
    } catch (error: any) {
      alert(`Erro no upload: ${error?.message}`);
      URL.revokeObjectURL(localUrl);
      handleUpdate({ media: (data.media || []).filter(m => m.id !== tempId) });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGeneratePdf = async () => {
    if (uploading) { alert("Aguarde o upload das fotos terminar."); return; }
    setIsGenerating(true);
    try {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 12;
        let y = 12;

        // --- Logotipo Todeschini ---
        try {
            const logoRes = await fetch(`${SCRIPT_URL}?action=GET_LOGO`).then(r => r.json());
            if (logoRes.success && logoRes.url) {
                const displayUrl = getDisplayableDriveUrl(logoRes.url);
                const imgResponse = await fetch(displayUrl);
                const imgBlob = await imgResponse.blob();
                const base64 = await blobToBase64(imgBlob);
                pdf.addImage(base64, 'PNG', margin, y - 2, 40, 13);
            }
        } catch (e) { console.error("Erro ao carregar logotipo", e); }

        pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(40);
        pdf.text("LIBERAÇÃO DE OBRA - CHECKLIST", pageWidth - margin, y + 7, { align: 'right' });
        y += 18;

        // --- Informações Gerais ---
        pdf.setDrawColor(220).setFillColor(248, 250, 252).rect(margin, y, pageWidth - 2 * margin, 15, 'F');
        pdf.rect(margin, y, pageWidth - 2 * margin, 15);
        
        pdf.setFontSize(8).setTextColor(100).text("CLIENTE:", margin + 3, y + 6);
        pdf.setTextColor(0).setFont('helvetica', 'bold').text(data.clientName.toUpperCase(), margin + 18, y + 6);
        pdf.setTextColor(100).setFont('helvetica', 'normal').text("LOCAL:", margin + 3, y + 11);
        pdf.setTextColor(0).text(data.location.toUpperCase(), margin + 18, y + 11);
        
        const [year, month, day] = data.date.split('-');
        pdf.setTextColor(100).text("DATA:", pageWidth - margin - 50, y + 6);
        pdf.setTextColor(0).setFont('helvetica', 'bold').text(`${day}/${month}/${year}`, pageWidth - margin - 38, y + 6);
        pdf.setTextColor(100).setFont('helvetica', 'normal').text("HORA:", pageWidth - margin - 50, y + 11);
        pdf.setTextColor(0).text(data.time, pageWidth - margin - 38, y + 11);
        y += 20;

        // --- Itens de Verificação ---
        pdf.setFontSize(9).setFont('helvetica', 'bold').text("ITENS DE VERIFICAÇÃO", margin, y);
        y += 4;
        
        const checklistItems: Record<string, string> = {
            power: "Energia elétrica ativa?",
            lighting: "Iluminação adequada?",
            cleanEnvironment: "Ambiente limpo?",
            stonesForCutting: "Pedras para corte no local?",
            thirdPartiesWorking: "Terceiros no local?",
            hydraulicElectricProjects: "Projetos Hidro/Elétricos?",
            finalPaint: "Última demão de tinta após a obra?",
            windowsInstalled: "Todas as janelas instaladas?"
        };

        const keys = Object.keys(checklistItems);
        const colW = (pageWidth - 2 * margin) / 2;
        const rowH = 7;

        keys.forEach((key, i) => {
            const isSecondCol = i % 2 !== 0;
            const x = isSecondCol ? margin + colW : margin;
            const rowY = y + (Math.floor(i / 2) * rowH);
            
            pdf.setDrawColor(230).rect(x, rowY, colW, rowH);
            pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(50);
            pdf.text(checklistItems[key], x + 2, rowY + 4.5);
            
            const value = data.items[key as keyof WorkReleaseChecklist['items']];
            
            // --- Detalhes de Pedras ---
            if (key === 'stonesForCutting' && data.cuttingDate) {
                const prevFontSize = pdf.getFontSize();
                const prevTextColor = pdf.getTextColor();
                const [cY, cM, cD] = data.cuttingDate.split('-');
                pdf.setFontSize(6.5).setTextColor(100).setFont('helvetica', 'italic');
                pdf.text(`Previsão de corte: ${cD}/${cM}`, x + (colW / 2) + 4, rowY + 4.5, { align: 'center' });
                pdf.setFontSize(prevFontSize).setTextColor(prevTextColor).setFont('helvetica', 'bold');
            }

            // --- Detalhes de Janelas ---
            if (key === 'windowsInstalled' && data.items.windowsInstalled === 'NÃO' && data.missingWindowsDetails) {
                const prevFontSize = pdf.getFontSize();
                const prevTextColor = pdf.getTextColor();
                pdf.setFontSize(6).setTextColor(100).setFont('helvetica', 'italic');
                const winText = `Faltam: ${data.missingWindowsDetails}`;
                pdf.text(pdf.splitTextToSize(winText, 25), x + (colW / 2) + 2, rowY + 4.5, { align: 'center' });
                pdf.setFontSize(prevFontSize).setTextColor(prevTextColor).setFont('helvetica', 'bold');
            }

            pdf.setFont('helvetica', 'bold').setFontSize(8);
            if (value === 'SIM') pdf.setTextColor(22, 101, 52);
            else if (value === 'NÃO') pdf.setTextColor(185, 28, 28);
            else pdf.setTextColor(150);

            pdf.text(value || "---", x + colW - 3, rowY + 4.5, { align: 'right' });
        });

        y += (Math.ceil(keys.length / 2) * rowH) + 10;

        // --- Observações ---
        pdf.setTextColor(0).setFontSize(9).setFont('helvetica', 'bold').text("OBSERVAÇÕES TÉCNICAS", margin, y);
        y += 4;
        pdf.setFont('helvetica', 'normal').setFontSize(8);
        const splitObs = pdf.splitTextToSize(data.observations || "Nenhuma observação informada.", pageWidth - 2 * margin);
        pdf.text(splitObs, margin, y);
        y += (splitObs.length * 4) + 10;

        // --- Fotos Anexadas ---
        const activeMedia = (data.media || []).filter(m => !m.url.startsWith('blob:'));
        if (activeMedia.length > 0) {
            pdf.setFontSize(9).setFont('helvetica', 'bold').text("EVIDÊNCIAS FOTOGRÁFICAS", margin, y);
            y += 4;
            const imgSize = 45;
            const gap = 2;
            let col = 0;
            
            for (const m of activeMedia) {
                if (y + imgSize > pageHeight - 40) { 
                    pdf.addPage(); 
                    y = margin + 10; 
                    col = 0;
                }
                
                try {
                    const url = getDisplayableDriveUrl(m.url);
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const base64Img = await blobToBase64(blob);
                    
                    const xPos = margin + (col * (imgSize + gap));
                    pdf.addImage(base64Img, 'JPEG', xPos, y, imgSize, imgSize, undefined, 'FAST');
                    pdf.setDrawColor(200).rect(xPos, y, imgSize, imgSize);
                    
                    col++;
                    if (col >= 4) { col = 0; y += imgSize + gap; }
                } catch(e) { console.error("Falha ao carregar foto", e); }
            }
            if (col !== 0) y += imgSize + 10; else y += 5;
        }

        // --- Assinatura ---
        if (y > pageHeight - 35) { pdf.addPage(); y = 20; } else { y = pageHeight - 35; }
        pdf.setDrawColor(0).setLineWidth(0.3).line(pageWidth / 2 - 40, y + 15, pageWidth / 2 + 40, y + 15);
        pdf.setFont('helvetica', 'bold').setFontSize(8).text("ASSINATURA RESPONSÁVEL / CLIENTE", pageWidth / 2, y + 19, { align: 'center' });
        
        if (data.signatureBase64) {
            pdf.addImage(data.signatureBase64, 'PNG', pageWidth / 2 - 25, y - 5, 50, 18);
        }

        pdf.save(`liberacao_${data.clientName.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
        console.error(e);
        alert("Erro ao gerar PDF.");
    } finally {
        setIsGenerating(false);
    }
  };

  return (
    <Modal onClose={onClose}>
        <div className="flex flex-col h-[85vh] font-montserrat">
            <div className="flex-shrink-0 mb-4 border-b pb-4 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Checklist Liberação de Obra</h2>
                    <p className="text-sm text-slate-500">Conferência de pré-montagem</p>
                </div>
                <button onClick={handleGeneratePdf} disabled={isGenerating} className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-orange-700 shadow-md disabled:opacity-50 transition-all">
                    <PrinterIcon className="w-5 h-5"/> {isGenerating ? 'Processando Fotos...' : 'Gerar PDF'}
                </button>
            </div>

            <div className="flex-grow overflow-y-auto pr-2 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-black text-slate-500 uppercase mb-1">Nome do Cliente</label>
                        <input value={data.clientName} onChange={e => handleUpdate({ clientName: e.target.value })} className="w-full p-2.5 border rounded-lg outline-none font-medium" />
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase mb-1">Data</label>
                        <input type="date" value={data.date} onChange={e => handleUpdate({ date: e.target.value })} className="w-full p-2.5 border rounded-lg" />
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase mb-1">Hora</label>
                        <input type="time" value={data.time} onChange={e => handleUpdate({ time: e.target.value })} className="w-full p-2.5 border rounded-lg" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-black text-slate-500 uppercase mb-1">Local / Endereço</label>
                        <input value={data.location} onChange={e => handleUpdate({ location: e.target.value })} className="w-full p-2.5 border rounded-lg" />
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-bold text-slate-700 uppercase text-xs tracking-widest border-b pb-2">Itens de Verificação</h3>
                    {[
                        { key: 'power', label: 'Tem energia no local?' },
                        { key: 'lighting', label: 'Iluminação adequada?' },
                        { key: 'cleanEnvironment', label: 'Ambiente está limpo?' },
                        { key: 'stonesForCutting', label: 'Pedras para corte no local?' },
                        { key: 'thirdPartiesWorking', label: 'Existem terceiros trabalhando?' },
                        { key: 'hydraulicElectricProjects', label: 'Tem projeto hidráulico/elétrico?' },
                        { key: 'finalPaint', label: 'Última demão de tinta após a obra?' },
                        { key: 'windowsInstalled', label: 'Todas as janelas instaladas?' },
                    ].map((item) => (
                        <div key={item.key} className="flex flex-col p-4 bg-white border rounded-xl hover:shadow-sm transition-all gap-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" checked={data.items[item.key as keyof WorkReleaseChecklist['items']] === 'SIM'} onChange={() => handleItemChange(item.key as keyof WorkReleaseChecklist['items'], 'SIM')} className="w-5 h-5 text-orange-600" />
                                        <span className="text-sm font-bold">SIM</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" checked={data.items[item.key as keyof WorkReleaseChecklist['items']] === 'NÃO'} onChange={() => handleItemChange(item.key as keyof WorkReleaseChecklist['items'], 'NÃO')} className="w-5 h-5 text-red-600" />
                                        <span className="text-sm font-bold">NÃO</span>
                                    </label>
                                </div>
                            </div>
                            {item.key === 'stonesForCutting' && data.items.stonesForCutting === 'SIM' && (
                                <div className="animate-fadeIn max-w-xs">
                                    <label className="block text-[10px] font-black text-orange-600 uppercase mb-1">Data Prevista para Corte</label>
                                    <input type="date" value={data.cuttingDate || ''} onChange={e => handleUpdate({ cuttingDate: e.target.value })} className="w-full p-2 border border-orange-100 rounded-lg text-sm" />
                                </div>
                            )}
                            {item.key === 'windowsInstalled' && data.items.windowsInstalled === 'NÃO' && (
                                <div className="animate-fadeIn w-full">
                                    <label className="block text-[10px] font-black text-red-600 uppercase mb-1">Quais janelas faltam?</label>
                                    <input 
                                        type="text" 
                                        value={data.missingWindowsDetails || ''} 
                                        onChange={e => handleUpdate({ missingWindowsDetails: e.target.value })} 
                                        placeholder="Ex: Janela da cozinha e área de serviço..."
                                        className="w-full p-2 border border-red-100 rounded-lg text-sm" 
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="p-5 bg-white border-2 border-slate-100 rounded-2xl shadow-sm">
                    <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-4 flex items-center gap-2">
                        <PaperClipIcon className="w-4 h-4 text-orange-500"/> Evidências Fotográficas
                    </h3>
                    <div className="flex flex-wrap gap-4">
                        {(data.media || []).map((m) => (
                            <div key={m.id} className="relative w-24 h-24 group">
                                <img src={getDisplayableDriveUrl(m.url)} className={`w-full h-full object-cover rounded-xl border ${m.url.startsWith('blob:') ? 'opacity-50 grayscale' : ''}`} />
                                {m.url.startsWith('blob:') && <div className="absolute inset-0 flex items-center justify-center"><RefreshIcon className="w-6 h-6 text-orange-500 animate-spin" /></div>}
                                <button onClick={() => handleUpdate({ media: data.media?.filter(x => x.id !== m.id) })} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md">&times;</button>
                            </div>
                        ))}
                        <label className="w-24 h-24 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-orange-50 transition-all">
                            {uploading ? <RefreshIcon className="w-8 h-8 text-orange-400 animate-spin" /> : <><CameraIcon className="w-8 h-8 text-slate-300" /><span className="text-[9px] font-black text-slate-400 mt-2 uppercase">Add Foto</span></>}
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} disabled={uploading} />
                        </label>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Observações Adicionais</label>
                    <textarea value={data.observations} onChange={e => handleUpdate({ observations: e.target.value })} className="w-full p-4 border rounded-xl text-sm min-h-[100px] resize-none" placeholder="Detalhes técnicos..." />
                </div>

                <div className="p-4 bg-slate-50 border rounded-xl">
                    <h3 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-widest">Assinatura do Responsável</h3>
                    <SignaturePad onSave={(sig) => handleUpdate({ signatureBase64: sig })} onClear={() => handleUpdate({ signatureBase64: '' })} initialData={data.signatureBase64} />
                </div>
            </div>

            <div className="flex-shrink-0 pt-4 border-t mt-4 flex justify-end gap-3">
                <button onClick={onClose} className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold uppercase text-xs">Fechar</button>
                <button onClick={() => { handleUpdate({}); alert("Salvo!"); }} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold uppercase text-xs">Salvar Checklist</button>
            </div>
        </div>
    </Modal>
  );
};

export default WorkReleaseReportModal;