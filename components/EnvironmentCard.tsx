
import React, { useState, useEffect } from 'react';
import { Client, Environment, ChecklistItem, ChecklistStatus, Assembler } from '../types';
import ChecklistItemComponent from './ChecklistItem';
import Modal from './Modal';
import { TrashIcon, PencilIcon, UserIcon, ClipboardDocumentListIcon, CalendarIcon, ChartBarIcon, ShieldCheckIcon, UserGroupIcon, TagIcon, CheckCircleIcon, XIcon, FolderIcon } from './icons';
import { generateUUID } from '../App';
import TodeschiniReportModal from './TodeschiniReportModal';
import ProjectFilesManager from './ProjectFilesManager';

interface EnvironmentCardProps {
  client: Client;
  clients: Client[]; // Needed for global availability checks
  environment: Environment;
  assemblers?: Assembler[];
  onUpdateClient: (client: Client) => void;
}

// Helper para converter UTC (ISO) para string compatível com input datetime-local
const toLocalInputString = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Ajusta o fuso horário para que o .toISOString() gere a hora local correta para o input
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 16);
};

// Helper para formatar moeda R$
const formatCurrency = (value?: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

// Check if two date ranges overlap
const doDatesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date) => {
    return startA <= endB && endA >= startB;
};

const EnvironmentCard: React.FC<EnvironmentCardProps> = ({ client, clients, environment, assemblers = [], onUpdateClient }) => {
    const [activeView, setActiveView] = useState<'CHECKLIST' | 'PROJETOS'>('CHECKLIST');
    const [newItemDesc, setNewItemDesc] = useState('');
    const [isEditingObs, setIsEditingObs] = useState(false);
    const [envObs, setEnvObs] = useState(environment.observations || '');
    
    // Name Editing State
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState(environment.name);
    const [tempInitials, setTempInitials] = useState(environment.initials || '');

    // Planning / Assembler State
    const [isEditingPlanning, setIsEditingPlanning] = useState(false);
    const [assemblerId, setAssemblerId] = useState(environment.assemblerId || '');
    const [assembler2Id, setAssembler2Id] = useState(environment.assembler2Id || '');
    const [assembler1Percentage, setAssembler1Percentage] = useState<number>(environment.assembler1Percentage || 100);
    const [assembler2Percentage, setAssembler2Percentage] = useState<number>(environment.assembler2Percentage || 0);
    
    const [helperId, setHelperId] = useState(environment.helperId || '');
    const [purchaseOrder, setPurchaseOrder] = useState(environment.purchaseOrder || 'MJF');
    const [portalValue, setPortalValue] = useState<number | ''>(environment.portalValue || '');
    const [manualProgress, setManualProgress] = useState<number>(environment.manualProgress || 0);
    
    // Financial Sync States
    const [paymentLimit, setPaymentLimit] = useState<number>(environment.paymentLimit || 0);
    const [limitMonth, setLimitMonth] = useState<string>(environment.limitMonth || '');
    const [paidPercentage, setPaidPercentage] = useState<number>(environment.paidPercentage || 0);
    const [paidMonth, setPaidMonth] = useState<string>(environment.paidMonth || '');
    
    const [envWeight, setEnvWeight] = useState<number>(environment.weight || 1);
    
    // Usando o helper para garantir que a data exibida seja a local correta
    const [scheduledStart, setScheduledStart] = useState(toLocalInputString(environment.scheduledStart));
    const [scheduledEnd, setScheduledEnd] = useState(toLocalInputString(environment.scheduledEnd));
    const [completionDate, setCompletionDate] = useState(toLocalInputString(environment.completionDate));

    const [modalContent, setModalContent] = useState<{ title: string; items: ChecklistItem[] } | null>(null);
    const [showTodeschiniReport, setShowTodeschiniReport] = useState(false);

    // Sincroniza percentuais para somar 100
    const handleAssembler1PercChange = (val: number) => {
        const capped = Math.min(100, Math.max(0, val));
        setAssembler1Percentage(capped);
        if (assembler2Id) setAssembler2Percentage(100 - capped);
    };

    const handleAssembler2PercChange = (val: number) => {
        const capped = Math.min(100, Math.max(0, val));
        setAssembler2Percentage(capped);
        setAssembler1Percentage(100 - capped);
    };

    // --- LOGICA DE AUTO-PREENCHIMENTO DE SALDO ---
    const handleParcialChange = (val: number) => {
        setPaymentLimit(val);
        // Quando eu lanço uma parcial (adiantamento), o saldo (o que foi pago)
        // para o mês seguinte é exatamente o valor dessa parcial.
        if (val > 0) {
            setPaidPercentage(val);
            if (limitMonth) {
                const [y, m] = limitMonth.split('-').map(Number);
                const nextDate = new Date(y, m, 1); // m já é o próximo mês (0-indexed)
                const nextY = nextDate.getFullYear();
                const nextM = String(nextDate.getMonth() + 1).padStart(2, '0');
                setPaidMonth(`${nextY}-${nextM}`);
            }
        }
    };

    const handleLimitMonthChange = (val: string) => {
        setLimitMonth(val);
        if (paymentLimit > 0 && val) {
            const [y, m] = val.split('-').map(Number);
            const nextDate = new Date(y, m, 1);
            const nextY = nextDate.getFullYear();
            const nextM = String(nextDate.getMonth() + 1).padStart(2, '0');
            setPaidMonth(`${nextY}-${nextM}`);
            setPaidPercentage(paymentLimit);
        }
    };

    // --- LÓGICA DE DISPONIBILIDADE ESTRITA (COM EXCEÇÃO PARA AJUDANTES) ---
    const getAvailablePeople = (roleFilter: 'Assembler' | 'Helper') => {
        // 1. Filtra a lista base pelo papel (Montador ou Ajudante)
        const candidates = assemblers.filter(a => {
            const isHelper = a.role.toLowerCase().includes('ajudante') || a.role.toLowerCase().includes('auxiliar');
            return roleFilter === 'Helper' ? isHelper : !isHelper;
        });

        // 2. Se não houver datas definidas no formulário, retorna todos
        if (!scheduledStart || !scheduledEnd) {
            return candidates;
        }

        const newStart = new Date(scheduledStart);
        const newEnd = new Date(scheduledEnd);

        // 3. Varredura de conflitos
        return candidates.filter(person => {
            // Verifica conflito em TODOS os clientes e TODOS os ambientes
            const hasConflict = clients.some(c => 
                c.environments.some(env => {
                    // Ignora o próprio ambiente que estamos editando
                    if (env.id === environment.id) return false;
                    
                    // Ignora ambientes sem data agendada
                    if (!env.scheduledStart || !env.scheduledEnd) return false;

                    // Verifica se a pessoa está alocada neste ambiente (como montador OU ajudante)
                    const isAssigned = (env.assemblerId === person.id) || (env.assembler2Id === person.id) || (env.helperId === person.id);
                    if (!isAssigned) return false;

                    // Verifica sobreposição de datas
                    const existingStart = new Date(env.scheduledStart);
                    const existingEnd = new Date(env.scheduledEnd);
                    
                    const isOverlapping = doDatesOverlap(newStart, newEnd, existingStart, existingEnd);

                    if (isOverlapping) {
                        // === REGRA DE EXCEÇÃO ===
                        // Se estamos buscando um AJUDANTE (roleFilter === 'Helper')
                        // E o conflito encontrado é no MESMO CLIENTE (c.id === client.id)
                        // Então NÃO consideramos conflito (permite sobreposição).
                        if (roleFilter === 'Helper' && c.id === client.id) {
                            return false; // Permite (Ignora o conflito)
                        }
                        
                        // Caso contrário (Montador, ou Ajudante em OUTRO cliente), é conflito.
                        return true;
                    }

                    return false;
                })
            );

            // Se tiver conflito (hasConflict === true), remove da lista.
            return !hasConflict;
        });
    };

    const availableAssemblers = isEditingPlanning ? getAvailablePeople('Assembler') : [];
    const availableHelpers = isEditingPlanning ? getAvailablePeople('Helper') : [];

    // NOVO: Progresso baseado EXCLUSIVAMENTE no manualProgress definido pelo slider
    const displayProgress = environment.manualProgress || 0;

    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        if (newItemDesc.trim()) {
            const newItem: ChecklistItem = {
                id: generateUUID(),
                description: newItemDesc.trim(),
                status: ChecklistStatus.Pending,
                media: [],
                progress: 0, 
                assemblerId: environment.assemblerId,
                scheduledStart: environment.scheduledStart,
                scheduledEnd: environment.scheduledEnd
            };
            
            const updatedEnvironments = client.environments.map(env => 
                env.id === environment.id
                    ? { ...env, checklist: [newItem, ...env.checklist] }
                    : env
            );

            onUpdateClient({ ...client, environments: updatedEnvironments });
            setNewItemDesc('');
        }
    };

    const handleUpdateItem = (updatedItem: ChecklistItem) => {
        const updatedEnvironments = client.environments.map(env => {
            if (env.id === environment.id) {
                const updatedChecklist = env.checklist.map(item =>
                    item.id === updatedItem.id ? updatedItem : item
                );
                
                return { 
                    ...env, 
                    checklist: updatedChecklist
                };
            }
            return env;
        });
        onUpdateClient({ ...client, environments: updatedEnvironments });
    };

    const handleDeleteItem = (itemId: string) => {
        if (window.confirm("Tem certeza que deseja remover este item da checklist?")) {
            const updatedEnvironments = client.environments.map(env => {
                if (env.id === environment.id) {
                    const updatedChecklist = env.checklist.filter(item => item.id !== itemId);
                    return { ...env, checklist: updatedChecklist };
                }
                return env;
            });
            onUpdateClient({ ...client, environments: updatedEnvironments });
        }
    };
    
    const handleDeleteEnvironment = () => {
        if(window.confirm(`Tem certeza que deseja remover o ambiente "${environment.name}" e todos os seus itens?`)) {
            const updatedEnvironments = client.environments.filter(env => env.id !== environment.id);
            onUpdateClient({ ...client, environments: updatedEnvironments });
        }
    };
    
    const handleSaveEnvObs = () => {
        const updatedEnvironments = client.environments.map(env => 
            env.id === environment.id ? { ...env, observations: envObs } : env
        );
        onUpdateClient({ ...client, environments: updatedEnvironments });
        setIsEditingObs(false);
    };

    const handleSaveName = () => {
        if (!tempName.trim()) return;
        const updatedEnvironments = client.environments.map(env => 
            env.id === environment.id ? { ...env, name: tempName.trim(), initials: tempInitials.trim() } : env
        );
        onUpdateClient({ ...client, environments: updatedEnvironments });
        setIsEditingName(false);
    };

    const handleSavePlanning = () => {
        const sel1 = assemblers.find(a => a.id === assemblerId);
        const sel2 = assemblers.find(a => a.id === assembler2Id);

        const updatedEnvironments = client.environments.map(env => 
            env.id === environment.id ? { 
                ...env, 
                assemblerId: assemblerId,
                assembler: sel1 ? sel1.name : '', 
                assembler2Id: assembler2Id || undefined,
                assembler2: sel2 ? sel2.name : undefined,
                assembler1Percentage: assembler1Percentage,
                assembler2Percentage: assembler2Id ? assembler2Percentage : 0,
                helperId: helperId, 
                purchaseOrder: purchaseOrder,
                portalValue: portalValue === '' ? undefined : portalValue,
                manualProgress: manualProgress,
                paidPercentage: paidPercentage,
                paidMonth: paidMonth,
                paymentLimit: paymentLimit,
                limitMonth: limitMonth,
                weight: envWeight,
                scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : undefined,
                scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : undefined,
                completionDate: completionDate ? new Date(completionDate).toISOString() : undefined
            } : env
        );
        onUpdateClient({ ...client, environments: updatedEnvironments });
        setIsEditingPlanning(false);
    };

    const handleUpdateEnvironment = (updatedEnv: Environment) => {
        const updatedEnvs = client.environments.map(env => 
            env.id === updatedEnv.id ? updatedEnv : env
        );
        onUpdateClient({ ...client, environments: updatedEnvs });
    };

    const handleRemoveAssembler = (idx: 1 | 2) => {
        const name = idx === 1 ? environment.assembler : environment.assembler2;
        if (!name) return;
        if (window.confirm(`Remover o montador "${name}" deste ambiente?`)) {
            const updatedEnvironments = client.environments.map(env => {
                if (env.id === environment.id) {
                    if (idx === 1) return { ...env, assemblerId: '', assembler: '', assembler1Percentage: 100 };
                    return { ...env, assembler2Id: undefined, assembler2: undefined, assembler2Percentage: 0, assembler1Percentage: 100 };
                }
                return env;
            });
            onUpdateClient({ ...client, environments: updatedEnvironments });
        }
    };

    const handleRemoveHelper = () => {
        if (!environment.helperId) return;
        const helperName = assemblers.find(a => a.id === environment.helperId)?.name || 'Ajudante';
        if (window.confirm(`Remover o ajudante "${helperName}" deste ambiente?`)) {
            const updatedEnvironments = client.environments.map(env => 
                env.id === environment.id ? { ...env, helperId: undefined } : env
            );
            onUpdateClient({ ...client, environments: updatedEnvironments });
        }
    };

    const showItems = (title: string, items: ChecklistItem[]) => {
        setModalContent({ title: `${title} (${items.length})`, items });
    };

    const pendingItems = environment.checklist.filter(item => item.status === ChecklistStatus.Pending);
    const defectiveItems = environment.checklist.filter(item => item.status === ChecklistStatus.Defective);
    const completedItems = environment.checklist.filter(item => item.status === ChecklistStatus.Completed);

    // Formatter helpers
    const formatDateTime = (isoString?: string) => {
        if (!isoString) return '---';
        const date = new Date(isoString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    const assignedHelper = assemblers.find(a => a.id === environment.helperId);
    const calculatedValue23 = typeof portalValue === 'number' ? portalValue * 2.3 : 0;

    return (
        <>
            <div className={`bg-white rounded-lg shadow-lg border ${environment.isAssistance ? 'border-purple-300' : 'border-slate-200'}`}>
                {environment.isAssistance && (
                    <div className="bg-purple-100 text-purple-800 text-xs font-medium px-4 py-1 uppercase tracking-wide border-b border-purple-200 rounded-t-lg flex items-center gap-1">
                        <ShieldCheckIcon className="w-4 h-4"/> Assistência Técnica
                    </div>
                )}
                <div className={`p-4 bg-slate-50 border-b border-slate-200 ${!environment.isAssistance ? 'rounded-t-lg' : ''}`}>
                    <div className="flex justify-between items-start">
                        <div className="w-full">
                            <div className="flex justify-between items-center w-full">
                                <div className="flex-1 min-w-0">
                                    {isEditingName ? (
                                        <div className="flex items-center gap-2 animate-fadeIn mb-2">
                                            <input 
                                                value={tempName}
                                                onChange={e => setTempName(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                                                placeholder="Nome"
                                                className="text-lg font-bold text-slate-800 border-b-2 border-blue-500 outline-none bg-transparent w-full max-w-md uppercase"
                                            />
                                            <input 
                                                autoFocus
                                                value={tempInitials}
                                                onChange={e => setTempInitials(e.target.value)}
                                                placeholder="Sigla"
                                                className="text-lg font-bold text-blue-600 border-b-2 border-blue-500 outline-none bg-transparent w-20"
                                            />
                                            <button onClick={handleSaveName} className="text-green-600 hover:text-green-700">
                                                <CheckCircleIcon className="w-6 h-6"/>
                                            </button>
                                            <button onClick={() => { setIsEditingName(false); setTempName(environment.name); setTempInitials(environment.initials || ''); }} className="text-slate-400 hover:text-slate-600">
                                                <XIcon className="w-6 h-6"/>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 group">
                                            <h3 className="text-xl font-bold text-slate-800 truncate">
                                                {environment.name.toUpperCase()}
                                                {environment.initials && <span className="text-blue-600 ml-2">[{environment.initials}]</span>}
                                            </h3>
                                            <div className={`px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-black uppercase shadow-sm`}>Peso {environment.weight || 1}</div>
                                            <button 
                                                onClick={() => { setTempName(environment.name); setTempInitials(environment.initials || ''); setIsEditingName(true); }} 
                                                className="text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Editar nome do ambiente"
                                            >
                                                <PencilIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    )}
                                    
                                    {environment.purchaseOrder && (
                                        <div className="flex flex-wrap gap-1 mt-1 mb-2">
                                            {environment.purchaseOrder.split(',').map(s => s.trim()).filter(Boolean).map((po, idx) => (
                                                <span key={idx} className="flex items-center gap-1 text-[9px] bg-white text-yellow-700 px-1.5 py-0.5 rounded border border-yellow-300 font-medium uppercase tracking-tight shadow-sm">
                                                    <TagIcon className="w-3 h-3 text-yellow-500"/>
                                                    {po}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Visualização de Valores Portal no View Mode */}
                                    {environment.portalValue && (
                                        <div className="flex gap-4 mt-1">
                                            <div className="text-[10px] text-slate-500 uppercase font-medium">Valor Portal: <span className="text-slate-800 font-normal">{formatCurrency(environment.portalValue)}</span></div>
                                            <div className="text-[10px] text-slate-500 uppercase font-medium">2,3: <span className="text-blue-600 font-normal">{formatCurrency(environment.portalValue * 2.3)}</span></div>
                                        </div>
                                    )}
                                </div>
                                {/* Delete & Report Buttons */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button 
                                        onClick={() => setShowTodeschiniReport(true)}
                                        className="text-slate-500 hover:text-blue-600 transition-colors duration-300 p-2 rounded-full hover:bg-blue-50" 
                                        title={`Checklist Todeschini - ${environment.name}`}
                                    >
                                        <ClipboardDocumentListIcon className="w-5 h-5" />
                                    </button>
                                    <button onClick={handleDeleteEnvironment} className="text-slate-400 hover:text-red-600 transition-colors duration-300 p-2 rounded-full hover:bg-red-50" title={`Excluir ambiente ${environment.name}`}>
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            
                            {/* PLANNING SECTION */}
                            <div className="mt-3">
                                {isEditingPlanning ? (
                                    <div className="bg-white p-3 rounded border border-blue-200 shadow-sm space-y-4">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-500 mb-1">INÍCIO (REAL/PREV)</label>
                                                <input 
                                                    type="datetime-local"
                                                    value={scheduledStart}
                                                    onChange={e => setScheduledStart(e.target.value)}
                                                    className="w-full p-1 border border-slate-300 rounded text-xs font-normal"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-500 mb-1">TÉRMINO (PREVISÃO)</label>
                                                <input 
                                                    type="datetime-local"
                                                    value={scheduledEnd}
                                                    onChange={e => setScheduledEnd(e.target.value)}
                                                    className="w-full p-1 border border-slate-300 rounded text-xs font-normal"
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                            <div className="md:col-span-1">
                                                <label className="block text-xs font-medium text-slate-500 mb-1">ORDENS DE COMPRA</label>
                                                <input
                                                    type="text"
                                                    value={purchaseOrder}
                                                    onChange={e => setPurchaseOrder(e.target.value)}
                                                    placeholder="Ex: MJF1, MJF2"
                                                    className="w-full p-1 border border-slate-300 rounded text-xs font-normal"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-500 mb-1">VALOR PORTAL</label>
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1.5 text-xs text-slate-400 font-medium">R$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={portalValue}
                                                        onChange={e => setPortalValue(e.target.value === '' ? '' : Number(e.target.value))}
                                                        placeholder="0,00"
                                                        className="w-full p-1 pl-8 border border-slate-300 rounded text-xs font-normal text-slate-800"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-blue-600 mb-1">2,3</label>
                                                <div className="w-full p-1 bg-blue-50 border border-blue-100 rounded text-xs font-normal text-blue-700">
                                                    {formatCurrency(calculatedValue23)}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-indigo-600 mb-1">PESO (CALC.)</label>
                                                <select 
                                                    value={envWeight}
                                                    onChange={e => setEnvWeight(Number(e.target.value))}
                                                    className="w-full p-1 border border-indigo-300 bg-indigo-50 rounded text-xs font-bold text-indigo-700 outline-none"
                                                >
                                                    <option value={1}>Peso 1 (Normal)</option>
                                                    <option value={2}>Peso 2 (50%)</option>
                                                    <option value={3}>Peso 3 (25%)</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-3">
                                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <UserGroupIcon className="w-4 h-4"/> Alocação de Montadores (Divisão de Ganho)
                                            </h4>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Montador 1</label>
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={assemblerId}
                                                            onChange={(e) => setAssemblerId(e.target.value)}
                                                            className="flex-grow p-1.5 border border-slate-300 rounded text-xs font-bold bg-white"
                                                        >
                                                            <option value="">Nenhum</option>
                                                            {availableAssemblers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                            {assemblerId && !availableAssemblers.find(x => x.id === assemblerId) && (
                                                                <option value={assemblerId}>{assemblers.find(x => x.id === assemblerId)?.name} (Ocupado)</option>
                                                            )}
                                                        </select>
                                                        <div className="relative w-20">
                                                            <input 
                                                                type="number"
                                                                value={assembler1Percentage}
                                                                onChange={e => handleAssembler1PercChange(Number(e.target.value))}
                                                                className="w-full p-1.5 pr-6 border border-slate-300 rounded text-xs font-black text-center text-blue-600"
                                                                placeholder="100"
                                                            />
                                                            <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400">%</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Montador 2 (Opcional)</label>
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={assembler2Id}
                                                            onChange={(e) => {
                                                                setAssembler2Id(e.target.value);
                                                                if (e.target.value) {
                                                                    if (assembler1Percentage === 100) {
                                                                        setAssembler1Percentage(50);
                                                                        setAssembler2Percentage(50);
                                                                    }
                                                                } else {
                                                                    setAssembler1Percentage(100);
                                                                    setAssembler2Percentage(0);
                                                                }
                                                            }}
                                                            className="flex-grow p-1.5 border border-slate-300 rounded text-xs font-bold bg-white"
                                                        >
                                                            <option value="">Nenhum</option>
                                                            {availableAssemblers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                            {assembler2Id && !availableAssemblers.find(x => x.id === assembler2Id) && (
                                                                <option value={assembler2Id}>{assemblers.find(x => x.id === assembler2Id)?.name} (Ocupado)</option>
                                                            )}
                                                        </select>
                                                        <div className="relative w-20">
                                                            <input 
                                                                type="number"
                                                                value={assembler2Percentage}
                                                                onChange={e => handleAssembler2PercChange(Number(e.target.value))}
                                                                disabled={!assembler2Id}
                                                                className="w-full p-1.5 pr-6 border border-slate-300 rounded text-xs font-black text-center text-blue-600 disabled:opacity-50"
                                                                placeholder="0"
                                                            />
                                                            <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400">%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            {assembler2Id && (assembler1Percentage + assembler2Percentage !== 100) && (
                                                <p className="text-[10px] font-bold text-red-500 italic">Atenção: A soma dos percentuais deve ser 100%.</p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-500 mb-1">AJUDANTE (Opcional)</label>
                                                <select
                                                    value={helperId}
                                                    onChange={(e) => setHelperId(e.target.value)}
                                                    className="w-full p-1.5 border border-slate-300 rounded text-xs bg-slate-50 font-normal"
                                                >
                                                    <option value="">Nenhum</option>
                                                    {availableHelpers.map(a => (
                                                        <option key={a.id} value={a.id}>{a.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-green-600 mb-1">CONCLUSÃO (REAL)</label>
                                                <input 
                                                    type="datetime-local"
                                                    value={completionDate}
                                                    onChange={e => setCompletionDate(e.target.value)}
                                                    className="w-full p-1 border border-green-300 bg-green-50 rounded text-xs font-normal"
                                                />
                                            </div>
                                        </div>

                                        {/* CONTROLE FINANCEIRO: Adiantamentos e Parcelamentos */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Pagamento Parcial (Teto para o mês atual/início) */}
                                            <div className="bg-blue-50 p-2 rounded border border-blue-200 grid grid-cols-2 gap-2">
                                                <div className="col-span-2 flex justify-between items-center mb-1">
                                                    <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest block">Lançar Parcial Automática</span>
                                                    {paymentLimit > 0 && (
                                                        <span className="text-[8px] font-bold text-blue-500 bg-white px-1 rounded border">Saldo Previsto: {100 - paymentLimit}%</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Parcial (%)</label>
                                                    <input 
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={paymentLimit}
                                                        onChange={e => handleParcialChange(Number(e.target.value))}
                                                        className="w-full p-1 border border-blue-300 rounded text-xs font-bold text-blue-800 outline-none"
                                                        placeholder="Ex: 30"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mês Pagto.</label>
                                                    <input 
                                                        type="month"
                                                        value={limitMonth}
                                                        onChange={e => handleLimitMonthChange(e.target.value)}
                                                        className="w-full p-1 border border-blue-300 rounded text-xs font-bold text-blue-800 outline-none"
                                                    />
                                                </div>
                                                <p className="col-span-2 text-[8px] text-blue-400 leading-tight italic">* Ao preencher este campo, o sistema lança a dedução automática para o mês seguinte.</p>
                                            </div>

                                            {/* Já Pago (Dedução histórica) */}
                                            <div className="bg-orange-50 p-2 rounded border border-orange-200 grid grid-cols-2 gap-2">
                                                <div className="col-span-2">
                                                    <span className="text-[9px] font-black text-orange-700 uppercase tracking-widest block mb-1">Informar Já Pago (Dedução)</span>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Já Pago (%)</label>
                                                    <input 
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={paidPercentage}
                                                        onChange={e => setPaidPercentage(Number(e.target.value))}
                                                        className="w-full p-1 border border-orange-300 rounded text-xs font-bold text-orange-700 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mês Pago</label>
                                                    <input 
                                                        type="month"
                                                        value={paidMonth}
                                                        onChange={e => setPaidMonth(e.target.value)}
                                                        className="w-full p-1 border border-orange-300 rounded text-xs font-bold text-orange-700 outline-none"
                                                    />
                                                </div>
                                                <p className="col-span-2 text-[8px] text-orange-400 leading-tight italic">* Este valor abate o recebimento do mês selecionado.</p>
                                            </div>
                                        </div>

                                        {/* Slider de Progresso Manual - ÚNICA FONTE DE VERDADE PARA PROGRESSO */}
                                        <div className="bg-slate-50 p-2 rounded border border-slate-200">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="block text-xs font-bold text-blue-600 uppercase">Ajustar Progresso do Ambiente</label>
                                                <span className="text-xs font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">{manualProgress}%</span>
                                            </div>
                                            <input 
                                                type="range"
                                                min="0"
                                                max="100"
                                                step="5"
                                                value={manualProgress}
                                                onChange={e => setManualProgress(Number(e.target.value))}
                                                className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                        </div>

                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setIsEditingPlanning(false)} className="px-3 py-1 bg-slate-200 text-xs rounded text-slate-700 font-medium">Cancelar</button>
                                            <button 
                                                onClick={handleSavePlanning} 
                                                disabled={assembler2Id && (assembler1Percentage + assembler2Percentage !== 100)}
                                                className="px-3 py-1 bg-blue-600 text-xs rounded text-white font-medium disabled:opacity-50"
                                            >
                                                Salvar Planejamento
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2 text-sm text-slate-600 bg-white/50 p-2 rounded border border-slate-200/50">
                                        <div className="flex flex-col sm:flex-row flex-wrap sm:items-center gap-2 sm:gap-4">
                                            <div className="flex items-center gap-1 group/ass">
                                                <UserIcon className="w-4 h-4 text-slate-400" />
                                                <span className="font-medium text-slate-800">
                                                    {environment.assembler || 'Não atribuído'}
                                                    {environment.assembler2 && ` (${environment.assembler1Percentage}%) / ${environment.assembler2} (${environment.assembler2Percentage}%)`}
                                                </span>
                                                {environment.assemblerId && (
                                                    <button onClick={() => handleRemoveAssembler(1)} className="ml-1 text-slate-300 hover:text-red-500 opacity-0 group-hover/ass:opacity-100 transition-opacity" title="Remover Montador">
                                                        <XIcon className="w-3 h-3" />
                                                    </button>
                                                )}
                                                {environment.assembler2Id && (
                                                     <button onClick={() => handleRemoveAssembler(2)} className="ml-1 text-slate-300 hover:text-red-500 opacity-0 group-hover/ass:opacity-100 transition-opacity" title="Remover Segundo Montador">
                                                        <XIcon className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                            {assignedHelper && (
                                                <div className="flex items-center gap-1 group/help">
                                                    <UserGroupIcon className="w-4 h-4 text-slate-400" />
                                                    <span className="text-xs text-slate-600 font-normal">Ajudante: {assignedHelper.name}</span>
                                                    <button onClick={handleRemoveHelper} className="ml-1 text-slate-300 hover:text-red-500 opacity-0 group-hover/help:opacity-100 transition-opacity" title="Remover Ajudante">
                                                        <XIcon className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                            {environment.paymentLimit ? (
                                                <div className="flex items-center gap-1">
                                                    <ChartBarIcon className="w-4 h-4 text-blue-500" />
                                                    <span className="text-[10px] font-bold text-blue-600 uppercase">Parcial: {environment.paymentLimit}% ({environment.limitMonth || 'N/A'})</span>
                                                </div>
                                            ) : null}
                                            {environment.paidPercentage ? (
                                                <div className="flex items-center gap-1">
                                                    <ChartBarIcon className="w-4 h-4 text-orange-500" />
                                                    <span className="text-[10px] font-bold text-orange-600 uppercase">Dedução: {environment.paidPercentage}% ({environment.paidMonth || 'N/A'})</span>
                                                </div>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-col sm:flex-row flex-wrap sm:items-center gap-2 sm:gap-4">
                                            <div className="flex items-center gap-1">
                                                <CalendarIcon className="w-4 h-4 text-green-600" />
                                                <span className="text-xs font-normal">Início: <b className="font-medium">{formatDateTime(environment.scheduledStart)}</b></span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <CalendarIcon className="w-4 h-4 text-red-500" />
                                                <span className="text-xs font-normal">Prev. Fim: <b className="font-medium">{formatDateTime(environment.scheduledEnd)}</b></span>
                                            </div>
                                            {environment.completionDate && (
                                                <div className="flex items-center gap-1">
                                                    <CheckCircleIcon className="w-4 h-4 text-green-600" />
                                                    <span className="text-xs font-normal">Concluído: <b className="font-medium">{formatDateTime(environment.completionDate)}</b></span>
                                                </div>
                                            )}
                                            <button onClick={() => {
                                                setAssemblerId(environment.assemblerId || '');
                                                setAssembler2Id(environment.assembler2Id || '');
                                                setAssembler1Percentage(environment.assembler1Percentage || 100);
                                                setAssembler2Percentage(environment.assembler2Percentage || 0);
                                                setHelperId(environment.helperId || '');
                                                setPurchaseOrder(environment.purchaseOrder || 'MJF');
                                                setPortalValue(environment.portalValue || '');
                                                setManualProgress(environment.manualProgress || 0);
                                                setPaidPercentage(environment.paidPercentage || 0);
                                                setPaidMonth(environment.paidMonth || '');
                                                setPaymentLimit(environment.paymentLimit || 0);
                                                setLimitMonth(environment.limitMonth || '');
                                                setEnvWeight(environment.weight || 1);
                                                setScheduledStart(toLocalInputString(environment.scheduledStart));
                                                setScheduledEnd(toLocalInputString(environment.scheduledEnd));
                                                setCompletionDate(toLocalInputString(environment.completionDate));
                                                setIsEditingPlanning(true);
                                            }} className="text-blue-600 hover:underline flex items-center gap-1 ml-auto text-xs font-medium">
                                                <PencilIcon className="w-3 h-3"/> Editar Planejamento
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* VIEW TABS */}
                    <div className="flex border-b border-slate-200 mt-6 overflow-hidden bg-slate-100 rounded-t-lg">
                        <button 
                            onClick={() => setActiveView('CHECKLIST')}
                            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all ${activeView === 'CHECKLIST' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-slate-400 hover:bg-white/50'}`}
                        >
                            Checklist de Montagem
                        </button>
                        <button 
                            onClick={() => setActiveView('PROJETOS')}
                            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeView === 'PROJETOS' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-slate-400 hover:bg-white/50'}`}
                        >
                            <FolderIcon className="w-4 h-4" /> Arquivos de Projeto
                        </button>
                    </div>
                    
                    {activeView === 'CHECKLIST' ? (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                <div className="bg-slate-100 rounded p-2 text-center">
                                    <p className="text-xs text-slate-500 uppercase font-medium mb-1">Status do Ambiente</p>
                                    <div className="relative pt-1">
                                        <div className="flex mb-2 items-center justify-between">
                                            <div>
                                                <span className="text-xs font-medium inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                                                    {displayProgress === 100 ? 'Concluído' : displayProgress > 0 ? 'Em Andamento' : 'Falta'}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs font-medium inline-block text-blue-600">
                                                    {displayProgress}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
                                            <div style={{ width: `${displayProgress}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-500"></div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-2">
                                    <button 
                                        onClick={() => showItems('Pendentes', pendingItems)}
                                        className={`flex flex-col items-center justify-center p-2 rounded border ${pendingItems.length > 0 ? 'bg-yellow-50 border-yellow-200 cursor-pointer hover:bg-yellow-100' : 'bg-slate-50 border-slate-100'}`}
                                        disabled={pendingItems.length === 0}
                                    >
                                        <span className={`text-lg font-medium ${pendingItems.length > 0 ? 'text-yellow-600' : 'text-slate-300'}`}>{pendingItems.length}</span>
                                        <span className="text-[10px] text-slate-500 uppercase font-normal">Faltas</span>
                                    </button>
                                    <button 
                                        onClick={() => showItems('ASTECA', defectiveItems)}
                                        className={`flex flex-col items-center justify-center p-2 rounded border ${defectiveItems.length > 0 ? 'bg-red-50 border-red-200 cursor-pointer hover:bg-red-100' : 'bg-slate-50 border-slate-100'}`}
                                        disabled={defectiveItems.length === 0}
                                    >
                                        <span className={`text-lg font-medium ${defectiveItems.length > 0 ? 'text-red-600' : 'text-slate-300'}`}>{defectiveItems.length}</span>
                                        <span className="text-[10px] text-slate-500 uppercase font-normal">ASTECA</span>
                                    </button>
                                    <button 
                                        onClick={() => showItems('Concluídos', completedItems)}
                                        className={`flex flex-col items-center justify-center p-2 rounded border ${completedItems.length > 0 ? 'bg-green-50 border-green-200 cursor-pointer hover:bg-green-100' : 'bg-slate-50 border-slate-100'}`}
                                        disabled={completedItems.length === 0}
                                    >
                                        <span className={`text-lg font-medium ${completedItems.length > 0 ? 'text-green-600' : 'text-slate-300'}`}>{completedItems.length}</span>
                                        <span className="text-[10px] text-slate-500 uppercase font-normal">Prontos</span>
                                    </button>
                                </div>
                            </div>
                            
                            {!isEditingObs ? (
                                <div className="mt-4 flex items-start gap-2 text-sm text-slate-600 bg-white p-2 rounded border border-slate-100">
                                    <span className="font-medium text-xs uppercase text-slate-400 mt-0.5">Obs:</span>
                                    <p className="flex-grow font-normal">{environment.observations || "Nenhuma observação."}</p>
                                    <button onClick={() => setIsEditingObs(true)} className="text-slate-400 hover:text-blue-600">
                                        <PencilIcon className="w-4 h-4"/>
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-4">
                                    <textarea 
                                        value={envObs}
                                        onChange={e => setEnvObs(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none font-normal"
                                        rows={2}
                                        placeholder="Observações do ambiente..."
                                    />
                                    <div className="flex justify-end gap-2 mt-2">
                                        <button onClick={() => setIsEditingObs(false)} className="text-xs px-3 py-1 bg-slate-200 rounded hover:bg-slate-300 font-medium">Cancelar</button>
                                        <button onClick={handleSaveEnvObs} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">Salvar</button>
                                    </div>
                                </div>
                            )}

                            <div className="p-4 bg-white rounded-b-lg mt-4 border-t border-slate-200">
                                <form onSubmit={handleAddItem} className="flex gap-2 mb-4">
                                    <input
                                        type="text"
                                        value={newItemDesc}
                                        onChange={e => setNewItemDesc(e.target.value)}
                                        placeholder="Adicionar novo item à checklist..."
                                        className="flex-grow px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal"
                                    />
                                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-700 shadow-sm transition-colors">
                                        Adicionar
                                    </button>
                                </form>

                                <div className="space-y-3">
                                    {environment.checklist.length === 0 && (
                                        <p className="text-center text-slate-400 italic py-4 font-normal">Nenhum item na checklist.</p>
                                    )}
                                    {environment.checklist.map(item => (
                                        <ChecklistItemComponent
                                            key={item.id}
                                            item={item}
                                            assemblers={assemblers}
                                            onUpdate={handleUpdateItem}
                                            onDelete={handleDeleteItem}
                                        />
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="p-4 bg-white rounded-b-lg mt-4">
                            <ProjectFilesManager environment={environment} onUpdateEnvironment={handleUpdateEnvironment} />
                        </div>
                    )}
                </div>
            </div>

            {modalContent && (
                <Modal onClose={() => setModalContent(null)}>
                    <div className="p-2">
                        <h3 className="text-xl font-bold text-slate-800 mb-4">{modalContent.title}</h3>
                        <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                            {modalContent.items.map(item => (
                                <li key={item.id} className="p-3 bg-slate-50 rounded border border-slate-200">
                                    <p className="font-medium text-slate-800">{item.description}</p>
                                    {item.status === ChecklistStatus.Defective && (
                                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-red-700 border-t border-red-100 pt-2 font-normal">
                                            <p><b className="font-medium">OC:</b> {item.astecaOC || '---'}</p>
                                            <p><b className="font-medium">Nº ASTECA:</b> {item.astecaNumber || '---'}</p>
                                            <p><b className="font-medium">DATA:</b> {item.astecaDate ? new Date(item.astecaDate).toLocaleDateString('pt-BR') : '---'}</p>
                                            <p><b className="font-medium">MOTIVO:</b> {item.astecaReason || '---'}</p>
                                        </div>
                                    )}
                                    {item.observations && <p className="text-sm text-slate-500 mt-1 italic font-normal">Obs: {item.observations}</p>}
                                </li>
                            ))}
                        </ul>
                    </div>
                </Modal>
            )}

            {showTodeschiniReport && (
                <TodeschiniReportModal 
                    client={client} 
                    environment={environment}
                    onClose={() => setShowTodeschiniReport(false)} 
                    onUpdateClient={onUpdateClient} 
                />
            )}
        </>
    );
};

export default EnvironmentCard;
