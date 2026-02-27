import React, { useMemo, useState } from 'react';
import { Client, Assembler, ChecklistStatus, Environment } from '../types';
import { 
    CalendarIcon, 
    PrinterIcon, 
    UserIcon, 
    CubeIcon, 
    SearchIcon,
    RefreshIcon,
    CheckCircleIcon,
    ChartBarIcon,
    ExclamationCircleIcon,
    HomeIcon
} from './icons';

interface ForecastItem {
    clientId: string;
    clientName: string;
    environmentId: string;
    environmentName: string;
    assemblerName: string;
    assemblerRole: string;
    scheduledStart: string;
    scheduledEnd: string;
    daysOpen: number;
    isAssistance: boolean;
}

interface CompletionForecastReportProps {
    clients: Client[];
    assemblers: Assembler[];
}

const formatToBR = (isoString?: string) => {
    if (!isoString) return '--/--/----';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return '--/--/----';
    }
};

const calculateDaysOpen = (startStr?: string): number => {
    if (!startStr) return 0;
    const start = new Date(startStr);
    const now = new Date();
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
};

const getDayOfWeek = (dateStr: string) => {
    if (!dateStr) return '';
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    try {
        const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return days[date.getDay()];
    } catch (e) {
        return '';
    }
};

const CompletionForecastReport: React.FC<CompletionForecastReportProps> = ({ clients, assemblers }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const forecasts = useMemo(() => {
        const list: ForecastItem[] = [];
        (clients || []).forEach(client => {
            (client.environments || []).forEach(env => {
                if (env.completionDate) return;
                if (!env.assemblerId || !env.scheduledEnd) return;

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const endDate = new Date(env.scheduledEnd);
                // Note: if scheduledEnd is just YYYY-MM-DD, new Date(scheduledEnd) might be UTC midnight
                // which could result in the previous day in local time.
                // But for comparison with today (local), it's usually okay if we are consistent.
                if (endDate < today) return;

                const assembler = assemblers.find(a => a.id === env.assemblerId);
                if (!assembler) return;
                
                const role = (assembler.role || '').toLowerCase();
                if (role.includes('ajudante') || role.includes('auxiliar')) return;

                list.push({
                    clientId: client.id,
                    clientName: client.name,
                    environmentId: env.id,
                    environmentName: env.name,
                    assemblerName: assembler.name,
                    assemblerRole: assembler.role,
                    scheduledStart: env.scheduledStart || '',
                    scheduledEnd: env.scheduledEnd,
                    daysOpen: calculateDaysOpen(env.scheduledStart),
                    isAssistance: !!env.isAssistance
                });
            });
        });

        return list.sort((a, b) => a.assemblerName.localeCompare(b.assemblerName));
    }, [clients, assemblers]);

    const filteredForecasts = useMemo(() => {
        if (!searchTerm) return forecasts;
        const term = searchTerm.toLowerCase();
        return forecasts.filter(f => 
            f.clientName.toLowerCase().includes(term) ||
            f.assemblerName.toLowerCase().includes(term) ||
            f.environmentName.toLowerCase().includes(term)
        );
    }, [forecasts, searchTerm]);

    const stats = useMemo(() => {
        return {
            total: filteredForecasts.length,
            critical: filteredForecasts.filter(f => f.daysOpen > 10).length
        };
    }, [filteredForecasts]);

    const handleGeneratePdf = async () => {
        setIsGenerating(true);
        try {
            const { jsPDF } = (window as any).jspdf;
            const pdf = new jsPDF('l', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 10;
            let y = 15;

            pdf.setFont('helvetica', 'bold').setFontSize(14);
            pdf.text("PREVISÕES POR MONTADOR", pageWidth / 2, y, { align: 'center' });
            y += 10;

            pdf.setFillColor(30, 41, 59);
            pdf.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
            pdf.setFont('helvetica', 'bold').setTextColor(255).setFontSize(8);
            pdf.text("MONTADOR", margin + 2, y + 4.5);
            pdf.text("CLIENTE", margin + 50, y + 4.5);
            pdf.text("AMBIENTE", margin + 110, y + 4.5);
            pdf.text("PREVISÃO FIM", margin + 170, y + 4.5);
            pdf.text("INÍCIO", margin + 205, y + 4.5);
            pdf.text("DIAS", margin + 235, y + 4.5);
            pdf.text("DIA DA SEMANA", margin + 260, y + 4.5);
            y += 10;

            pdf.setTextColor(0);
            filteredForecasts.forEach((f, idx) => {
                if (y > 185) { pdf.addPage('l', 'mm', 'a4'); y = 15; }
                if (idx % 2 !== 0) {
                    pdf.setFillColor(245, 245, 245);
                    pdf.rect(margin, y - 4, pageWidth - (margin * 2), 8, 'F');
                }

                pdf.setFontSize(8);
                pdf.text(f.assemblerName, margin + 2, y);
                pdf.text(f.clientName.toUpperCase(), margin + 50, y);
                pdf.text(f.environmentName, margin + 110, y);
                pdf.text(formatToBR(f.scheduledEnd), margin + 170, y);
                pdf.text(formatToBR(f.scheduledStart), margin + 205, y);
                pdf.text(`${f.daysOpen}d`, margin + 235, y);
                
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(21, 128, 61).text(getDayOfWeek(f.scheduledEnd).toUpperCase(), margin + 260, y);
                
                pdf.setTextColor(0).setFont('helvetica', 'normal');
                y += 8;
            });

            pdf.save(`Previsoes_Montador_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (e) { alert("Erro ao gerar PDF."); } finally { setIsGenerating(false); }
    };

    return (
        <div className="space-y-4 font-app animate-fadeIn">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <ChartBarIcon className="w-8 h-8 text-blue-600" />
                    <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Previsões por Montador</h2>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-grow min-w-[250px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><SearchIcon className="w-4 h-4" /></div>
                        <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <button onClick={handleGeneratePdf} disabled={isGenerating || filteredForecasts.length === 0} className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50 flex items-center gap-2">
                        <PrinterIcon className="w-4 h-4"/> {isGenerating ? '...' : 'PDF'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                    <div className="bg-blue-50 p-2 rounded-lg"><UserIcon className="w-5 h-5 text-blue-600"/></div>
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Ambientes Ativos</p><p className="text-lg font-black text-slate-800">{stats.total}</p></div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                    <div className="bg-orange-50 p-2 rounded-lg"><ExclamationCircleIcon className="w-5 h-5 text-orange-600"/></div>
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">+10 Dias</p><p className="text-lg font-black text-orange-600">{stats.critical}</p></div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[10px] border-collapse border border-slate-300">
                        <thead>
                            <tr className="bg-slate-900 text-white uppercase tracking-wider font-bold border-b border-slate-800">
                                <th className="p-2 pl-4 border-r border-slate-700">Montador Responsável</th>
                                <th className="p-2 border-r border-slate-700">Cliente</th>
                                <th className="p-2 border-r border-slate-700">Ambiente</th>
                                <th className="p-2 border-r border-slate-700 text-center">Início</th>
                                <th className="p-2 border-r border-slate-700 text-center">Previsão Fim</th>
                                <th className="p-2 border-r border-slate-700 text-center">Dias</th>
                                <th className="p-2 text-center">Dia da Previsão</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300">
                            {filteredForecasts.length === 0 ? (
                                <tr><td colSpan={8} className="p-10 text-center text-slate-400 italic font-medium">Nenhuma previsão encontrada.</td></tr>
                            ) : (
                                filteredForecasts.map((f, idx) => {
                                    const isLate = new Date(f.scheduledEnd) < new Date();
                                    return (
                                        <tr key={`${f.clientId}-${f.environmentId}`} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors group`}>
                                            <td className="p-2 pl-4 font-normal text-slate-700 border-r border-slate-300 uppercase">{f.assemblerName}</td>
                                            <td className="p-2 font-normal text-slate-800 border-r border-slate-300 uppercase">{f.clientName}</td>
                                            <td className="p-2 font-normal text-slate-600 border-r border-slate-300 flex items-center gap-1">
                                                <CubeIcon className="w-3 h-3 text-slate-300"/> {f.environmentName}
                                            </td>
                                            <td className="p-2 text-center border-r border-slate-300 text-slate-500 font-normal">{formatToBR(f.scheduledStart)}</td>
                                            <td className={`p-2 text-center border-r border-slate-300 font-normal ${isLate ? 'text-red-600' : 'text-slate-700'}`}>{formatToBR(f.scheduledEnd)}</td>
                                            <td className={`p-2 text-center border-r border-slate-300 font-normal ${f.daysOpen > 10 ? 'text-orange-600' : 'text-slate-500'}`}>{f.daysOpen}d</td>
                                            <td className="p-2 text-center font-normal">
                                                <span className="text-[9px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded border border-green-200 uppercase">
                                                    {getDayOfWeek(f.scheduledEnd)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CompletionForecastReport;