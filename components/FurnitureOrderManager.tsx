
import React, { useState, useRef, useMemo } from 'react';
import { FurnitureOrder, FurnitureOrderItem, Assembler, Client, Media } from '../types';
import { generateUUID, SCRIPT_URL } from '../App';
import { fetchWithRetry } from '../utils/api';
import Modal from './Modal';
import { jsPDF } from 'jspdf';
import { 
    PlusCircleIcon, 
    ShoppingCartIcon, 
    TrashIcon, 
    CameraIcon, 
    RefreshIcon, 
    ChevronRightIcon, 
    SearchIcon,
    XIcon,
    PencilIcon,
    CalendarIcon,
    ClockIcon,
    CheckCircleIcon,
    PrinterIcon,
    ClipboardListIcon,
    TagIcon
} from './icons';

interface FurnitureOrderManagerProps {
    orders: FurnitureOrder[];
    assemblers: Assembler[];
    clients: Client[];
    onUpdateOrders: (orders: FurnitureOrder[]) => void;
}

const getDisplayableDriveUrl = (url: string): string => {
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
    const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
    const match = url.match(driveRegex);
    if (match && match[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
    return url;
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
            const MAX_SIZE = 1000;
            if (width > height) {
                if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
                if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);
            resolve({ base64: compressedBase64, mimeType: 'image/jpeg' });
        };
        reader.readAsDataURL(file);
    });
};

