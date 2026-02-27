
import React, { useState } from 'react';
import { Client, Environment, ChecklistItem, ChecklistStatus, Assembler } from '../types';
import { ToolsIcon, CalendarIcon, UserIcon, UserGroupIcon, PlusCircleIcon, ShieldCheckIcon, TrashIcon, ExclamationCircleIcon, PauseIcon, PencilIcon, CheckCircleIcon } from './icons';
import { generateUUID } from '../App';

interface AssistanceManagerProps {
  client: Client;
  clients: Client[];
  assemblers: Assembler[];
  onUpdateClient: (client: Client) => void;
}

// Helpers
const doDatesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date) => {
    return startA <= endB && endA >= startB;
};

// Helper para converter UTC (ISO) para string compatível com input datetime-local
const toLocalInputString = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 16);
};

const AssistanceManager: React.FC<AssistanceManagerProps> = ({ client, clients, assemblers, onUpdateClient }) => {
    const [isCreating, setIsCreating] = useState(false);
    
    // Create Form State
    const [createName, setCreateName] = useState('');
    const [createDesc, setCreateDesc] = useState('');
    const [createStart, setCreateStart] = useState('');
    const [createEnd, setCreateEnd] = useState('');
    const [createAssembler, setCreateAssembler] = useState('');
    const [createHelper, setCreateHelper] = useState('');

    // Inline Edit Header State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState({
        name: '',
        assemblerId: '',
        helperId: '',
        start: '',
        end: '',
        completionDate: '' // New Field
    });

    // Add Item State (Map by Env ID to allow independent inputs if needed, or single state)
    const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});

    // --- LOGIC: Filter Assemblers ---
    const sortedAssemblers = [...assemblers].sort((a, b) => {
        const aIsTech = a.role.toLowerCase().includes('técnico') || a.role.toLowerCase().includes('assistência');
        const bIsTech = b.role.toLowerCase().includes('técnico') || b.role.toLowerCase().includes('assistência');
        if (aIsTech && !bIsTech) return -1;
        if (!aIsTech && bIsTech) return 1;
        return a.name.localeCompare(b.name);
    });

    const validMainAssemblers = sortedAssemblers.filter(a => !a.role.toLowerCase().includes('ajudante') && !a.role.toLowerCase().includes('auxiliar'));
    const validHelpers = assemblers.filter(a => a.role.toLowerCase().includes('ajudante') || a.role.toLowerCase().includes('auxiliar'));

    // --- LOGIC: Availability Check ---
    const getAvailablePeople = (roleFilter: 'Assembler' | 'Helper', startStr: string, endStr: string, excludeEnvId?: string) => {
        const candidates = roleFilter === 'Assembler' ? validMainAssemblers : validHelpers;
        if (!startStr || !endStr) return candidates;

        const newStart = new Date(startStr);
        const newEnd = new Date(endStr);

        return candidates.filter(person => {
            const hasConflict = clients.some(c => 
                c.environments.some(env => {
                    if (env.id === excludeEnvId) return false; // Ignore self when editing
                    if (!env.scheduledStart || !env.scheduledEnd) return false;

                    const isAssigned = (env.assemblerId === person.id) || (env.helperId === person.id);
                    if (!isAssigned) return false;

                    const existingStart = new Date(env.scheduledStart);
                    const existingEnd = new Date(env.scheduledEnd);
                    
                    const isOverlapping = doDatesOverlap(newStart, newEnd, existingStart, existingEnd);

                    if (isOverlapping) {
                        if (roleFilter === 'Helper' && c.id === client.id) return false;
                        return true;
                    }
                    return false;
                })
            );
            return !hasConflict;
        });
    };

    // --- CRUD ACTIONS ---

    const handleCreateAssistance = (e: React.FormEvent) => {
        e.preventDefault();
        if (!createName || !createDesc || !createStart || !createEnd || !createAssembler) {
            alert("Preencha todos os campos obrigatórios.");
            return;
        }

        const selectedAssembler = assemblers.find(a => a.id === createAssembler);

        const newEnv: Environment = {
            id: generateUUID(),
            name: createName.trim(),
            isAssistance: true,
            assemblerId: createAssembler,
            assembler: selectedAssembler?.name || '',
            helperId: createHelper || undefined,
            scheduledStart: new Date(createStart).toISOString(),
            scheduledEnd: new Date(createEnd).toISOString(),
            checklist: [
                {
                    id: generateUUID(),
                    description: createDesc.trim(),
                    status: ChecklistStatus.Pending,
                    media: [],
                    progress: 0,
                    assemblerId: createAssembler,
                    scheduledStart: new Date(createStart).toISOString(),
                    scheduledEnd: new Date(createEnd).toISOString()
                }
            ],
            observations: 'Assistência Técnica'
        };

        onUpdateClient({ ...client, environments: [...client.environments, newEnv] });
        resetCreateForm();
    };

    const resetCreateForm = () => {
        setCreateName('');
        setCreateDesc('');
        setCreateStart('');
        setCreateEnd('');
        setCreateAssembler('');
        setCreateHelper('');
        setIsCreating(false);
    };

    // --- HEADER EDITING ---
    const startEditingHeader = (env: Environment) => {
        setEditingId(env.id);
        setEditData({
            name: env.name,
            assemblerId: env.assemblerId || '',
            helperId: env.helperId || '',
            start: toLocalInputString(env.scheduledStart),
            end: toLocalInputString(env.scheduledEnd),
            completionDate: toLocalInputString(env.completionDate)
        });
    };

    const saveHeader = () => {
        if (!editingId) return;
        
        const selectedAssembler = assemblers.find(a => a.id === editData.assemblerId);

        const updatedEnvs = client.environments.map(env => {
            if (env.id === editingId) {
                const newStartISO = editData.start ? new Date(editData.start).toISOString() : undefined;
                const newEndISO = editData.end ? new Date(editData.end).toISOString() : undefined;
                const newCompletionISO = editData.completionDate ? new Date(editData.completionDate).toISOString() : undefined;

                const updatedChecklist = env.checklist.map(item => ({
                    ...item,
                    assemblerId: editData.assemblerId,
                    scheduledStart: newStartISO,
                    scheduledEnd: newEndISO
                }));

                return {
                    ...env,
                    name: editData.name,
                    assemblerId: editData.assemblerId,
                    assembler: selectedAssembler?.name || '', // Legacy sync
                    helperId: editData.helperId || undefined,
                    scheduledStart: newStartISO,
                    scheduledEnd: newEndISO,
                    completionDate: newCompletionISO,
                    checklist: updatedChecklist
                };
            }
            return env;
        });

        onUpdateClient({ ...client, environments: updatedEnvs });
        setEditingId(null);
    };

    // --- ITEM ACTIONS ---

    const handleAddItem = (envId: string) => {
        const desc = newItemTexts[envId];
        if (!desc?.trim()) return;

        const updatedEnvs = client.environments.map(env => {
            if (env.id === envId) {
                const newItem: ChecklistItem = {
                    id: generateUUID(),
                    description: desc.trim(),
                    status: ChecklistStatus.Pending,
                    progress: 0,
                    media: [],
                    assemblerId: env.assemblerId,
                    scheduledStart: env.scheduledStart,
                    scheduledEnd: env.scheduledEnd
                };
                return { ...env, checklist: [...env.checklist, newItem] };
            }
            return env;
        });

        onUpdateClient({ ...client, environments: updatedEnvs });
        setNewItemTexts(prev => ({ ...prev, [envId]: '' }));
    };

    const handleUpdateProgress = (envId: string, itemId: string, val: number) => {
        const updatedEnvs = client.environments.map(env => {
            if (env.id === envId) {
                const updatedChecklist = env.checklist.map(item => {
                    if (item.id === itemId) {
                        const newStatus = val === 100 ? ChecklistStatus.Completed : ChecklistStatus.Pending;
                        return { 
                            ...item, 
                            progress: val, 
                            status: newStatus,
                            completionDate: val === 100 ? new Date().toISOString() : undefined 
                        };
                    }
                    return item;
                });
                return { ...env, checklist: updatedChecklist };
            }
            return env;
        });
        onUpdateClient({ ...client, environments: updatedEnvs });
    };

    const handleDeleteItem = (envId: string, itemId: string) => {
        if (!window.confirm("Remover este item?")) return;
        const updatedEnvs = client.environments.map(env => {
            if (env.id === envId) {
                return { ...env, checklist: env.checklist.filter(i => i.id !== itemId) };
            }
            return env;
        });
        onUpdateClient({ ...client, environments: updatedEnvs });
    };

    const handleDeleteAssistance = (envId: string) => {
        if(window.confirm("Excluir esta assistência e todo o histórico?")) {
            const updatedEnvs = client.environments.filter(env => env.id !== envId);
            onUpdateClient({...client, environments: updatedEnvs});
        }
    };

    const assistances = client.environments.filter(env => env.isAssistance);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <h3 className="text-lg font-semibold text-purple-800 flex items-center gap-2">
                    <ToolsIcon className="w-6 h-6" />
                    Gestão de Assistências ({assistances.length})
                </h3>
                {!isCreating && (
                    <button 
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 font-medium shadow-sm transition-colors"
                    >
                        <PlusCircleIcon className="w-5 h-5" /> Nova Assistência
                    </button>
                )}
            </div>

            {isCreating && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 animate-fadeIn shadow-sm">
                    <h4 className="font-bold text-purple-800 mb-4">Agendar Nova Assistência</h4>
                    <form onSubmit={handleCreateAssistance} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">AMBIENTE / LOCAL</label>
                                <input 
                                    type="text" 
                                    value={createName}
                                    onChange={e => setCreateName(e.target.value)}
                                    placeholder="Ex: Cozinha, Quarto Master..."
                                    className="w-full p-2 border border-slate-300 rounded text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">ITEM INICIAL</label>
                                <input 
                                    type="text" 
                                    value={createDesc}
                                    onChange={e => setCreateDesc(e.target.value)}
                                    placeholder="Ex: Trocar dobradiça porta esquerda..."
                                    className="w-full p-2 border border-slate-300 rounded text-sm"
                                    required
                                />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">INÍCIO PREVISTO</label>
                                <input 
                                    type="datetime-local" 
                                    value={createStart}
                                    onChange={e => setCreateStart(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">TÉRMINO PREVISTO</label>
                                <input 
                                    type="datetime-local" 
                                    value={createEnd}
                                    onChange={e => setCreateEnd(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">MONTADOR / TÉCNICO</label>
                                <select 
                                    value={createAssembler}
                                    onChange={e => setCreateAssembler(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded text-sm bg-white"
                                    required
                                >
                                    <option value="">Selecione...</option>
                                    {getAvailablePeople('Assembler', createStart, createEnd).map(a => (
                                        <option key={a.id} value={a.id}>{a.name} - {a.role}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">AJUDANTE (Opcional)</label>
                                <select 
                                    value={createHelper}
                                    onChange={e => setCreateHelper(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded text-sm bg-white"
                                >
                                    <option value="">Nenhum</option>
                                    {getAvailablePeople('Helper', createStart, createEnd).map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button 
                                type="button" 
                                onClick={resetCreateForm}
                                className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit"
                                className="px-4 py-2 bg-purple-600 text-white font-bold rounded hover:bg-purple-700 shadow-sm transition-colors"
                            >
                                Agendar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="space-y-6">
                {assistances.length === 0 && !isCreating && (
                    <p className="text-center text-slate-400 py-8 italic">Nenhuma assistência registrada.</p>
                )}

                {assistances.map(assist => {
                    const isEditingThis = editingId === assist.id;
                    const isPaused = !assist.scheduledStart;
                    const isCompleted = !!assist.completionDate;

                    return (
                        <div key={assist.id} className={`bg-white border-l-4 ${isCompleted ? 'border-l-green-500' : isPaused ? 'border-l-red-500' : 'border-l-purple-500'} border border-slate-200 rounded-lg shadow-sm overflow-hidden`}>
                            {/* --- HEADER SECTION --- */}
                            <div className="p-4 bg-slate-50 border-b border-slate-100">
                                {isEditingThis ? (
                                    <div className="bg-white p-3 rounded border border-blue-200 shadow-inner space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500">NOME DO AMBIENTE</label>
                                                <input 
                                                    value={editData.name}
                                                    onChange={e => setEditData({...editData, name: e.target.value})}
                                                    className="w-full p-1.5 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500">MONTADOR</label>
                                                <select 
                                                    value={editData.assemblerId}
                                                    onChange={e => setEditData({...editData, assemblerId: e.target.value})}
                                                    className="w-full p-1.5 border rounded text-sm bg-white"
                                                >
                                                    {getAvailablePeople('Assembler', editData.start, editData.end, assist.id).map(a => (
                                                        <option key={a.id} value={a.id}>{a.name}</option>
                                                    ))}
                                                    {/* Maintain current even if busy */}
                                                    {!getAvailablePeople('Assembler', editData.start, editData.end, assist.id).find(a => a.id === editData.assemblerId) && (
                                                        <option value={editData.assemblerId}>{assemblers.find(a => a.id === editData.assemblerId)?.name} (Ocupado/Atual)</option>
                                                    )}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500">INÍCIO</label>
                                                <input 
                                                    type="datetime-local"
                                                    value={editData.start}
                                                    onChange={e => setEditData({...editData, start: e.target.value})}
                                                    className="w-full p-1.5 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500">FIM</label>
                                                <input 
                                                    type="datetime-local"
                                                    value={editData.end}
                                                    onChange={e => setEditData({...editData, end: e.target.value})}
                                                    className="w-full p-1.5 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500">AJUDANTE</label>
                                                <select 
                                                    value={editData.helperId}
                                                    onChange={e => setEditData({...editData, helperId: e.target.value})}
                                                    className="w-full p-1.5 border rounded text-sm bg-white"
                                                >
                                                    <option value="">Nenhum</option>
                                                    {getAvailablePeople('Helper', editData.start, editData.end, assist.id).map(a => (
                                                        <option key={a.id} value={a.id}>{a.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-green-700 flex items-center gap-1">
                                                    <CheckCircleIcon className="w-3 h-3"/> CONCLUSÃO (REAL)
                                                </label>
                                                <input 
                                                    type="datetime-local"
                                                    value={editData.completionDate}
                                                    onChange={e => setEditData({...editData, completionDate: e.target.value})}
                                                    className="w-full p-1.5 border border-green-300 bg-green-50 rounded text-sm focus:ring-green-500"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 pt-2">
                                            <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-slate-200 text-slate-700 rounded text-xs font-bold">Cancelar</button>
                                            <button onClick={saveHeader} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold">Salvar Alterações</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-slate-800 text-lg">{assist.name}</h4>
                                                {isCompleted ? (
                                                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded border border-green-200 uppercase flex items-center gap-1">
                                                        <CheckCircleIcon className="w-3 h-3"/> Concluído
                                                    </span>
                                                ) : isPaused && (
                                                    <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded border border-red-200 uppercase flex items-center gap-1">
                                                        <ExclamationCircleIcon className="w-3 h-3"/> Pausado
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-4 text-xs text-slate-500 mt-1">
                                                <div className="flex items-center gap-1">
                                                    <UserIcon className="w-3 h-3"/> 
                                                    <span className="font-semibold text-slate-700">{assist.assembler || 'Sem técnico'}</span>
                                                </div>
                                                {assist.helperId && (
                                                    <div className="flex items-center gap-1">
                                                        <UserGroupIcon className="w-3 h-3"/> 
                                                        <span>Ajudante: {assemblers.find(a => a.id === assist.helperId)?.name || '...'}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-1">
                                                    <CalendarIcon className="w-3 h-3"/> 
                                                    {isPaused ? (
                                                        <span className="text-red-500 font-bold">Sem data definida</span>
                                                    ) : (
                                                        <span>
                                                            {new Date(assist.scheduledStart!).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})} 
                                                            {' - '} 
                                                            {new Date(assist.scheduledEnd!).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}
                                                        </span>
                                                    )}
                                                </div>
                                                {assist.completionDate && (
                                                    <div className="flex items-center gap-1 text-green-700 font-bold">
                                                        <CheckCircleIcon className="w-3 h-3"/>
                                                        <span>Concluído: {new Date(assist.completionDate).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 self-end md:self-auto">
                                            <button 
                                                onClick={() => startEditingHeader(assist)}
                                                className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-xs font-semibold border border-transparent hover:border-blue-200 transition-colors"
                                            >
                                                <PencilIcon className="w-3 h-3"/> Editar Detalhes
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteAssistance(assist.id)}
                                                className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                                                title="Excluir Assistência"
                                            >
                                                <TrashIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* --- ITEMS LIST SECTION (Inline) --- */}
                            <div className="p-4 space-y-3">
                                {assist.checklist.map(item => (
                                    <div key={item.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 p-2 rounded-md hover:shadow-sm transition-shadow">
                                        <div className="flex-grow min-w-0">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className={`text-sm font-medium ${item.status === ChecklistStatus.Completed ? 'text-green-700 line-through' : 'text-slate-700'}`}>
                                                    {item.description}
                                                </span>
                                                <span className={`text-xs font-bold ${item.progress === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                                                    {item.progress || 0}%
                                                </span>
                                            </div>
                                            <input 
                                                type="range" 
                                                min="0" 
                                                max="100" 
                                                step="10" 
                                                value={item.progress || 0}
                                                onChange={(e) => handleUpdateProgress(assist.id, item.id, Number(e.target.value))}
                                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                        </div>
                                        <button 
                                            onClick={() => handleDeleteItem(assist.id, item.id)}
                                            className="text-slate-300 hover:text-red-500 p-1"
                                            title="Remover item"
                                        >
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                    </div>
                                ))}
                                {assist.checklist.length === 0 && <p className="text-xs text-slate-400 italic text-center">Nenhum item na lista.</p>}

                                {/* Add New Item Inline */}
                                <div className="flex gap-2 pt-2 mt-2 border-t border-slate-100">
                                    <input 
                                        type="text" 
                                        placeholder="Adicionar novo item..."
                                        className="flex-grow p-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-purple-500 outline-none"
                                        value={newItemTexts[assist.id] || ''}
                                        onChange={(e) => setNewItemTexts({...newItemTexts, [assist.id]: e.target.value})}
                                        onKeyDown={(e) => { if(e.key === 'Enter') handleAddItem(assist.id); }}
                                    />
                                    <button 
                                        onClick={() => handleAddItem(assist.id)}
                                        className="bg-purple-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-purple-700"
                                    >
                                        Adicionar
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AssistanceManager;
