
import React, { useState, useRef, useEffect } from 'react';
import { Client, MaterialOrder, MaterialOrderItem, Media } from '../types';
import { generateUUID, SCRIPT_URL } from '../App';
import { fetchWithRetry } from '../utils/api';
import { GoogleGenAI, Type } from "@google/genai";
import Modal from './Modal';
import { 
  ShoppingCartIcon, 
  PlusCircleIcon, 
  TrashIcon, 
  PrinterIcon, 
  DocumentTextIcon, 
  CameraIcon, 
  RefreshIcon, 
  ChevronRightIcon, 
  XIcon,
  SearchIcon,
  TagIcon
} from './icons';

const getDisplayableDriveUrl = (url: string): string => {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
  const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
  const match = url.match(driveRegex);
  if (match && match[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  return url;
};

const getFileIdFromUrl = (url: string): string | null => {
  const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
  const match = url.match(driveRegex);
  return match ? match[1] : null;
};

interface LabelAttribute {
    id: string;
    label: string;
    value: string;
    selected: boolean;
}

interface ReviewedItem {
    originalId: string;
    media: Media | null;
    attributes: LabelAttribute[];
}

interface MaterialOrderManagerProps {
  client: Client;
  onUpdateClient: (client: Client) => void;
}

const MaterialOrderManager: React.FC<MaterialOrderManagerProps> = ({ client, onUpdateClient }) => {
  const [orders, setOrders] = useState<MaterialOrder[]>(client.materialOrders || []);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<MaterialOrder | null>(null);
  const [reviewedItems, setReviewedItems] = useState<ReviewedItem[]>([]);
  const [aiStatus, setAiStatus] = useState<{current: number, total: number, msg: string} | null>(null);
  const [poNumber, setPoNumber] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [orderAssembler, setOrderAssembler] = useState(client.assembler || '');
  const [currentItems, setCurrentItems] = useState<MaterialOrderItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [newItemMedia, setNewItemMedia] = useState<Media | null>(null);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemQty, setNewItemQty] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setOrders(client.materialOrders || []); }, [client.materialOrders]);

  const analyzeLabelExhaustive = async (base64Data: string) => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
              { text: "Aja como um scanner industrial de precisão. Extraia ABSOLUTAMENTE TODOS os dados técnicos desta etiqueta de móveis Todeschini. Procure especificamente por: CLIENTE, OC COMPRA, MJF, PEDIDO, CÓDIGO DO ITEM, DESCRIÇÃO DA PEÇA, VOL, PC, LINHA, COR, PADRÃO, CÓDIGO DE IDENTIFICAÇÃO. Retorne EXCLUSIVAMENTE um array JSON puro: [ { \"label\": \"NOME DO CAMPO\", \"value\": \"VALOR\" } ]. Não inclua explicações ou blocos de código markdown como ```json." }
            ]
          }],
          config: { 
              responseMimeType: "application/json"
          }
        });
        
        let rawText = response.text || '[]';
        // SANITIZAÇÃO VITAL PARA O DEPLOY
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        return JSON.parse(rawText);
    } catch (e) {
        console.error("Falha Crítica no Scanner IA:", e);
        return null;
    }
  };

  const handleStartReview = async (order: MaterialOrder) => {
    setReviewOrder(order);
    setIsReviewing(true);
    setReviewedItems([]);
    setAiStatus({ current: 0, total: order.items.length, msg: "Iniciando Scanner Técnico de Alta Precisão..." });

    const results: ReviewedItem[] = [];

    for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i];
        setAiStatus({ current: i + 1, total: order.items.length, msg: `Extraindo dados da etiqueta ${i + 1} de ${order.items.length}...` });

        let attributes: LabelAttribute[] = [];

        if (item.media) {
            try {
                const fileId = getFileIdFromUrl(item.media.url);
                if (fileId) {
                    const proxyUrl = `${SCRIPT_URL}?action=GET_FILE_BASE64&fileId=${fileId}`;
                    const proxyResp = await fetch(proxyUrl).then(r => r.json());
                    
                    if (proxyResp.success && proxyResp.data) {
                        const extracted = await analyzeLabelExhaustive(proxyResp.data);
                        if (extracted && Array.isArray(extracted) && extracted.length > 0) {
                            attributes = extracted.map((attr: any) => ({
                                id: generateUUID(),
                                label: String(attr.label || 'CAMPO').toUpperCase(),
                                value: String(attr.value || '').toUpperCase(),
                                selected: true 
                            }));
                        }
                    }
                }
            } catch (e) {
                console.error("Erro ao cruzar dados com servidor:", e);
            }
        }

        if (attributes.length === 0) {
            attributes = [
                { id: generateUUID(), label: "DESCRIÇÃO (MANUAL)", value: item.description.toUpperCase(), selected: true },
                { id: generateUUID(), label: "QUANTIDADE", value: String(item.quantity), selected: true }
            ];
        }

        results.push({ originalId: item.id, media: item.media || null, attributes });
    }

    setReviewedItems(results);
    setAiStatus(null);
  };

  const updateAttribute = (itemIdx: number, attrId: string, field: 'label' | 'value' | 'selected', val: any) => {
      const newItems = [...reviewedItems];
      const attr = newItems[itemIdx].attributes.find(a => a.id === attrId);
      if (attr) { (attr as any)[field] = val; setReviewedItems(newItems); }
  };

  const generateFinalPdf = async () => {
    if (!(window as any).jspdf || !reviewOrder) return;
    const { jsPDF } = (window as any).jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const margin = 15;
    let yPos = 20;

    pdf.setFont('helvetica', 'bold').setFontSize(14).setTextColor(0).text("SOLICITAÇÃO DE REPOSIÇÃO TÉCNICA", margin, yPos);
    yPos += 8;
    pdf.setDrawColor(200).setLineWidth(0.05).line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    pdf.setFontSize(8).setFont('helvetica', 'normal').setTextColor(100);
    pdf.text("CLIENTE:", margin, yPos);
    pdf.setFont('helvetica', 'bold').setTextColor(0).text(client.name.toUpperCase(), margin + 18, yPos);
    
    pdf.setFont('helvetica', 'normal').setTextColor(100).text("PEDIDO / OC:", margin + 110, yPos);
    pdf.setFont('helvetica', 'bold').setTextColor(0).text(reviewOrder.purchaseOrderNumber.toUpperCase(), margin + 135, yPos);
    yPos += 5;

    pdf.setFont('helvetica', 'normal').setTextColor(100).text("MONTADOR:", margin, yPos);
    pdf.setFont('helvetica', 'bold').setTextColor(0).text((reviewOrder.assembler || 'N/A').toUpperCase(), margin + 22, yPos);
    
    pdf.setFont('helvetica', 'normal').setTextColor(100).text("DATA:", margin + 110, yPos);
    pdf.setFont('helvetica', 'bold').setTextColor(0).text(new Date().toLocaleDateString('pt-BR'), margin + 125, yPos);
    
    yPos += 8;
    pdf.setDrawColor(230).setLineWidth(0.05).line(margin, yPos, pageWidth - margin, yPos);
    yPos += 12;

    for (const item of reviewedItems) {
        const selectedAttrs = item.attributes.filter(a => a.selected);
        const rowHeight = Math.max(58, 15 + (selectedAttrs.length * 5.2));

        if (yPos + rowHeight > 280) { pdf.addPage(); yPos = 20; }

        pdf.setDrawColor(245).setLineWidth(0.01).rect(margin, yPos, pageWidth - (margin * 2), rowHeight);

        if (item.media) {
            try {
                const fileId = getFileIdFromUrl(item.media.url);
                if (fileId) {
                    const proxyUrl = `${SCRIPT_URL}?action=GET_FILE_BASE64&fileId=${fileId}`;
                    const proxyResp = await fetch(proxyUrl).then(r => r.json());
                    if (proxyResp.success && proxyResp.data) {
                        pdf.setDrawColor(220).setLineWidth(0.1).rect(margin + 2, yPos + 2, 54, 54);
                        pdf.addImage(proxyResp.data, 'JPEG', margin + 2.5, yPos + 2.5, 53, 53, undefined, 'FAST');
                    }
                }
            } catch (e) {}
        }

        const startX = margin + 62;
        const labelColWidth = 52; 
        const valueX = startX + labelColWidth + 2; 
        const maxValWidth = pageWidth - margin - valueX - 2;
        let currentY = yPos + 8;

        pdf.setFontSize(8).setFont('helvetica', 'bold').setTextColor(160).text("DADOS TÉCNICOS IDENTIFICADOS:", startX, currentY);
        currentY += 8;

        selectedAttrs.forEach(attr => {
            pdf.setFontSize(7).setFont('helvetica', 'normal').setTextColor(120);
            pdf.text(`${attr.label.toUpperCase()}:`, startX, currentY);

            pdf.setFontSize(9).setFont('helvetica', 'bold').setTextColor(0);
            const valStr = attr.value.toUpperCase();
            const splitVal = pdf.splitTextToSize(valStr, maxValWidth);
            pdf.text(splitVal, valueX, currentY);
            
            currentY += (splitVal.length * 4.8);
        });

        yPos += rowHeight + 6;
    }

    pdf.save(`REPOSICAO_${client.name.split(' ')[0]}_OC${reviewOrder.purchaseOrderNumber}.pdf`);
    setIsReviewing(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploading(true);
      const tempId = generateUUID();
      const localUrl = URL.createObjectURL(file);
      setNewItemMedia({ id: tempId, type: 'image', url: localUrl, name: file.name });
      try {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = async () => {
              const base64Data = (reader.result as string).split(',')[1];
              const uploadRes = await fetchWithRetry(SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'UPLOAD_FILE', data: { base64Data, fileName: `etiqueta_${Date.now()}.jpg`, mimeType: 'image/jpeg' } }),
              }).then(res => res.json());
              if (uploadRes.success) setNewItemMedia(prev => prev ? { ...prev, url: uploadRes.url } : null);
          };
      } finally { setIsUploading(false); }
  };

  return (
    <div className="space-y-6 font-montserrat">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
            <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                <ShoppingCartIcon className="w-6 h-6 text-blue-600" />
                Reposição de Material ({orders.length})
            </h3>
            {!isCreating && (
                <button onClick={() => setIsCreating(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md hover:bg-blue-700 flex items-center gap-2 transition-all">
                    <PlusCircleIcon className="w-5 h-5" /> Novo Pedido
                </button>
            )}
        </div>

        {isCreating && (
            <div className="bg-white border-2 border-blue-100 rounded-2xl p-5 shadow-xl animate-fadeIn space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input type="text" value={poNumber} onChange={e => setPoNumber(e.target.value)} className="w-full p-2 border rounded-lg font-bold" placeholder="Nº O.C. / Pedido" />
                    <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="w-full p-2 border rounded-lg" />
                    <input type="text" value={orderAssembler} onChange={e => setOrderAssembler(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Montador" />
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start">
                    <div className="relative flex-shrink-0">
                        <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                        <button type="button" onClick={() => fileInputRef.current?.click()} className={`w-24 h-24 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center ${newItemMedia ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-white'}`}>
                            {newItemMedia ? <img src={getDisplayableDriveUrl(newItemMedia.url)} className="w-full h-full object-cover rounded-xl" /> : <CameraIcon className="w-8 h-8 text-slate-300" />}
                        </button>
                        {newItemMedia && <button onClick={() => setNewItemMedia(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md"><XIcon className="w-3 h-3"/></button>}
                    </div>
                    <div className="flex-grow space-y-3 w-full">
                        <div className="flex gap-2">
                            <input type="number" value={newItemQty} onChange={e => setNewItemQty(e.target.value)} className="w-16 p-2 border rounded-lg font-black text-center" placeholder="Qtd" />
                            <input type="text" value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} className="flex-grow p-2 border rounded-lg text-sm" placeholder="O que está faltando?" />
                        </div>
                        <button onClick={(e) => { e.preventDefault(); if(newItemDesc || newItemMedia) { setCurrentItems([...currentItems, { id: generateUUID(), quantity: Number(newItemQty)||1, description: newItemDesc || 'Etiqueta anexada', media: newItemMedia || undefined }]); setNewItemQty(''); setNewItemDesc(''); setNewItemMedia(null); } }} disabled={isUploading || (!newItemMedia && !newItemDesc)} className="w-full py-2.5 bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all">Adicionar à Lista</button>
                    </div>
                </div>

                {currentItems.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                        <table className="w-full text-xs text-left">
                            <tbody className="divide-y divide-slate-100">
                                {currentItems.map(item => (
                                    <tr key={item.id}>
                                        <td className="p-3 flex items-center gap-3">
                                            {item.media && <img src={getDisplayableDriveUrl(item.media.url)} className="w-10 h-10 object-cover rounded border" />}
                                            <span className="font-bold text-slate-700">{item.description}</span>
                                        </td>
                                        <td className="p-3 text-center font-black text-blue-600">{item.quantity} un</td>
                                        <td className="p-3 text-right"><button onClick={() => setCurrentItems(currentItems.filter(i => i.id !== item.id))} className="text-red-400"><TrashIcon className="w-4 h-4"/></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setIsCreating(false)} className="px-6 py-2 text-slate-400 font-bold text-xs uppercase">Cancelar</button>
                    <button onClick={() => { if(currentItems.length > 0) { const newOrder = { id: generateUUID(), creationDate: new Date(orderDate).toISOString(), purchaseOrderNumber: poNumber || 'N/A', assembler: orderAssembler, items: currentItems }; onUpdateClient({ ...client, materialOrders: [newOrder, ...orders] }); setIsCreating(false); setCurrentItems([]); } }} className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">Salvar Pedido</button>
                </div>
            </div>
        )}

        <div className="space-y-4">
            {orders.map(order => (
                <div key={order.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}>
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-50 p-3 rounded-xl text-blue-600"><DocumentTextIcon className="w-6 h-6" /></div>
                            <div>
                                <h4 className="font-black text-slate-800 uppercase">O.C.: {order.purchaseOrderNumber}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(order.creationDate).toLocaleDateString('pt-BR')} • {order.items.length} ITENS</p>
                            </div>
                        </div>
                        <ChevronRightIcon className={`w-5 h-5 text-slate-300 transition-transform ${expandedOrderId === order.id ? 'rotate-90' : ''}`} />
                    </div>

                    {expandedOrderId === order.id && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50/30">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                                {order.items.map(item => (
                                    <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-100 flex gap-3 items-center shadow-sm">
                                        {item.media && <img src={getDisplayableDriveUrl(item.media.url)} className="w-12 h-12 object-cover rounded-lg border" />}
                                        <div className="min-w-0"><p className="text-[10px] font-black text-blue-600 uppercase">{item.quantity} un</p><p className="text-xs font-bold text-slate-800 truncate">{item.description}</p></div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-slate-100 gap-3">
                                <button onClick={() => onUpdateClient({...client, materialOrders: orders.filter(o => o.id !== order.id)})} className="text-red-400 text-[10px] font-black uppercase hover:text-red-600 transition-colors"><TrashIcon className="w-4 h-4 inline mr-1" /> Excluir Pedido</button>
                                <button 
                                    onClick={() => handleStartReview(order)} 
                                    className="bg-slate-900 text-white px-6 py-2 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-md active:scale-95"
                                >
                                    <SearchIcon className="w-4 h-4" /> Scanner IA e PDF Técnico
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>

        {isReviewing && (
            <Modal onClose={() => !aiStatus && setIsReviewing(false)}>
                <div className="flex flex-col h-[88vh] font-montserrat">
                    <div className="flex-shrink-0 border-b pb-4 mb-4 flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                                <RefreshIcon className={`w-6 h-6 text-blue-600 ${aiStatus ? 'animate-spin' : ''}`} />
                                Conferência Automática de Etiquetas
                            </h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">A IA buscará todos os dados industriais das fotos anexadas</p>
                        </div>
                        {!aiStatus && (
                            <button onClick={generateFinalPdf} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-blue-700 flex items-center gap-2 active:scale-95 transition-all">
                                <PrinterIcon className="w-4 h-4" /> Exportar PDF Final
                            </button>
                        )}
                    </div>

                    <div className="flex-grow overflow-y-auto pr-2">
                        {aiStatus ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-4">
                                <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                                <div className="text-center">
                                    <p className="font-black text-slate-700 uppercase">{aiStatus.msg}</p>
                                    <p className="text-xs text-slate-400 font-bold mt-1 tracking-widest">{aiStatus.current} DE {aiStatus.total}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8 pb-10">
                                {reviewedItems.map((item, itemIdx) => (
                                    <div key={itemIdx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col lg:flex-row gap-6 shadow-sm">
                                        <div className="w-full lg:w-72 h-72 bg-white rounded-xl border-2 overflow-hidden flex-shrink-0 shadow-inner">
                                            {item.media ? (
                                                <img src={getDisplayableDriveUrl(item.media.url)} className="w-full h-full object-contain" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50"><CameraIcon className="w-12 h-12"/></div>
                                            )}
                                        </div>
                                        <div className="flex-grow">
                                            <div className="flex items-center gap-2 mb-4 border-b pb-2">
                                                <TagIcon className="w-4 h-4 text-blue-600"/>
                                                <h4 className="font-black text-slate-800 uppercase text-xs">Dados Identificados na Peça {itemIdx + 1}</h4>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                                {item.attributes.map((attr) => (
                                                    <div key={attr.id} className={`p-3 rounded-xl border transition-all ${attr.selected ? 'bg-white border-blue-200 shadow-sm' : 'bg-slate-100/50 border-transparent opacity-50'}`}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <input type="text" value={attr.label} onChange={e => updateAttribute(itemIdx, attr.id, 'label', e.target.value)} className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-transparent focus:text-blue-600 outline-none w-full mr-2" />
                                                            <input type="checkbox" checked={attr.selected} onChange={() => updateAttribute(itemIdx, attr.id, 'selected', !attr.selected)} className="w-4 h-4 rounded text-blue-600 cursor-pointer" />
                                                        </div>
                                                        <input type="text" value={attr.value} onChange={e => updateAttribute(itemIdx, attr.id, 'value', e.target.value)} className="w-full bg-transparent font-bold text-slate-800 text-sm focus:bg-blue-50 rounded px-1 py-0.5 outline-none transition-colors" placeholder="Vazio" />
                                                    </div>
                                                ))}
                                                <button onClick={() => {
                                                    const newItems = [...reviewedItems];
                                                    newItems[itemIdx].attributes.push({ id: generateUUID(), label: 'NOVO CAMPO', value: '', selected: true });
                                                    setReviewedItems(newItems);
                                                }} className="p-3 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-all text-[10px] font-bold uppercase">
                                                    <PlusCircleIcon className="w-4 h-4"/> Add Campo Manual
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {!aiStatus && (
                        <div className="flex-shrink-0 border-t pt-4 flex justify-between items-center">
                             <p className="text-[10px] text-slate-400 font-bold uppercase italic">Dica: A IA ignora o fundo e foca apenas nas letras da etiqueta.</p>
                             <div className="flex gap-3">
                                <button onClick={() => setIsReviewing(false)} className="px-6 py-2 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600">Cancelar</button>
                                <button onClick={generateFinalPdf} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-blue-700 active:scale-95 transition-all">Finalizar e Baixar PDF</button>
                             </div>
                        </div>
                    )}
                </div>
            </Modal>
        )}
    </div>
  );
};

export default MaterialOrderManager;