const FurnitureOrderManager: React.FC<FurnitureOrderManagerProps> = ({ orders, assemblers, clients, onUpdateOrders }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [viewingMedia, setViewingMedia] = useState<{ list: Media[], index: number } | null>(null);
    const [showManifest, setShowManifest] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    
    // Batch Selection State
    const [batchModalOrder, setBatchModalOrder] = useState<FurnitureOrder | null>(null);

    // Form State
    const [clientName, setClientName] = useState('');
    const [assemblerName, setAssemblerName] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toLocaleDateString('en-CA'));
    const [items, setItems] = useState<FurnitureOrderItem[]>([]);
    
    // New Item State
    const [newQty, setNewQty] = useState('');
    const [newUnit, setNewUnit] = useState('un');
    const [newDesc, setNewDesc] = useState('');
    const [newMedia, setNewMedia] = useState<Media | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const calculateDaysElapsed = (createdAt: string) => {
        const start = new Date(createdAt);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - start.getTime());
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    const filteredOrders = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return orders.filter(o => 
            o.clientName.toLowerCase().includes(term) || 
            o.assemblerName.toLowerCase().includes(term) ||
            (o.batchId || '').toLowerCase().includes(term)
        ).sort((a, b) => {
            if (a.status === b.status) {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            return a.status === 'Pending' ? -1 : 1;
        });
    }, [orders, searchTerm]);

    const activeBatches = useMemo(() => {
        const codes = new Set<string>();
        orders.forEach(o => { if(o.batchId) codes.add(o.batchId); });
        return Array.from(codes).sort();
    }, [orders]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const { base64: base64Data, mimeType } = await compressImage(file);
            const response = await fetchWithRetry(SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'UPLOAD_FILE', data: { base64Data, fileName: `order_${Date.now()}.jpg`, mimeType: mimeType } }),
            });
            const result = await response.json();
            if (result.success) {
                setNewMedia({ id: generateUUID(), type: 'image', url: result.url, name: file.name });
            }
        } catch (err) { 
            alert("Erro no upload"); 
        } finally { 
            setUploading(false); 
        }
    };

    const addItem = () => {
        if (!newDesc || !newQty) return;
        const item: FurnitureOrderItem = {
            id: generateUUID(),
            quantity: Number(newQty),
            unit: newUnit,
            description: newDesc,
            media: newMedia || undefined
        };
        setItems([...items, item]);
        setNewDesc('');
        setNewQty('');
        setNewMedia(null);
    };

    const handleEditOrder = (order: FurnitureOrder) => {
        setEditingOrderId(order.id);
        setClientName(order.clientName);
        setAssemblerName(order.assemblerName);
        setOrderDate(order.date);
        setItems([...order.items]);
        setIsCreating(true);
    };

    const toggleOrderBatch = (order: FurnitureOrder, e: React.MouseEvent) => {
        e.stopPropagation();
        if (order.status === 'Completed') {
            // Remover do lote
            const updated = orders.map(o => 
                o.id === order.id ? { ...o, status: 'Pending' as const, batchId: undefined } : o
            );
            onUpdateOrders(updated);
        } else {
            // Abrir modal de seleção de lote/geração de código
            setBatchModalOrder(order);
        }
    };

    const assignToBatch = (code: string) => {
        if (!batchModalOrder) return;
        const updated = orders.map(o => 
            o.id === batchModalOrder.id ? { ...o, status: 'Completed' as const, batchId: code } : o
        );
        onUpdateOrders(updated);
        setBatchModalOrder(null);
    };

    const generateNewBatch = () => {
        const newCode = `PED-${Math.floor(1000 + Math.random() * 9000)}`;
        assignToBatch(newCode);
    };

    const saveOrder = () => {
        if (!clientName || !assemblerName || items.length === 0) return;

        if (editingOrderId) {
            const updatedOrders = orders.map(o => 
                o.id === editingOrderId 
                ? { ...o, clientName, assemblerName, date: orderDate, items } 
                : o
            );
            onUpdateOrders(updatedOrders);
        } else {
            const newOrder: FurnitureOrder = {
                id: generateUUID(),
                date: orderDate,
                clientName,
                assemblerName,
                items,
                status: 'Pending',
                createdAt: new Date().toISOString()
            };
            onUpdateOrders([newOrder, ...orders]);
        }
        
        closeModal();
    };

    const closeModal = () => {
        setIsCreating(false);
        setEditingOrderId(null);
        setClientName('');
        setAssemblerName('');
        setOrderDate(new Date().toLocaleDateString('en-CA'));
        setItems([]);
    };

    const removeOrder = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("Remover este pedido?")) {
            onUpdateOrders(orders.filter(o => o.id !== id));
        }
    };

    const generateBatchPdf = async (batchId: string) => {
        setIsGeneratingPdf(true);
        const batchOrders = orders.filter(o => o.batchId === batchId);
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = 210;
            const margin = 12;
            let y = 15;

            // Header Principal do PDF
            pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(40);
            pdf.text(`SOLICITAÇÃO DE MATERIAIS - COD: ${batchId}`, margin, y);
            
            pdf.setFontSize(7).setFont('helvetica', 'normal').setTextColor(120);
            pdf.text(`EMISSÃO: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, y, { align: 'right' });
            
            y += 6;
            pdf.setDrawColor(200).setLineWidth(0.1).line(margin, y, pageWidth - margin, y);
            y += 8;

            batchOrders.forEach((order) => {
                if (y > 270) { pdf.addPage(); y = 15; }

                // Faixa do Pedido (Cliente/Montador)
                pdf.setFillColor(245, 245, 245);
                pdf.rect(margin, y, pageWidth - (margin * 2), 6, 'F');
                pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(60);
                pdf.text(`${order.clientName.toUpperCase()}  |  MONTADOR: ${order.assemblerName.toUpperCase()}`, margin + 2, y + 4.2);
                y += 7.5;

                // Tabela de Itens (Ultra Compacta)
                pdf.setFontSize(7).setFont('helvetica', 'bold').setTextColor(140);
                pdf.text("CONF.", margin + 1, y);
                pdf.text("QTD", margin + 18, y, { align: 'right' });
                pdf.text("UN", margin + 20, y);
                pdf.text("DESCRIÇÃO DO MATERIAL", margin + 30, y);
                
                y += 2.5;
                pdf.setDrawColor(240).line(margin, y, pageWidth - margin, y);
                y += 4.5;

                pdf.setFontSize(7).setFont('helvetica', 'normal').setTextColor(0);
                order.items.forEach(item => {
                    if (y > 285) { 
                        pdf.addPage(); 
                        y = 15; 
                        // Repetir cabeçalho se quebrar no meio do pedido
                        pdf.setFillColor(245, 245, 245).rect(margin, y, pageWidth - (margin * 2), 6, 'F');
                        pdf.setFont('helvetica', 'bold').setFontSize(8).text(`${order.clientName.toUpperCase()} (CONT.)`, margin + 2, y + 4.2);
                        y += 10;
                    }
                    
                    pdf.setDrawColor(200).rect(margin + 1, y - 2.5, 3, 3); // Checkbox conferência
                    pdf.setFont('helvetica', 'bold').text(String(item.quantity), margin + 18, y, { align: 'right' });
                    pdf.setFont('helvetica', 'normal').text(item.unit.toLowerCase(), margin + 20, y);
                    
                    const desc = item.description.toUpperCase();
                    const splitDesc = pdf.splitTextToSize(desc, 160);
                    pdf.text(splitDesc, margin + 30, y);
                    
                    y += (splitDesc.length * 3.5) + 1.5;
                });
                y += 4; // Espaço entre pedidos do lote
            });

            // Rodapé simples
            const pageCount = pdf.internal.pages.length - 1;
            for(let i = 1; i <= pageCount; i++) {
                pdf.setPage(i);
                pdf.setFontSize(6).setTextColor(150);
                pdf.text(`Página ${i} de ${pageCount} - Gerado via Tracker System`, pageWidth / 2, 290, { align: 'center' });
            }

            pdf.save(`pedido_envio_${batchId}.pdf`);
        } catch (e) {
            alert("Erro ao gerar PDF.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg"><ShoppingCartIcon className="w-6 h-6 text-blue-600"/></div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Pedidos de Materiais</h2>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Controle de Pedidos e Envios</p>
                    </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button 
                        onClick={() => setShowManifest(true)}
                        className="flex-1 md:flex-none bg-slate-800 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-black transition-all"
                    >
                        <ClipboardListIcon className="w-5 h-5"/> Pedidos Gerados ({activeBatches.length})
                    </button>
                    <button 
                        onClick={() => setIsCreating(true)}
                        className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all"
                    >
                        <PlusCircleIcon className="w-5 h-5"/> Novo Registro
                    </button>
                </div>
            </div>

            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><SearchIcon className="w-4 h-4" /></div>
                <input 
                    type="text" 
                    placeholder="Filtrar por cliente, montador ou código..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full pl-10 pr-4 py-2 bg-white border rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
                />
            </div>

            {/* List Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-normal">
                                <th className="p-3 w-12 text-center">Status</th>
                                <th className="p-3 w-32">Data</th>
                                <th className="p-3 w-20 text-center">Dias</th>
                                <th className="p-3">Cliente</th>
                                <th className="p-3">Montador</th>
                                <th className="p-3 w-28 text-center">Código Envio</th>
                                <th className="p-3 w-24 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredOrders.length === 0 ? (
                                <tr><td colSpan={7} className="p-10 text-center text-slate-400 italic">Nenhum pedido encontrado.</td></tr>
                            ) : (
                                filteredOrders.map(order => {
                                    const daysOpen = calculateDaysElapsed(order.createdAt);
                                    const isDone = order.status === 'Completed';
                                    return (
                                        <React.Fragment key={order.id}>
                                            <tr 
                                                onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                                className={`cursor-pointer transition-colors text-[14px] md:text-[10px] font-normal ${isDone ? 'bg-green-50/30' : 'hover:bg-slate-50'}`}
                                            >
                                                <td className="p-3 text-center" onClick={(e) => toggleOrderBatch(order, e)}>
                                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all mx-auto ${isDone ? 'bg-green-500 border-green-500' : 'border-slate-300 bg-white'}`}>
                                                        {isDone && <CheckCircleIcon className="w-4 h-4 text-white" />}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-slate-500">{new Date(order.date + 'T12:00:00Z').toLocaleDateString('pt-BR')}</td>
                                                <td className="p-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full font-bold ${daysOpen > 5 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                                                        {daysOpen}d
                                                    </span>
                                                </td>
                                                <td className={`p-3 uppercase text-slate-800 tracking-tight font-medium`}>{order.clientName}</td>
                                                <td className="p-3 uppercase text-slate-600">{order.assemblerName}</td>
                                                <td className="p-3 text-center">
                                                    {order.batchId ? (
                                                        <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md font-black border border-indigo-100">{order.batchId}</span>
                                                    ) : (
                                                        <span className="text-slate-300 italic">---</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {!isDone && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleEditOrder(order); }} 
                                                                className="text-slate-400 hover:text-blue-600"
                                                                title="Editar Registro"
                                                            >
                                                                <PencilIcon className="w-4 h-4"/>
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={(e) => removeOrder(order.id, e)} 
                                                            className="text-slate-400 hover:text-red-500"
                                                            title="Excluir Registro"
                                                        >
                                                            <TrashIcon className="w-4 h-4"/>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedOrderId === order.id && (
                                                <tr className="bg-slate-50/50">
                                                    <td colSpan={7} className="p-0 border-b">
                                                        <div className="p-4 bg-white m-2 rounded-lg border border-slate-200 shadow-inner animate-fadeIn">
                                                            <h4 className="text-[9px] font-bold text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-2">
                                                                <ClockIcon className="w-3 h-3"/> Itens do Registro
                                                            </h4>
                                                            <table className="w-full text-left text-[14px] md:text-[10px]">
                                                                <thead className="border-b">
                                                                    <tr className="text-slate-400 font-bold uppercase">
                                                                        <th className="pb-2 w-12 text-right pr-2">Qtd</th>
                                                                        <th className="pb-2 w-10">Un</th>
                                                                        <th className="pb-2">Descrição</th>
                                                                        <th className="pb-2 w-12 text-center">Foto</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y">
                                                                    {order.items.map(item => (
                                                                        <tr key={item.id}>
                                                                            <td className="py-2 font-black text-right pr-2 text-blue-600">{item.quantity}</td>
                                                                            <td className="py-2 text-slate-400 font-bold uppercase">{item.unit}</td>
                                                                            <td className="py-2 uppercase text-slate-700">{item.description}</td>
                                                                            <td className="py-2 text-center">
                                                                                {item.media ? (
                                                                                    <button onClick={() => setViewingMedia({ list: [item.media!], index: 0 })} className="text-blue-600"><CameraIcon className="w-4 h-4 mx-auto"/></button>
                                                                                ) : <span className="text-slate-300">---</span>}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Batch Selection Modal */}
            {batchModalOrder && (
                <Modal onClose={() => setBatchModalOrder(null)}>
                    <div className="p-4 space-y-4">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tighter">Agrupar para Envio</h3>
                            <button onClick={() => setBatchModalOrder(null)}><XIcon className="w-6 h-6 text-slate-400"/></button>
                        </div>
                        <p className="text-sm text-slate-600">Escolha um código de envio existente ou gere um novo para este registro:</p>
                        
                        <div className="space-y-3">
                            {activeBatches.length > 0 && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Códigos Ativos</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {activeBatches.map(code => (
                                            <button 
                                                key={code} 
                                                onClick={() => assignToBatch(code)}
                                                className="p-3 border rounded-xl hover:bg-indigo-50 hover:border-indigo-300 transition-all text-left flex flex-col"
                                            >
                                                <span className="font-black text-indigo-700 text-sm">{code}</span>
                                                <span className="text-[9px] text-slate-400 font-bold uppercase">Incluir neste</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            <div className="pt-2 border-t">
                                <button 
                                    onClick={generateNewBatch}
                                    className="w-full bg-blue-600 text-white p-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-3"
                                >
                                    <PlusCircleIcon className="w-6 h-6" /> Gerar Novo Código de Envio
                                </button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Create/Edit Modal */}
            {isCreating && (
                <Modal onClose={closeModal}>
                    <div className="p-2 space-y-4">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tighter">
                                {editingOrderId ? 'Editar Registro' : 'Novo Pedido de Material'}
                            </h3>
                            <button onClick={closeModal}><XIcon className="w-6 h-6 text-slate-400"/></button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cliente</label>
                                <input value={clientName} onChange={e => setClientName(e.target.value)} list="client-list" className="w-full p-2 border rounded-lg uppercase text-sm" placeholder="João Silva..." />
                                <datalist id="client-list">{clients.map(c => <option key={c.id} value={c.name}/>)}</datalist>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Montador</label>
                                <select value={assemblerName} onChange={e => setAssemblerName(e.target.value)} className="w-full p-2 border rounded-lg uppercase bg-white text-sm">
                                    <option value="">Selecione...</option>
                                    {assemblers.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data</label>
                                <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                <div className="md:col-span-1 flex gap-1">
                                    <div className="flex-1">
                                        <label className="block text-[9px] font-bold text-slate-400">QTD</label>
                                        <input type="number" value={newQty} onChange={e => setNewQty(e.target.value)} className="w-full p-2 border rounded-lg font-bold" placeholder="0" />
                                    </div>
                                    <div className="w-16">
                                        <label className="block text-[9px] font-bold text-slate-400">UN</label>
                                        <select value={newUnit} onChange={e => setNewUnit(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                                            <option value="un">UN</option>
                                            <option value="cx">CX</option>
                                            <option value="mt">MT</option>
                                            <option value="pc">PC</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[9px] font-bold text-slate-400">DESCRIÇÃO DO ITEM</label>
                                    <input value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full p-2 border rounded-lg uppercase" placeholder="Ex: Puxador, Dobradiça..." />
                                </div>
                                <div className="flex gap-2">
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                                    <button 
                                        type="button" 
                                        onClick={() => fileInputRef.current?.click()} 
                                        className={`p-2 border rounded-lg transition-colors ${newMedia ? 'bg-green-500 text-white' : 'bg-white text-slate-400 hover:text-blue-500'}`}
                                    >
                                        {uploading ? <RefreshIcon className="w-5 h-5 animate-spin"/> : <CameraIcon className="w-5 h-5"/>}
                                    </button>
                                    <button onClick={addItem} className="flex-grow bg-slate-800 text-white px-3 py-2 rounded-lg font-bold text-[10px] uppercase">Incluir</button>
                                </div>
                            </div>
                        </div>

                        {items.length > 0 && (
                            <div className="border rounded-lg overflow-hidden bg-white max-h-[250px] overflow-y-auto">
                                <table className="w-full text-left text-[10px]">
                                    <thead className="bg-slate-100 sticky top-0">
                                        <tr className="text-slate-500">
                                            <th className="p-2 w-12 text-right pr-2">Qtd</th>
                                            <th className="p-2 w-10">Un</th>
                                            <th className="p-2">Item</th>
                                            <th className="p-2 w-10 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {items.map(it => (
                                            <tr key={it.id}>
                                                <td className="p-2 font-black text-right pr-2 text-blue-600">{it.quantity}</td>
                                                <td className="p-2 text-slate-400 font-bold uppercase">{it.unit}</td>
                                                <td className="p-2 uppercase text-slate-700">{it.description} {it.media && <CameraIcon className="w-3 h-3 inline ml-1 text-blue-400"/>}</td>
                                                <td className="p-2 text-right">
                                                    <button onClick={() => setItems(items.filter(x => x.id !== it.id))} className="text-red-300 hover:text-red-500">
                                                        <TrashIcon className="w-4 h-4"/>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 border-t pt-4">
                            <button onClick={closeModal} className="px-6 py-2 text-slate-500 font-bold text-xs">Cancelar</button>
                            <button onClick={saveOrder} disabled={items.length === 0} className="px-10 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg disabled:opacity-50">
                                {editingOrderId ? 'Atualizar Registro' : 'Finalizar Registro'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Pedidos Gerados Modal */}
            {showManifest && (
                <Modal onClose={() => setShowManifest(false)}>
                    <div className="p-2 space-y-4 max-h-[85vh] flex flex-col">
                        <div className="flex justify-between items-center border-b pb-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                                    <ClipboardListIcon className="w-6 h-6 text-blue-600" />
                                    Pedidos Gerados para Envio
                                </h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{activeBatches.length} Lotes Disponíveis</p>
                            </div>
                            <button onClick={() => setShowManifest(false)}><XIcon className="w-6 h-6 text-slate-400"/></button>
                        </div>

                        <div className="flex-grow overflow-y-auto space-y-6">
                            {activeBatches.length === 0 ? (
                                <div className="text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed">
                                    <ShoppingCartIcon className="w-12 h-12 text-slate-200 mx-auto mb-2"/>
                                    <p className="text-slate-400 font-bold uppercase text-[10px]">Nenhum código gerado ainda.</p>
                                </div>
                            ) : (
                                activeBatches.map(batchId => {
                                    const batchOrders = orders.filter(o => o.batchId === batchId);
                                    return (
                                        <div key={batchId} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                            <div className="bg-slate-900 px-4 py-2 border-b flex justify-between items-center text-white">
                                                <div>
                                                    <h4 className="font-black uppercase text-sm leading-tight flex items-center gap-2">
                                                        <TagIcon className="w-4 h-4 text-blue-400" />
                                                        CÓDIGO: {batchId}
                                                    </h4>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{batchOrders.length} Registros Agrupados</p>
                                                </div>
                                                <button 
                                                    onClick={() => generateBatchPdf(batchId)}
                                                    className="bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-colors"
                                                >
                                                    <PrinterIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                            
                                            <div className="divide-y divide-slate-100">
                                                {batchOrders.map(order => (
                                                    <div key={order.id} className="p-3 bg-white">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-[10px] font-black text-slate-700 uppercase">{order.clientName}</span>
                                                            <span className="text-[9px] text-slate-400 font-bold">{order.assemblerName}</span>
                                                        </div>
                                                        <div className="grid grid-cols-[30px_35px_1fr] gap-2 mb-1 pb-1 border-b text-[8px] font-black text-slate-300 uppercase tracking-widest">
                                                            <div className="text-right pr-2">Qtd</div>
                                                            <div>Un</div>
                                                            <div>Descrição</div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            {order.items.map(it => (
                                                                <div key={it.id} className="grid grid-cols-[30px_35px_1fr] gap-2 items-start text-[9px] text-slate-600 uppercase">
                                                                    <div className="text-right pr-2 font-black text-blue-700">{it.quantity}</div>
                                                                    <div className="font-bold text-slate-400 text-[8px]">{it.unit}</div>
                                                                    <div className="font-medium text-slate-800 truncate">{it.description}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="flex justify-between items-center border-t pt-4">
                            <button 
                                onClick={() => {
                                    if(window.confirm("Limpar todos os agrupamentos? Todos os pedidos voltarão a ser 'Pendentes'.")) {
                                        onUpdateOrders(orders.map(o => ({ ...o, status: 'Pending', batchId: undefined })));
                                        setShowManifest(false);
                                    }
                                }} 
                                className="text-red-400 hover:text-red-600 text-[10px] font-bold uppercase"
                            >
                                Resetar Códigos
                            </button>
                            <button 
                                onClick={() => setShowManifest(false)}
                                className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase shadow-lg"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Media Viewer Logic Reused */}
            {viewingMedia && (
                <Modal onClose={() => setViewingMedia(null)} fullScreen={true}>
                    <div className="w-full h-full bg-black/95 flex items-center justify-center relative">
                        <img src={getDisplayableDriveUrl(viewingMedia.list[viewingMedia.index].url)} className="max-h-full max-w-full object-contain" />
                        <button onClick={() => setViewingMedia(null)} className="absolute top-4 right-4 text-white p-2"><XIcon className="w-8 h-8"/></button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default FurnitureOrderManager;
