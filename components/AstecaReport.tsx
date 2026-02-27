
import React, { useMemo, useState } from 'react';
import { Client, ChecklistStatus, Media } from '../types';
import { jsPDF } from 'jspdf';
import { 
    ExclamationCircleIcon, 
    PrinterIcon, 
    CubeIcon, 
    SearchIcon,
    ShieldCheckIcon,
    TagIcon,
    CameraIcon,
    RefreshIcon,
    UserIcon,
    XIcon,
    ChevronRightIcon
} from './icons';
import { SCRIPT_URL } from '../App';

interface AstecaRecord {
    clientId: string;
    clientName: string;
    environmentId: string;
    environmentName: string;
    itemDescription: string;
    astecaOC?: string;
    astecaNumber?: string;
    astecaDate?: string;
    astecaReason?: string;
    media: Media[];
}

const calculateDaysOpen = (dateStr?: string) => {
    if (!dateStr) return '---';
    try {
        const start = new Date(dateStr + 'T12:00:00Z');
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - start.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return `${diffDays}d`;
    } catch (e) {
        return '---';
    }
};

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

interface AstecaReportProps {
    clients: Client[];
    onNavigate?: (clientId: string, envId: string) => void;
}

const AstecaReport: React.FC<AstecaReportProps> = ({ clients, onNavigate }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    const allAstecas = useMemo(() => {
        const list: AstecaRecord[] = [];
        (clients || []).forEach(client => {
            (client.environments || []).forEach(env => {
                (env.checklist || []).forEach(item => {
                    if (item.status === ChecklistStatus.Defective) {
                        list.push({
                            clientId: client.id,
                            clientName: client.name,
                            environmentId: env.id,
                            environmentName: env.name,
                            itemDescription: item.description,
                            astecaOC: item.astecaOC,
                            astecaNumber: item.astecaNumber,
                            astecaDate: item.astecaDate,
                            astecaReason: item.astecaReason,
                            media: item.astecaMedia || []
                        });
                    }
                });
            });
        });
        return list.sort((a, b) => a.clientName.localeCompare(b.clientName));
    }, [clients]);

    const availableClientsWithAsteca = useMemo(() => {
        const unique = new Map<string, string>();
        allAstecas.forEach(a => unique.set(a.clientId, a.clientName));
        return Array.from(unique.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [allAstecas]);

    const filteredAstecas = useMemo(() => {
        let list = [...allAstecas];
        if (selectedClientIds.length > 0) {
            list = list.filter(a => selectedClientIds.includes(a.clientId));
        }
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            list = list.filter(a => 
                a.clientName.toLowerCase().includes(term) ||
                a.environmentName.toLowerCase().includes(term) ||
                a.itemDescription.toLowerCase().includes(term) ||
                (a.astecaNumber || '').toLowerCase().includes(term) ||
                (a.astecaOC || '').toLowerCase().includes(term)
            );
        }
        return list;
    }, [allAstecas, selectedClientIds, searchTerm]);

    const toggleClientSelection = (id: string) => {
        setSelectedClientIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleGeneratePdf = async () => {
        setIsGenerating(true);
        try {
            const { jsPDF } = (window as any).jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 15;
            let y = 20;

            pdf.setFont('helvetica', 'bold').setFontSize(16).setTextColor(180, 0, 0);
            let titleText = "RELATÓRIO CONSOLIDADO DE ASTECAS";
            if (selectedClientIds.length === 1) titleText = `RELATÓRIO DE ASTECAS: ${filteredAstecas[0]?.clientName.toUpperCase()}`;
            
            pdf.text(titleText, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(8).setFont('helvetica', 'normal').setTextColor(100);
            pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, y, { align: 'center' });
            y += 12;

            for (const a of filteredAstecas) {
                const neededHeight = a.media.length > 0 ? 80 : 45;
                if (y + neededHeight > pageHeight - margin) {
                    pdf.addPage();
                    y = 20;
                }
                pdf.setDrawColor(200).setFillColor(255, 255, 255).rect(margin, y, pageWidth - (margin * 2), neededHeight - 5);
                pdf.setDrawColor(180, 0, 0).setLineWidth(1).line(margin, y, margin, y + neededHeight - 5);
                pdf.setLineWidth(0.2);
                pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0);
                pdf.text(`CLIENTE: ${a.clientName.toUpperCase()}`, margin + 5, y + 6);
                pdf.setFontSize(8).setTextColor(100);
                pdf.text(`Ambiente: ${a.environmentName} | Item: ${a.itemDescription}`, margin + 5, y + 11);
                y += 16;
                pdf.setFillColor(245, 245, 245).rect(margin + 5, y, pageWidth - (margin * 2) - 10, 15, 'F');
                pdf.setFontSize(7).setFont('helvetica', 'bold').setTextColor(80);
                pdf.text("ORDEM DE COMPRA (OC)", margin + 8, y + 5);
                pdf.text("NÚMERO ASTECA", margin + 55, y + 5);
                pdf.text("DATA SOLICITAÇÃO", margin + 105, y + 5);
                pdf.setFontSize(9).setTextColor(0);
                pdf.text(a.astecaOC || "---", margin + 8, y + 11);
                pdf.text(a.astecaNumber || "---", margin + 55, y + 11);
                pdf.text(a.astecaDate ? new Date(a.astecaDate + 'T12:00:00Z').toLocaleDateString('pt-BR') : "---", margin + 105, y + 11);
                y += 18;
                pdf.setFontSize(8).setFont('helvetica', 'bold').setTextColor(180, 0, 0);
                pdf.text("MOTIVO DA ASSISTÊNCIA:", margin + 5, y);
                pdf.setFont('helvetica', 'normal').setTextColor(50);
                const reason = a.astecaReason || "Não informado.";
                const splitReason = pdf.splitTextToSize(reason, pageWidth - (margin * 2) - 15);
                pdf.text(splitReason, margin + 5, y + 4);
                y += (splitReason.length * 4) + 2;
                if (a.media.length > 0) {
                    pdf.setFontSize(7).setFont('helvetica', 'bold').setTextColor(100);
                    pdf.text("ANEXOS FOTOGRÁFICOS:", margin + 5, y + 2);
                    let imgX = margin + 5;
                    const imgSize = 25;
                    for (const m of a.media.slice(0, 5)) {
                        try {
                            const url = getDisplayableDriveUrl(m.url);
                            const resp = await fetch(url);
                            const blob = await resp.blob();
                            const b64 = await blobToBase64(blob);
                            pdf.addImage(b64, 'JPEG', imgX, y + 4, imgSize, imgSize, undefined, 'FAST');
                            imgX += imgSize + 2;
                        } catch (e) {}
                    }
                    y += imgSize + 10;
                } else y += 5;
                y += 10;
            }
            pdf.save(`Relatorio_Astecas_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (e) { alert("Erro ao gerar PDF."); } finally { setIsGenerating(false); }
    };

    return (
        <div className="space-y-6 font-app animate-fadeIn">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                            <ShieldCheckIcon className="w-8 h-8 text-red-600" />
                            Relatório de ASTECAS Ativas
                        </h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Consolidado técnico de assistências pendentes no sistema
                        </p>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-grow">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                <SearchIcon className="w-4 h-4" />
                            </div>
                            <input 
                                type="text" 
                                placeholder="Filtrar por OC, número ou peça..." 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-red-500/20" 
                            />
                        </div>
                        <button 
                            onClick={handleGeneratePdf} 
                            disabled={isGenerating || filteredAstecas.length === 0} 
                            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-black shadow-lg disabled:opacity-50 flex items-center gap-2 transition-all active:scale-95"
                        >
                            <PrinterIcon className="w-4 h-4"/> 
                            {isGenerating ? 'Processando...' : 'Exportar PDF'}
                        </button>
                    </div>
                </div>

                <div className="border-t border-slate-100 pt-5">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Filtrar por Obras:</span>
                        </div>
                        {selectedClientIds.length > 0 && (
                            <button onClick={() => setSelectedClientIds([])} className="text-[9px] font-bold text-red-600 hover:underline uppercase flex items-center gap-1">
                                <XIcon className="w-3 h-3" /> Limpar Seleção
                            </button>
                        )}
                    </div>
                    
                    {availableClientsWithAsteca.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic">Nenhuma obra com ASTECA ativa.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            <button 
                                onClick={() => setSelectedClientIds([])}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border ${selectedClientIds.length === 0 ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                            >
                                Todas as Obras
                            </button>
                            {availableClientsWithAsteca.map(([id, name]) => (
                                <button 
                                    key={id}
                                    onClick={() => toggleClientSelection(id)}
                                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border flex items-center gap-2 ${selectedClientIds.includes(id) ? 'bg-red-600 text-white border-red-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-red-400 hover:text-red-600'}`}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                            <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-[0.2em] font-black">
                                <th className="p-4 border-b border-slate-800">Solicitação</th>
                                <th className="p-4 border-b border-slate-800 text-center">Dias</th>
                                <th className="p-4 border-b border-slate-800">Obra / Cliente</th>
                                <th className="p-4 border-b border-slate-800">Ambiente / Item</th>
                                <th className="p-4 border-b border-slate-800">OC / Nº Asteca</th>
                                <th className="p-4 border-b border-slate-800"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredAstecas.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-20 text-center text-slate-400 italic text-sm">
                                        Nenhuma assistência técnica pendente encontrada para os filtros atuais.
                                    </td>
                                </tr>
                            ) : (
                                filteredAstecas.map((a, idx) => (
                                    <tr 
                                        key={`${a.clientId}-${idx}`} 
                                        onClick={() => onNavigate?.(a.clientId, a.environmentId)}
                                        className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/50 transition-colors group text-[10px] font-normal cursor-pointer`}
                                    >
                                        <td className="p-4 text-slate-700">
                                            {a.astecaDate ? new Date(a.astecaDate + 'T12:00:00Z').toLocaleDateString('pt-BR') : '---'}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-100">
                                                {calculateDaysOpen(a.astecaDate)}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-800 uppercase tracking-tight">
                                            {a.clientName}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-1.5 text-slate-500 uppercase">
                                                    <CubeIcon className="w-3 h-3 text-slate-300" />
                                                    {a.environmentName}
                                                </div>
                                                <div className="text-blue-600 uppercase leading-tight font-medium">
                                                    {a.itemDescription}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="text-slate-600 font-bold">
                                                    OC: {a.astecaOC || '---'}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-slate-600">
                                                    <ShieldCheckIcon className="w-3 h-3 text-red-400"/>
                                                    AST: <span className="text-red-700 font-bold">{a.astecaNumber || '---'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="p-2 text-slate-300 group-hover:text-blue-600 transition-colors">
                                                <ChevronRightIcon className="w-5 h-5" />
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="bg-slate-900 rounded-2xl p-4 flex justify-between items-center text-white shadow-xl border border-white/10">
                <div className="flex items-center gap-3">
                    <div className="bg-red-600 p-2 rounded-xl shadow-inner text-white">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em] leading-none mb-1">Total de Assistências</p>
                        <p className="text-xs font-medium text-slate-400 uppercase">Filtradas no período</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 pr-4">
                    <span className="text-3xl font-black text-red-500">{filteredAstecas.length}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Registros</span>
                </div>
            </div>
        </div>
    );
};

export default AstecaReport;
