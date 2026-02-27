
import React, { useState, useMemo } from 'react';
import { Vehicle, VehicleUsageLog } from '../types';
import { generateUUID } from '../App';
import Modal from './Modal';
import { 
    TruckIcon, 
    PlusCircleIcon, 
    SearchIcon, 
    TrashIcon, 
    CalendarIcon, 
    UserIcon, 
    XIcon, 
    PlusIcon, 
    BoxIcon,
    ClockIcon,
    RefreshIcon,
    TagIcon,
    CheckCircleIcon,
    PencilIcon
} from './icons';

interface FleetManagementProps {
    vehicles: Vehicle[];
    logs: VehicleUsageLog[];
    onUpdateFleet: (vehicles: Vehicle[], logs: VehicleUsageLog[]) => void;
}

const FleetManagement: React.FC<FleetManagementProps> = ({ vehicles, logs, onUpdateFleet }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isRegisteringUsage, setIsRegisteringUsage] = useState(false);
    const [isManagingVehicles, setIsManagingVehicles] = useState(false);
    const [isClosingUsage, setIsClosingUsage] = useState(false);
    const [isEditingUsage, setIsEditingUsage] = useState(false);

    // Form states for usage - Usando data local para evitar erro de UTC
    const getLocalDateString = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const getLocalTimeString = () => {
        return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    const [usageDate, setUsageDate] = useState(getLocalDateString());
    const [usageTime, setUsageTime] = useState(getLocalTimeString());
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [driverName, setDriverName] = useState('');

    // States for manual "Baixa"
    const [closingLogId, setClosingLogId] = useState<string | null>(null);
    const [returnDate, setReturnDate] = useState(getLocalDateString());
    const [returnTime, setReturnTime] = useState(getLocalTimeString());

    // States for editing existing log
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const [editDate, setEditDate] = useState('');
    const [editTime, setEditTime] = useState('');
    const [editVehicleId, setEditVehicleId] = useState('');
    const [editDriverName, setEditDriverName] = useState('');
    const [editReturnDate, setEditReturnDate] = useState('');
    const [editReturnTime, setEditReturnTime] = useState('');

    // Form states for vehicle registration
    const [vName, setVName] = useState('');
    const [vPlate, setVPlate] = useState('');
    const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

    const [groupBy, setGroupBy] = useState<'VEHICLE' | 'DRIVER'>('VEHICLE');

    const groupedLogs = useMemo(() => {
        const term = searchTerm.toLowerCase();
        const filtered = logs.filter(log => 
            log.vehicleName.toLowerCase().includes(term) ||
            log.plate.toLowerCase().includes(term) ||
            log.driverName.toLowerCase().includes(term)
        );

        if (groupBy === 'VEHICLE') {
            const groups: Record<string, { title: string, subtitle: string, logs: VehicleUsageLog[] }> = {};
            
            filtered.forEach(log => {
                const groupKey = `${log.vehicleName}-${log.plate}`;
                if (!groups[groupKey]) {
                    groups[groupKey] = { title: log.vehicleName, subtitle: log.plate, logs: [] };
                }
                groups[groupKey].logs.push(log);
            });

            Object.keys(groups).forEach(key => {
                groups[key].logs.sort((a, b) => {
                    const dateA = new Date(`${a.date}T${a.time}`);
                    const dateB = new Date(`${b.date}T${b.time}`);
                    return dateB.getTime() - dateA.getTime();
                });
            });

            return Object.values(groups).sort((a, b) => a.title.localeCompare(b.title));
        } else {
            const groups: Record<string, { title: string, subtitle: string, logs: VehicleUsageLog[] }> = {};
            
            filtered.forEach(log => {
                const groupKey = log.driverName;
                if (!groups[groupKey]) {
                    groups[groupKey] = { title: log.driverName, subtitle: 'CONDUTOR', logs: [] };
                }
                groups[groupKey].logs.push(log);
            });

            Object.keys(groups).forEach(key => {
                groups[key].logs.sort((a, b) => {
                    const dateA = new Date(`${a.date}T${a.time}`);
                    const dateB = new Date(`${b.date}T${b.time}`);
                    return dateB.getTime() - dateA.getTime();
                });
            });

            return Object.values(groups).sort((a, b) => a.title.localeCompare(b.title));
        }
    }, [logs, searchTerm, groupBy]);

    const handleSaveVehicle = (e: React.FormEvent) => {
        e.preventDefault();
        if (!vName || !vPlate) return;

        if (editingVehicleId) {
            const updatedVehicles = vehicles.map(v => 
                v.id === editingVehicleId ? { ...v, name: vName.trim(), plate: vPlate.trim().toUpperCase() } : v
            );
            onUpdateFleet(updatedVehicles, logs);
            setEditingVehicleId(null);
        } else {
            const newVehicle: Vehicle = {
                id: generateUUID(),
                name: vName.trim(),
                plate: vPlate.trim().toUpperCase()
            };
            onUpdateFleet([...vehicles, newVehicle], logs);
        }
        setVName('');
        setVPlate('');
    };

    const startEditingVehicle = (v: Vehicle) => {
        setEditingVehicleId(v.id);
        setVName(v.name);
        setVPlate(v.plate);
    };

    const handleRemoveVehicle = (id: string) => {
        if (window.confirm("Remover este veículo do cadastro fixo?")) {
            onUpdateFleet(vehicles.filter(v => v.id !== id), logs);
        }
    };

    const handleOpenCloseModal = (log: VehicleUsageLog) => {
        setClosingLogId(log.id);
        setReturnDate(getLocalDateString());
        setReturnTime(getLocalTimeString());
        setIsClosingUsage(true);
    };

    const handleConfirmClose = (e: React.FormEvent) => {
        e.preventDefault();
        if (!closingLogId) return;
        const updatedLogs = logs.map(l => 
            l.id === closingLogId ? { ...l, returnDate, returnTime } : l
        );
        onUpdateFleet(vehicles, updatedLogs);
        setIsClosingUsage(false);
        setClosingLogId(null);
    };

    const handleOpenEditModal = (log: VehicleUsageLog) => {
        setEditingLogId(log.id);
        setEditDate(log.date);
        setEditTime(log.time);
        setEditVehicleId(log.vehicleId);
        setEditDriverName(log.driverName);
        setEditReturnDate(log.returnDate || '');
        setEditReturnTime(log.returnTime || '');
        setIsEditingUsage(true);
    };

    const handleSaveEdit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingLogId) return;
        const vehicle = vehicles.find(v => v.id === editVehicleId);
        if (!vehicle) return;

        const updatedLogs = logs.map(l => {
            if (l.id === editingLogId) {
                return {
                    ...l,
                    date: editDate,
                    time: editTime,
                    vehicleId: vehicle.id,
                    vehicleName: vehicle.name,
                    plate: vehicle.plate,
                    driverName: editDriverName.trim().toUpperCase(),
                    returnDate: editReturnDate || undefined,
                    returnTime: editReturnTime || undefined
                };
            }
            return l;
        });
        onUpdateFleet(vehicles, updatedLogs);
        setIsEditingUsage(false);
        setEditingLogId(null);
    };

    const handleAddUsage = (e: React.FormEvent) => {
        e.preventDefault();
        const vehicle = vehicles.find(v => v.id === selectedVehicleId);
        if (!vehicle || !driverName) return;

        const normalizedNewDriver = driverName.trim().toUpperCase();

        const updatedOldLogs = logs.map(l => {
            // Verifica se o registro está em aberto
            if (!l.returnTime) {
                // Condição 1: O veículo selecionado já está em uso (por qualquer pessoa)
                // Devemos fechar o uso anterior deste veículo.
                const isSameVehicle = l.vehicleId === vehicle.id;

                // Condição 2: O motorista atual já tem um registro em aberto (em qualquer veículo)
                // Devemos fechar o uso anterior deste motorista.
                const isSameDriver = l.driverName.trim().toUpperCase() === normalizedNewDriver;

                if (isSameVehicle || isSameDriver) {
                    return { ...l, returnDate: usageDate, returnTime: usageTime };
                }
            }
            return l;
        });

        const newLog: VehicleUsageLog = {
            id: generateUUID(),
            date: usageDate,
            time: usageTime,
            returnDate: undefined,
            returnTime: undefined,
            vehicleId: vehicle.id,
            vehicleName: vehicle.name,
            plate: vehicle.plate,
            driverName: normalizedNewDriver,
            createdAt: new Date().toISOString()
        };

        onUpdateFleet(vehicles, [newLog, ...updatedOldLogs]);
        setIsRegisteringUsage(false);
        setDriverName('');
        setSelectedVehicleId('');
    };

    const handleRemoveLog = (id: string) => {
        if (window.confirm("Excluir este registro de histórico permanentemente?")) {
            onUpdateFleet(vehicles, logs.filter(l => l.id !== id));
        }
    };

    const formatDateBR = (dateStr: string) => {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    return (
        <div className="space-y-6 font-app animate-fadeIn text-sm md:text-[10px] font-normal">
            {/* Header / Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                    <h2 className="text-sm md:text-[10px] font-normal text-slate-800 uppercase tracking-tighter flex items-center gap-2 mb-2">
                        <TruckIcon className="w-5 h-5 text-blue-600" /> Controle de Frota
                    </h2>
                    <p className="text-sm md:text-[10px] font-normal text-slate-400 uppercase tracking-widest">Acompanhamento e Registro de Uso dos Veículos</p>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center gap-4">
                    <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md"><TruckIcon className="w-4 h-4"/></div>
                    <div>
                        <p className="text-sm md:text-[10px] font-normal text-blue-600 uppercase tracking-widest leading-none mb-1">Cadastrados</p>
                        <p className="text-sm md:text-[10px] font-normal text-blue-800 leading-none">{vehicles.length}</p>
                    </div>
                </div>

                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex items-center gap-4">
                    <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-md"><RefreshIcon className="w-4 h-4"/></div>
                    <div>
                        <p className="text-sm md:text-[10px] font-normal text-indigo-600 uppercase tracking-widest leading-none mb-1">Registros</p>
                        <p className="text-sm md:text-[10px] font-normal text-indigo-800 leading-none">{logs.length}</p>
                    </div>
                </div>
            </div>

            {/* Ações e Busca */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="flex gap-2 w-full md:w-auto order-2 md:order-1">
                    <button 
                        onClick={() => setGroupBy('VEHICLE')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${groupBy === 'VEHICLE' ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        Por Veículo
                    </button>
                    <button 
                        onClick={() => setGroupBy('DRIVER')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${groupBy === 'DRIVER' ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        Por Condutor
                    </button>
                </div>

                <div className="relative w-full md:max-w-xs order-1 md:order-2">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <SearchIcon className="w-4 h-4" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Buscar..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm md:text-[10px] font-normal outline-none focus:ring-1 focus:ring-blue-500/20 transition-all"
                    />
                </div>

                <div className="flex gap-2 w-full md:w-auto order-3">
                    <button 
                        onClick={() => setIsManagingVehicles(true)}
                        className="flex-1 md:flex-none px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-normal text-sm md:text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                    >
                        <TagIcon className="w-3 h-3"/> Veículos
                    </button>
                    <button 
                        onClick={() => {
                            setUsageDate(getLocalDateString());
                            setIsRegisteringUsage(true);
                        }}
                        className="flex-1 md:flex-none px-6 py-2.5 bg-blue-600 text-white rounded-xl font-normal text-sm md:text-[10px] uppercase tracking-widest shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <PlusCircleIcon className="w-4 h-4"/> Novo Uso
                    </button>
                </div>
            </div>

            {/* Tabela de Histórico Agrupada */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px] text-sm md:text-[10px] font-normal">
                        <thead>
                            <tr className="bg-[#0f172a] text-white text-sm md:text-[10px] font-normal uppercase tracking-[0.1em]">
                                <th className="p-3 border-b border-slate-800">DIA</th>
                                <th className="p-3 border-b border-slate-800">SAÍDA</th>
                                <th className="p-3 border-b border-slate-800">ENTREGA (DATA/HORA)</th>
                                <th className="p-3 border-b border-slate-800">{groupBy === 'VEHICLE' ? 'CONDUTOR' : 'VEÍCULO'}</th>
                                <th className="p-3 border-b border-slate-800 w-20 text-center">AÇÕES</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {groupedLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-20 text-center text-slate-400 italic font-normal">Nenhum registro de uso encontrado.</td>
                                </tr>
                            ) : (
                                groupedLogs.map((group, gIdx) => (
                                    <React.Fragment key={gIdx}>
                                        {/* Cabeçalho do Subgrupo */}
                                        <tr className="bg-slate-50 border-y border-slate-200">
                                            <td colSpan={5} className="px-4 py-1.5">
                                                <div className="flex items-center gap-3">
                                                    {groupBy === 'VEHICLE' ? <TruckIcon className="w-3.5 h-3.5 text-blue-500" /> : <UserIcon className="w-3.5 h-3.5 text-blue-500" />}
                                                    <span className="font-bold text-slate-800 uppercase tracking-tight">{group.title}</span>
                                                    {groupBy === 'VEHICLE' && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-sm md:text-[9px] font-black uppercase tracking-widest border border-blue-200">{group.subtitle}</span>}
                                                    <span className="text-slate-400 font-normal text-sm md:text-[9px] ml-auto uppercase tracking-widest">{group.logs.length} registros</span>
                                                </div>
                                            </td>
                                        </tr>
                                        {/* Linhas de registros */}
                                        {group.logs.map(log => (
                                            <tr key={log.id} className="hover:bg-blue-50/30 transition-colors group">
                                                <td className="p-2 pl-6 font-normal text-slate-700">
                                                    <div className="flex items-center gap-2">
                                                        <CalendarIcon className="w-2.5 h-2.5 text-slate-300" />
                                                        {formatDateBR(log.date)}
                                                    </div>
                                                </td>
                                                <td className="p-2 font-normal text-slate-500">
                                                    <div className="flex items-center gap-2">
                                                        <ClockIcon className="w-2.5 h-2.5 text-slate-300" />
                                                        {log.time}
                                                    </div>
                                                </td>
                                                <td className="p-2 font-normal">
                                                    {log.returnTime ? (
                                                        <div className="flex items-center gap-4 text-green-600">
                                                            <div className="flex items-center gap-1.5">
                                                                <CalendarIcon className="w-2.5 h-2.5 opacity-70" />
                                                                {formatDateBR(log.returnDate || log.date)}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 font-bold">
                                                                <ClockIcon className="w-2.5 h-2.5 opacity-70" />
                                                                {log.returnTime}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={() => handleOpenCloseModal(log)}
                                                            className="bg-blue-50 text-blue-600 px-3 py-0.5 rounded border border-blue-200 text-sm md:text-[9px] font-bold uppercase hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                                        >
                                                            Dar Baixa
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="p-2">
                                                    <div className="flex items-center gap-2 font-normal text-slate-700 uppercase">
                                                        {groupBy === 'VEHICLE' ? (
                                                            <>
                                                                <UserIcon className="w-2.5 h-2.5 text-slate-300" />
                                                                <span className="truncate max-w-[150px]">{log.driverName}</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <TruckIcon className="w-2.5 h-2.5 text-slate-300" />
                                                                <span className="truncate max-w-[150px]">{log.vehicleName} ({log.plate})</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-2 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button 
                                                            onClick={() => handleOpenEditModal(log)} 
                                                            className="text-slate-300 hover:text-blue-500 transition-all p-1"
                                                            title="Editar Registro"
                                                        >
                                                            <PencilIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleRemoveLog(log.id)} 
                                                            className="text-slate-300 hover:text-red-500 transition-all p-1"
                                                            title="Excluir Registro"
                                                        >
                                                            <TrashIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL: Dar Baixa Manual */}
            {isClosingUsage && (
                <Modal onClose={() => setIsClosingUsage(false)}>
                    <div className="p-2 text-sm md:text-[10px] font-normal">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm md:text-[10px] font-normal text-slate-800 uppercase tracking-tighter">Confirmar Entrega de Veículo</h3>
                            <button onClick={() => setIsClosingUsage(false)} className="text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5"/></button>
                        </div>
                        <form onSubmit={handleConfirmClose} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Data de Entrega</label>
                                    <input required type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50" />
                                </div>
                                <div>
                                    <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Hora de Entrega</label>
                                    <input required type="time" value={returnTime} onChange={e => setReturnTime(e.target.value)} className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50" />
                                </div>
                            </div>
                            <button type="submit" className="w-full py-3 bg-green-600 text-white rounded-xl font-normal uppercase text-sm md:text-[10px] tracking-widest shadow-lg hover:bg-green-700 transition-all">Finalizar Registro</button>
                        </form>
                    </div>
                </Modal>
            )}

            {/* MODAL: Editar Registro */}
            {isEditingUsage && (
                <Modal onClose={() => setIsEditingUsage(false)}>
                    <div className="p-2 text-sm md:text-[10px] font-normal">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm md:text-[10px] font-normal text-slate-800 uppercase tracking-tighter">Editar Registro de Uso</h3>
                            <button onClick={() => setIsEditingUsage(false)} className="text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5"/></button>
                        </div>
                        <form onSubmit={handleSaveEdit} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Data de Saída</label>
                                    <input required type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50" />
                                </div>
                                <div>
                                    <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Hora de Saída</label>
                                    <input required type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Veículo</label>
                                    <select 
                                        required 
                                        value={editVehicleId} 
                                        onChange={e => setEditVehicleId(e.target.value)}
                                        className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50"
                                    >
                                        {vehicles.map(v => (
                                            <option key={v.id} value={v.id}>{v.name} - ({v.plate})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Condutor Responsável</label>
                                    <input required value={editDriverName} onChange={e => setEditDriverName(e.target.value)} className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50 uppercase" placeholder="Nome do motorista..." />
                                </div>
                                
                                <div className="md:col-span-2 border-t pt-4 mt-2">
                                    <p className="text-sm md:text-[9px] font-black text-slate-400 uppercase mb-3">Dados de Entrega (Opcional)</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Data de Entrega</label>
                                            <input type="date" value={editReturnDate} onChange={e => setEditReturnDate(e.target.value)} className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50" />
                                        </div>
                                        <div>
                                            <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Hora de Entrega</label>
                                            <input type="time" value={editReturnTime} onChange={e => setEditReturnTime(e.target.value)} className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-normal uppercase text-sm md:text-[10px] tracking-widest shadow-lg hover:bg-blue-700 transition-all">Salvar Alterações</button>
                        </form>
                    </div>
                </Modal>
            )}

            {/* MODAL: Novo Uso */}
            {isRegisteringUsage && (
                <Modal onClose={() => setIsRegisteringUsage(false)}>
                    <div className="p-2 text-sm md:text-[10px] font-normal">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm md:text-[10px] font-normal text-slate-800 uppercase tracking-tighter">Registrar Saída de Veículo</h3>
                            <button onClick={() => setIsRegisteringUsage(false)} className="text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5"/></button>
                        </div>
                        <form onSubmit={handleAddUsage} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Data</label>
                                    <input required type="date" value={usageDate} onChange={e => setUsageDate(e.target.value)} className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50" />
                                </div>
                                <div>
                                    <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Hora de Saída</label>
                                    <input required type="time" value={usageTime} onChange={e => setUsageTime(e.target.value)} className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Selecione o Veículo</label>
                                    <select 
                                        required 
                                        value={selectedVehicleId} 
                                        onChange={e => setSelectedVehicleId(e.target.value)}
                                        className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50"
                                    >
                                        <option value="">Clique para selecionar...</option>
                                        {vehicles.map(v => (
                                            <option key={v.id} value={v.id}>{v.name} - ({v.plate})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm md:text-[10px] font-normal text-slate-500 uppercase mb-1.5">Condutor Responsável</label>
                                    <input required value={driverName} onChange={e => setDriverName(e.target.value)} className="w-full p-2 border-2 border-slate-100 rounded-xl outline-none text-sm md:text-[10px] font-normal bg-slate-50 uppercase" placeholder="Nome do motorista..." />
                                </div>
                            </div>
                            <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-normal uppercase text-sm md:text-[10px] tracking-widest shadow-lg hover:bg-blue-700 transition-all">Salvar Registro</button>
                        </form>
                    </div>
                </Modal>
            )}

            {/* MODAL: Gerenciar Veículos */}
            {isManagingVehicles && (
                <Modal onClose={() => setIsManagingVehicles(false)}>
                    <div className="p-2 text-sm md:text-[10px] font-normal">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm md:text-[10px] font-normal text-slate-800 uppercase tracking-tighter">Cadastro da Frota</h3>
                            <button onClick={() => setIsManagingVehicles(false)} className="text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5"/></button>
                        </div>

                        <form onSubmit={handleSaveVehicle} className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-3">
                            <input required value={vName} onChange={e => setVName(e.target.value)} className="flex-grow p-2 border rounded-lg text-sm md:text-[10px] font-normal uppercase" placeholder="Nome do Veículo (ex: L200 Branca)" />
                            <input required value={vPlate} onChange={e => setVPlate(e.target.value)} className="md:w-32 p-2 border rounded-lg text-sm md:text-[10px] font-normal uppercase" placeholder="Placa" />
                            <div className="flex gap-2">
                                <button type="submit" className="flex-grow md:flex-none bg-slate-800 text-white px-6 py-2 rounded-lg font-normal text-sm md:text-[10px] uppercase tracking-widest hover:bg-black transition-all">
                                    {editingVehicleId ? 'Salvar Alteração' : 'Adicionar'}
                                </button>
                                {editingVehicleId && (
                                    <button type="button" onClick={() => { setEditingVehicleId(null); setVName(''); setVPlate(''); }} className="bg-slate-300 text-slate-700 px-4 py-2 rounded-lg font-normal text-sm md:text-[10px] uppercase tracking-widest">
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </form>

                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                            {vehicles.length === 0 ? (
                                <p className="text-center text-slate-400 py-10 font-normal">Nenhum veículo cadastrado.</p>
                            ) : (
                                vehicles.map(v => (
                                    <div key={v.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl group">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-slate-100 p-2 rounded-lg text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all"><TruckIcon className="w-4 h-4" /></div>
                                            <div>
                                                <p className="font-normal text-slate-800 uppercase tracking-tight">{v.name}</p>
                                                <p className="text-sm md:text-[10px] font-normal text-slate-400 uppercase tracking-widest">{v.plate}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => startEditingVehicle(v)} className="text-slate-300 hover:text-blue-500 transition-colors p-2" title="Editar Veículo">
                                                <PencilIcon className="w-4 h-4"/>
                                            </button>
                                            <button onClick={() => handleRemoveVehicle(v.id)} className="text-slate-300 hover:text-red-500 transition-colors p-2" title="Remover Veículo">
                                                <TrashIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default FleetManagement;
