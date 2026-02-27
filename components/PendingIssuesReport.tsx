
import React, { useMemo, useState } from 'react';
import { Client, Assembler } from '../types';
import { jsPDF } from 'jspdf';
import { 
    ExclamationCircleIcon, 
    PrinterIcon, 
    CalendarIcon, 
    CubeIcon, 
    SearchIcon,
    ChevronRightIcon,
    UserIcon,
    CheckCircleIcon,
    ClipboardListIcon,
    HomeIcon,
    XIcon,
    TagIcon
} from './icons';

const formatToBR = (isoString?: string) => {
    if (!isoString) return '--/--/----';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return '--/--/----';
    }
};

interface PendingIssue {
    clientId: string;
    clientName: string;
    location: string;
    description: string;
    date: Date;
    executionDate?: string;
    assemblerName?: string;
    category: 'Falta' | 'Peça Batida' | 'Geral';
    source: 'Pós-Obra';
}

interface PendingIssuesReportProps {
    clients: Client[];
    assemblers: Assembler[];
    viewMode: 'BY_CLIENT' | 'GENERAL' | 'BY_CATEGORY';
    onSelectClient: (id: string) => void;
}

const CATEGORIES = ['Falta', 'Peça Batida', 'Geral'] as const;

const PendingIssuesReport: React.FC<PendingIssuesReportProps> = ({ clients, assemblers, viewMode, onSelectClient }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>(['Falta', 'Peça Batida', 'Geral']);
    const [isGenerating, setIsGenerating] = useState(false);

    const calculateDaysOpen = (date: Date) => {
        const diffTime = Math.abs(new Date().getTime() - date.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    // --- AGGREGAÇÃO BASE ---
    const allPossibleIssues = useMemo(() => {
        const issues: PendingIssue[] = [];
        (clients || []).forEach(client => {
            if (client.punchLists && Array.isArray(client.punchLists)) {
                client.punchLists.forEach(list => {
                    (list.items || []).forEach(item => {
                        if (item.issues && item.issues.length > 0) {
                            item.issues.forEach(iss => {
                                if (iss.status === 'Pending') {
                                    const ass = assemblers.find(a => a.id === iss.assignedAssemblerId);
                                    issues.push({
                                        clientId: client.id,
                                        clientName: client.name,
                                        location: item.description,
                                        description: iss.description,
                                        date: iss.creationDate ? new Date(iss.creationDate) : new Date(),
                                        executionDate: iss.scheduledExecutionDate,
                                        assemblerName: ass?.name,
                                        category: (iss.category as any) || 'Geral',
                                        source: 'Pós-Obra'
                                    });
                                }
                            });
                        } 
                        else if (item.status === 'Pending') {
                            issues.push({
                                clientId: client.id,
                                clientName: client.name,
                                location: "Geral",
                                description: item.description,
                                date: item.creationDate ? new Date(item.creationDate) : new Date(),
                                category: 'Geral',
                                source: 'Pós-Obra'
                            });
                        }
                    });
                });
            }
        });
        return issues;
    }, [clients, assemblers]);

    // Lista de Clientes Únicos que têm pendências (para o filtro)
    const availableClientsForFilter = useMemo(() => {
        const unique = new Map<string, string>();
        allPossibleIssues.forEach(i => unique.set(i.clientId, i.clientName));
        return Array.from(unique.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [allPossibleIssues]);

    // --- FILTRAGEM E ORDENAÇÃO DINÂMICA ---
    const filteredIssues = useMemo(() => {
        let list = [...allPossibleIssues];

        // Filtro por seleção de clientes específicos
        if (selectedClientIds.length > 0) {
            list = list.filter(i => selectedClientIds.includes(i.clientId));
        }

        // Filtro por Categorias (Novo)
        list = list.filter(i => selectedCategories.includes(i.category));

        // Filtro por termo de busca
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            list = list.filter(i => 
                i.clientName.toLowerCase().includes(term) ||
                i.description.toLowerCase().includes(term) ||
                i.location.toLowerCase().includes(term) ||
                (i.assemblerName || '').toLowerCase().includes(term) ||
                (i.category || '').toLowerCase().includes(term)
            );
        }

        // Ordenação
        return list.sort((a, b) => {
            if (viewMode === 'BY_CLIENT') {
                const nameA = a.clientName.toLowerCase();
                const nameB = b.clientName.toLowerCase();
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return a.date.getTime() - b.date.getTime();
            } else if (viewMode === 'BY_CATEGORY') {
                const catA = (a.category || 'Geral').toLowerCase();
                const catB = (b.category || 'Geral').toLowerCase();
                if (catA < catB) return -1;
                if (catA > catB) return 1;
                return a.date.getTime() - b.date.getTime();
            } else {
                return a.date.getTime() - b.date.getTime();
            }
        });
    }, [allPossibleIssues, searchTerm, selectedClientIds, selectedCategories, viewMode]);

    // --- CÁLCULO DE TOTAIS ---
    const stats = useMemo(() => {
        const totalPending = filteredIssues.length;
        const obrasImpactadas = new Set(filteredIssues.map(i => i.clientId)).size;
        const agendadas = filteredIssues.filter(i => i.executionDate).length;
        const criticas = filteredIssues.filter(i => calculateDaysOpen(i.date) > 15 && !i.executionDate).length;

        return { totalPending, obrasImpactadas, agendadas, criticas };
    }, [filteredIssues]);

    const toggleClientSelection = (id: string) => {
        setSelectedClientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleCategorySelection = (cat: string) => {
        setSelectedCategories(prev => prev.includes(cat) ? prev.filter(x => x !== cat) : [...prev, cat]);
    };

    const handleGeneratePdf = async () => {
        setIsGenerating(true);
        try {
            const { jsPDF } = (window as any).jspdf;
            const pdf = new jsPDF('l', 'mm', 'a4'); 
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            let y = margin;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            
            let reportTitle = "RELAÇÃO DE PENDÊNCIAS";
            const catsSelected = selectedCategories.join(', ').toUpperCase();
            reportTitle += ` (${catsSelected})`;
            
            if (selectedClientIds.length > 0) {
                const suffix = selectedClientIds.length === 1 
                    ? `CLIENTE: ${filteredIssues[0]?.clientName.toUpperCase()}`
                    : `SELEÇÃO DE OBRAS (${selectedClientIds.length})`;
                reportTitle = `${reportTitle} - ${suffix}`;
            }

            pdf.text(reportTitle, pageWidth / 2, y + 5, { align: 'center' });
            y += 12;

            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(100);
            pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y);
            pdf.text(`Total: ${stats.totalPending} pendências filtradas em ${stats.obrasImpactadas} obras`, pageWidth - margin, y, { align: 'right' });
            y += 5;

            pdf.setFillColor(30, 41, 59);
            pdf.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
            pdf.setFont('helvetica', 'bold').setTextColor(255).setFontSize(7);
            pdf.text("DATA CRIAÇÃO", margin + 2, y + 4.5);
            pdf.text("DIAS", margin + 25, y + 4.5);
            pdf.text("TIPO / LOCAL", margin + 40, y + 4.5);
            pdf.text("DESCRIÇÃO DA PENDÊNCIA / CLIENTE", margin + 90, y + 4.5);
            pdf.text("EXECUÇÃO", margin + 215, y + 4.5);
            pdf.text("MONTADOR", margin + 245, y + 4.5);
            y += 7;
            pdf.setTextColor(0);

            let lastGroup = "";

            filteredIssues.forEach((issue, idx) => {
                if (y > pageHeight - 20) { pdf.addPage('l', 'mm', 'a4'); y = margin + 5; }

                const currentGroupValue = viewMode === 'BY_CLIENT' ? issue.clientName : viewMode === 'BY_CATEGORY' ? issue.category : "";

                if (currentGroupValue && currentGroupValue !== lastGroup) {
                    pdf.setFillColor(240, 244, 248);
                    pdf.rect(margin, y, pageWidth - (margin * 2), 6, 'F');
                    pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(30, 58, 138);
                    pdf.text(`${viewMode === 'BY_CLIENT' ? 'OBRA' : 'CLASSIFICAÇÃO'}: ${String(currentGroupValue).toUpperCase()}`, margin + 2, y + 4);
                    y += 7;
                    lastGroup = String(currentGroupValue);
                }

                if (idx % 2 !== 0) { pdf.setFillColor(252, 252, 252); pdf.rect(margin, y, pageWidth - (margin * 2), 8, 'F'); }

                const days = calculateDaysOpen(issue.date);
                const isLateAlert = days > 15 && !issue.executionDate;

                pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(0);
                pdf.text(formatToBR(issue.date.toISOString()), margin + 2, y + 4.5);
                
                if (isLateAlert) {
                    pdf.setFont('helvetica', 'bold').setTextColor(200, 0, 0);
                    pdf.text(`${days} d`, margin + 25, y + 4.5);
                    pdf.setFont('helvetica', 'normal').setTextColor(0);
                } else {
                    pdf.text(`${days} d`, margin + 25, y + 4.5);
                }

                const typeAndLoc = `[${issue.category}] ${issue.location}`;
                pdf.text(pdf.splitTextToSize(typeAndLoc.toUpperCase(), 45), margin + 40, y + 4.5);
                
                const descText = `${issue.description} (${issue.clientName})`;
                pdf.text(pdf.splitTextToSize(descText, 120), margin + 90, y + 4.5);
                pdf.text(formatToBR(issue.executionDate), margin + 215, y + 4.5);
                pdf.text(pdf.splitTextToSize(issue.assemblerName || "---", 35), margin + 245, y + 4.5);
                y += 9;
            });

            pdf.save(`relatorio_pendencias_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (e) { alert("Erro ao gerar PDF."); } finally { setIsGenerating(false); }
    };

    let currentGroup = "";

    return (
        <div className="flex flex-col gap-6 animate-fadeIn font-montserrat">
            {/* --- HEADER COM BUSCA E FILTROS --- */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 flex flex-col gap-5">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-light text-slate-800 tracking-tight uppercase">
                            {viewMode === 'BY_CLIENT' ? 'Pendências Por Cliente' : viewMode === 'GENERAL' ? 'Pendências Geral (Cronológico)' : 'Relação de Pendências'}
                        </h2>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-medium">
                            Selecione os tipos e obras para gerar o relatório consolidado
                        </p>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-grow">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><SearchIcon /></div>
                            <input type="text" placeholder="Filtrar por texto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <button onClick={handleGeneratePdf} disabled={isGenerating || filteredIssues.length === 0} className="bg-slate-900 text-white p-2 sm:px-4 sm:py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-black shadow-md transition-all active:scale-95 disabled:opacity-50">
                            <PrinterIcon className="w-5 h-5"/><span className="hidden sm:inline text-xs">Exportar PDF</span>
                        </button>
                    </div>
                </div>

                {/* --- FILTRO DE CATEGORIAS (MULTI-SELECT) --- */}
                <div className="border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filtrar por Tipos:</span>
                        <div className="flex gap-2">
                             <button onClick={() => setSelectedCategories(['Falta', 'Peça Batida', 'Geral'])} className="text-[9px] font-bold text-blue-600 hover:underline uppercase">Selecionar Todos</button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map(cat => (
                            <button 
                                key={cat}
                                onClick={() => toggleCategorySelection(cat)}
                                className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border flex items-center gap-2 ${selectedCategories.includes(cat) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-400'}`}
                            >
                                <div className={`w-2 h-2 rounded-full ${selectedCategories.includes(cat) ? 'bg-white' : 'bg-slate-200'}`} />
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* --- SELETOR DE CLIENTES (CHIPS) --- */}
                <div className="border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Selecionar Obras:</span>
                        {selectedClientIds.length > 0 && (
                            <button onClick={() => setSelectedClientIds([])} className="text-[9px] font-bold text-blue-600 hover:underline uppercase">Limpar Clientes</button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button 
                            onClick={() => setSelectedClientIds([])}
                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${selectedClientIds.length === 0 ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'}`}
                        >
                            Todas as Obras
                        </button>
                        {availableClientsForFilter.map(([id, name]) => (
                            <button 
                                key={id}
                                onClick={() => toggleClientSelection(id)}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${selectedClientIds.includes(id) ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:text-blue-600'}`}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- TABELA DINÂMICA --- */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1100px]">
                        <thead>
                            <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-bold">
                                <th className="p-4 w-32">Data Criação</th>
                                <th className="p-4 w-20 text-center">Dias</th>
                                <th className="p-4 w-48">Tipo / Local</th>
                                <th className="p-4">Descrição da Pendência</th>
                                <th className="p-4 w-32">Execução</th>
                                <th className="p-4 w-40">Montador</th>
                                <th className="p-4 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredIssues.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-20 text-center text-slate-400 italic">Nenhuma pendência encontrada para os filtros selecionados.</td>
                                </tr>
                            ) : (
                                filteredIssues.map((issue, idx) => {
                                    const days = calculateDaysOpen(issue.date);
                                    const isLateAlert = days > 15 && !issue.executionDate;
                                    
                                    const currentGroupValue = viewMode === 'BY_CLIENT' ? issue.clientName : viewMode === 'BY_CATEGORY' ? issue.category : "";
                                    const showGroupHeader = currentGroupValue && currentGroupValue !== currentGroup;
                                    if (showGroupHeader) currentGroup = String(currentGroupValue);

                                    return (
                                        <React.Fragment key={idx}>
                                            {showGroupHeader && (
                                                <tr className="bg-blue-50/50 border-y border-blue-100">
                                                    <td colSpan={7} className="px-4 py-2">
                                                        <div className="flex items-center gap-2">
                                                            {viewMode === 'BY_CLIENT' ? <HomeIcon className="w-4 h-4 text-blue-600" /> : <TagIcon className="w-4 h-4 text-blue-600" />}
                                                            <span className="text-xs font-black text-blue-800 uppercase tracking-widest">{viewMode === 'BY_CLIENT' ? 'OBRA' : 'CLASSIFICAÇÃO'}: {currentGroupValue}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr className="hover:bg-slate-50/80 transition-colors group">
                                                <td className="p-4">
                                                    <span className="text-sm font-bold text-slate-700">{formatToBR(issue.date.toISOString())}</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`text-sm ${isLateAlert ? 'text-red-600 font-black animate-pulse' : 'text-slate-500'}`}>
                                                        {days}d
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col gap-1">
                                                        <div className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border inline-block w-fit ${issue.category === 'Falta' ? 'bg-red-50 text-red-600 border-red-100' : issue.category === 'Peça Batida' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                                            {issue.category}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold truncate">
                                                            <CubeIcon className="w-3.5 h-3.5 text-slate-400" />
                                                            {issue.location}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <p className="text-sm text-slate-800 font-bold leading-snug break-words max-w-md">{issue.description}</p>
                                                        <span className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">{issue.clientName}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className={`flex items-center gap-1.5 text-xs font-bold ${issue.executionDate ? 'text-blue-700' : 'text-slate-300'}`}>
                                                        <CalendarIcon className="w-3.5 h-3.5" />
                                                        {issue.executionDate ? formatToBR(issue.executionDate) : 'Não agendado'}
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className={`flex items-center gap-1.5 text-xs font-medium ${issue.assemblerName ? 'text-slate-700' : 'text-slate-300'}`}>
                                                        <UserIcon className="w-3.5 h-3.5" />
                                                        {issue.assemblerName || 'Não atribuído'}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <button onClick={() => onSelectClient(issue.clientId)} className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Ver Detalhes da Obra"><ChevronRightIcon className="w-5 h-5"/></button>
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* --- RODAPÉ COM CONTADORES --- */}
                <div className="bg-slate-900 border-t border-slate-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col border-r border-slate-800 md:border-r-0">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Total Filtrado</span>
                        <div className="flex items-center gap-2 mt-1">
                            <ClipboardListIcon className="w-4 h-4 text-blue-400" />
                            <span className="text-xl font-light text-white">{stats.totalPending}</span>
                        </div>
                    </div>
                    <div className="flex flex-col border-r border-slate-800 md:border-r-0">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Obras Afetadas</span>
                        <div className="flex items-center gap-2 mt-1">
                            <HomeIcon className="w-4 h-4 text-indigo-400" />
                            <span className="text-xl font-light text-white">{stats.obrasImpactadas}</span>
                        </div>
                    </div>
                    <div className="flex flex-col border-r border-slate-800 md:border-r-0">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Agendamentos</span>
                        <div className="flex items-center gap-2 mt-1">
                            <CalendarIcon className="w-4 h-4 text-green-400" />
                            <span className="text-xl font-light text-white">{stats.agendadas}</span>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Urgentes (+15 dias)</span>
                        <div className="flex items-center gap-2 mt-1">
                            <ExclamationCircleIcon className="w-4 h-4 text-red-500" />
                            <span className="text-xl font-bold text-red-500">{stats.criticas}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PendingIssuesReport;
