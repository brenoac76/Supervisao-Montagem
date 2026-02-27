
import React, { useState, useEffect, useMemo } from 'react';
import { Client, Environment, VisitLog, UnitType, Assembler, ShippingItem, CargoManifest, ChecklistStatus } from '../types';
import ReportModal from './ReportModal';
import TodeschiniReportModal from './TodeschiniReportModal';
import PreAssemblyReportModal from './PreAssemblyReportModal'; 
import WorkReleaseReportModal from './WorkReleaseReportModal';
import SupervisionReportModal from './SupervisionReportModal';
import Dashboard from './Dashboard';
import Timeline from './Timeline';
import PunchListManager from './PunchListManager';
import VisitManager from './VisitManager';
import AssistanceManager from './AssistanceManager'; 
import ShippingManager from './ShippingManager';
import Modal from './Modal';
import { 
    MapPinIcon, 
    HomeIcon, 
    BuildingOfficeIcon, 
    TrashIcon, 
    DocumentTextIcon, 
    ChevronRightIcon, 
    PencilIcon, 
    UserIcon, 
    CalendarIcon, 
    ClipboardCheckIcon, 
    UsersIcon, 
    ChartBarIcon, 
    CubeIcon, 
    ClipboardDocumentListIcon, 
    RefreshIcon, 
    ToolsIcon, 
    TruckIcon, 
    PlusCircleIcon, 
    CheckCircleIcon, 
    XIcon, 
    PrinterIcon, 
    ClipboardListIcon,
    ArrowLeftIcon,
    UserGroupIcon,
    ShieldCheckIcon,
    MenuIcon,
    ShieldIcon,
    LockClosedIcon,
    TagIcon,
    FolderIcon
} from './icons';
import { generateUUID, TabType } from '../App';

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

const formatCurrencyParts = (value?: number) => {
    const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
    return {
        symbol: 'R$',
        value: formatted
    };
};

interface ClientCardProps {
  client: Client;
  clients?: Client[]; 
  assemblers?: Assembler[];
  manifests?: CargoManifest[]; 
  onUpdateClient: (client: Client) => void;
  onDeleteClient: (clientId: string) => void;
  onSelectEnvironment: (environmentId: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  selectedAssemblerIdForView: string | null;
  onSelectedAssemblerChange: (id: string | null) => void;
}

const ClientCard: React.FC<ClientCardProps> = ({ 
    client, 
    clients = [], 
    assemblers = [], 
    manifests = [], 
    onUpdateClient, 
    onDeleteClient, 
    onSelectEnvironment, 
    onRefresh, 
    isRefreshing,
    activeTab,
    onTabChange,
    selectedAssemblerIdForView,
    onSelectedAssemblerChange
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddingEnv, setIsAddingEnv] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvInitials, setNewEnvInitials] = useState('');
  const [newEnvAssembler, setNewEnvAssembler] = useState(client.assembler || '');
  const [newEnvPO, setNewEnvPO] = useState('MJF');

  const [showReport, setShowReport] = useState(false);
  const [showTodeschiniReport, setShowTodeschiniReport] = useState(false);
  const [showPreAssemblyReport, setShowPreAssemblyReport] = useState(false); 
  const [showWorkReleaseReport, setShowWorkReleaseReport] = useState(false);
  const [showSupervisionReport, setShowSupervisionReport] = useState(false);
  
  const [isEditingObs, setIsEditingObs] = useState(false);
  const [clientObs, setClientObs] = useState(client.observations || '');
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  
  const [clientName, setClientName] = useState(client.name);
  const [clientAddress, setClientAddress] = useState(client.address);
  const [clientUnitType, setClientUnitType] = useState<UnitType>(client.unitType);
  const [clientAssembler, setClientAssembler] = useState(client.assembler || '');
  const [clientStartDate, setClientStartDate] = useState(client.startDate ? client.startDate.split('T')[0] : '');

  const filteredAssemblersForSelect = useMemo(() => {
    return assemblers.filter(a => {
        const r = (a.role || '').toLowerCase();
        return !r.includes('ajudante') && !r.includes('auxiliar');
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [assemblers]);

  const teamInSite = useMemo(() => {
      const ids = new Set<string>();
      (client.environments || []).forEach(env => {
          if (env.assemblerId) ids.add(env.assemblerId);
          if (env.helperId) ids.add(env.helperId);
          (env.checklist || []).forEach(item => {
              if (item.assemblerId) ids.add(item.assemblerId);
          });
      });
      return assemblers.filter(a => ids.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [client.environments, assemblers]);

  const selectedAssemblerData = useMemo(() => {
      return assemblers.find(a => a.id === selectedAssemblerIdForView);
  }, [assemblers, selectedAssemblerIdForView]);

  const environmentsForSelectedAssembler = useMemo(() => {
      if (!selectedAssemblerIdForView) return [];
      return (client.environments || []).filter(env => {
          const isMain = env.assemblerId === selectedAssemblerIdForView;
          const isHelper = env.helperId === selectedAssemblerIdForView;
          const hasInChecklist = (env.checklist || []).some(i => i.assemblerId === selectedAssemblerIdForView);
          return isMain || isHelper || hasInChecklist;
      }).sort((a, b) => a.name.localeCompare(b.name));
  }, [client.environments, selectedAssemblerIdForView]);

  useEffect(() => {
    setClientName(client.name);
    setClientAddress(client.address);
    setClientUnitType(client.unitType);
    setClientAssembler(client.assembler || '');
    setClientStartDate(client.startDate ? client.startDate.split('T')[0] : '');
  }, [client]);

  const handleSaveClientInfo = () => {
      onUpdateClient({ 
        ...client, 
        name: clientName, 
        address: clientAddress, 
        unitType: clientUnitType, 
        assembler: clientAssembler,
        startDate: clientStartDate ? new Date(clientStartDate + 'T12:00:00Z').toISOString() : undefined
      });
      setIsEditingInfo(false);
  };

  const handleAddEnvironment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnvName.trim()) return;
    const selectedAssemblerObj = assemblers.find(a => a.name === newEnvAssembler);
    const newEnv: Environment = {
      id: generateUUID(),
      name: newEnvName.trim(),
      initials: newEnvInitials.trim(),
      purchaseOrder: newEnvPO.trim(),
      checklist: [],
      assembler: newEnvAssembler,
      assemblerId: selectedAssemblerObj?.id,
      isAssistance: false,
      manualProgress: 0
    };
    onUpdateClient({ ...client, environments: [...(client.environments || []), newEnv] });
    setNewEnvName('');
    setNewEnvInitials('');
    setNewEnvPO('MJF');
    setIsAddingEnv(false);
  };

  const sortedEnvironments = [...(client.environments || [])]
    .filter(env => !env.isAssistance)
    .sort((a, b) => a.name.localeCompare(b.name));

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`;

  const totalPendingPunchListItems = useMemo(() => {
      let count = 0;
      if (client.punchLists && Array.isArray(client.punchLists)) {
          client.punchLists.forEach(pl => {
              (pl.items || []).forEach(item => {
                  if (item.issues && item.issues.length > 0) {
                      count += item.issues.filter(iss => iss.status === 'Pending').length;
                  } else if (item.status === 'Pending') {
                      count += 1;
                  }
              });
          });
      }
      return count;
  }, [client.punchLists]);
    
  const assistanceCount = (client.environments || []).filter(env => env.isAssistance).length;
  const pendingShippingCount = (client.shippingItems || []).filter(i => i.status === 'Pending').length;

  const tabOptions = [
    { id: 'overview' as TabType, label: 'RESUMO', icon: <ChartBarIcon className="w-5 h-5"/> },
    { id: 'environments' as TabType, label: 'AMBIENTES', icon: <CubeIcon className="w-5 h-5"/>, count: sortedEnvironments.length },
    { id: 'team_in_site' as TabType, label: 'EQUIPE', icon: <UserGroupIcon className="w-5 h-5"/>, count: teamInSite.length },
    { id: 'logistics' as TabType, label: 'LOGÍSTICA', icon: <TruckIcon className="w-5 h-5"/>, count: pendingShippingCount },
    { id: 'visits' as TabType, label: 'VISITAS', icon: <UsersIcon className="w-5 h-5"/>, count: (client.visitLogs || []).length },
    { id: 'punchlist' as TabType, label: 'PÓS-OBRA', icon: <ClipboardCheckIcon className="w-5 h-5"/>, count: totalPendingPunchListItems },
    { id: 'assistance' as TabType, label: 'ASSIST.', icon: <ToolsIcon className="w-5 h-5"/>, count: assistanceCount },
    { id: 'reports' as TabType, label: 'DOCS', icon: <PrinterIcon className="w-5 h-5"/> }
  ];

  const TabButton: React.FC<{ id: TabType, label: string, icon: React.ReactNode, count?: number }> = ({ id, label, icon, count }) => (
    <button
        onClick={() => {
            onTabChange(id);
            if (id !== 'team_in_site') onSelectedAssemblerChange(null);
        }}
        className={`flex-1 py-4 px-2 flex flex-col items-center justify-center gap-1.5 transition-all border-b-2 
        ${activeTab === id 
            ? 'border-blue-600 text-blue-700 bg-white' 
            : 'border-transparent text-slate-500 hover:text-slate-800'}`}
    >
        <span className={`text-[10px] tracking-[0.2em] font-light uppercase text-center leading-none flex items-center gap-2 whitespace-nowrap`}>
            {label}
            {count !== undefined && count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] border border-blue-300 bg-blue-50 text-blue-700 transition-all ${activeTab === id ? 'border-blue-500 bg-blue-100' : ''}`}>
                    {count}
                </span>
            )}
        </span>
    </button>
  );

  return (
    <>
      <div className="bg-slate-100 rounded-xl shadow-xl border border-slate-300 relative min-w-0 text-slate-900">
        <div className="p-4 sm:p-6 bg-slate-200/60 border-b border-slate-300 rounded-t-xl">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex-grow w-full md:w-auto min-w-0">
              {isEditingInfo ? (
                <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-lg mb-2 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div><label className="block text-[10px] font-bold tracking-widest text-slate-500 mb-1 uppercase">CLIENTE</label><input value={clientName} onChange={e => setClientName(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm font-medium"/></div>
                        <div><label className="block text-[10px] font-bold tracking-widest text-slate-500 mb-1 uppercase">TIPO</label><select value={clientUnitType} onChange={e => setClientUnitType(e.target.value as UnitType)} className="w-full p-2 border border-slate-200 rounded-lg bg-white text-sm font-medium"><option value={UnitType.House}>Casa</option><option value={UnitType.Apartment}>Apartamento</option></select></div>
                        <div><label className="block text-[10px] font-bold tracking-widest text-slate-500 mb-1 uppercase">MONTADOR RESP.</label><select value={clientAssembler} onChange={e => setClientAssembler(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg bg-white text-sm font-medium"><option value="">Sem Montador</option>{filteredAssemblersForSelect.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
                        <div><label className="block text-[10px] font-bold tracking-widest text-slate-500 mb-1 uppercase">INÍCIO MONTAGEM</label><input type="date" value={clientStartDate} onChange={e => setClientStartDate(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm font-medium"/></div>
                        <div className="md:col-span-2"><label className="block text-[10px] font-bold tracking-widest text-slate-500 mb-1 uppercase">ENDEREÇO</label><input value={clientAddress} onChange={e => setClientAddress(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm font-medium"/></div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                        <button onClick={() => setIsEditingInfo(false)} className="px-4 py-2 text-slate-500 text-[10px] tracking-widest uppercase font-bold hover:text-slate-700 transition-colors">Cancelar</button>
                        <button onClick={handleSaveClientInfo} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-[10px] tracking-widest uppercase font-black shadow-md hover:bg-blue-700 transition-all">Salvar Alterações</button>
                    </div>
                </div>
              ) : (
                <div className="group relative flex flex-col gap-2 sm:gap-3 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 sm:gap-4 min-w-0">
                        <h2 className="text-xl sm:text-2xl lg:text-3xl font-light text-slate-900 leading-tight tracking-[0.05em] truncate max-w-full">{client.name}</h2>
                        <div className="flex items-center gap-2 px-2 py-0.5 sm:px-3 sm:py-1 bg-white/70 border border-slate-300 rounded-full text-[8px] sm:text-[9px] font-medium text-slate-600 uppercase tracking-[0.2em] flex-shrink-0">
                            {client.unitType === 'Casa' ? <HomeIcon className="w-3 h-3" /> : <BuildingOfficeIcon className="w-3 h-3" />}
                            <span>{client.unitType}</span>
                        </div>
                        <button onClick={() => setIsEditingInfo(true)} className="text-slate-500 hover:text-blue-600 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all p-1 bg-slate-200/50 sm:bg-transparent rounded-full" title="Editar Informações"><PencilIcon className="w-4 h-4"/></button>
                    </div>
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[10px] sm:text-xs font-light text-slate-700 hover:text-blue-600 transition-colors w-full tracking-wide min-w-0">
                        <MapPinIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 opacity-60" />
                        <span className="border-b border-slate-300 hover:border-blue-600 truncate">{client.address}</span>
                    </a>
                    <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-1">
                        <div className="flex items-center text-[9px] sm:text-[10px] tracking-widest uppercase font-medium text-slate-600">
                             <span className="opacity-70 mr-1.5">Início:</span>
                             <span className="text-slate-950 font-bold">{formatToBR(client.startDate)}</span>
                        </div>
                        <div className="flex items-center text-[9px] sm:text-[10px] tracking-widest uppercase font-medium text-slate-600 min-w-0">
                             <span className="opacity-70 mr-1.5">Resp:</span>
                             <span className="text-slate-950 font-bold uppercase truncate">{client.assembler || 'N/A'}</span>
                        </div>
                    </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 self-start">
              <button onClick={onRefresh} disabled={isRefreshing} className="text-slate-500 hover:text-blue-600 p-1.5"><RefreshIcon className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} /></button>
              <button onClick={() => setShowTodeschiniReport(true)} className="text-slate-500 hover:text-blue-600 p-1.5"><ClipboardDocumentListIcon className="w-5 h-5" /></button>
              <button onClick={() => setShowReport(true)} className="text-slate-500 hover:text-blue-600 p-1.5"><DocumentTextIcon className="w-5 h-5" /></button>
              <button onClick={() => onDeleteClient(client.id)} className="text-slate-400 hover:text-red-600 p-1.5"><TrashIcon className="w-5 h-5" /></button>
            </div>
          </div>
        </div>

        <nav className="bg-slate-200 sticky top-0 z-30 border-b border-slate-300 min-w-0 shadow-sm">
            <div className="hidden lg:flex overflow-x-auto">
                {tabOptions.map(opt => (
                    <TabButton key={opt.id} id={opt.id} label={opt.label} icon={opt.icon} count={opt.count} />
                ))}
            </div>

            <div className="lg:hidden p-3 flex items-center justify-between">
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[8px] tracking-[0.3em] font-medium text-slate-500 uppercase leading-none mb-1">Visualização</span>
                    <span className="text-xs tracking-[0.1em] font-light text-slate-900 uppercase truncate">
                        {tabOptions.find(o => o.id === activeTab)?.label}
                    </span>
                </div>
                <button 
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className={`p-2.5 rounded-xl transition-all duration-300 flex-shrink-0 border shadow-sm
                    ${isMenuOpen 
                        ? 'text-blue-700 bg-blue-50 border-blue-200' 
                        : 'text-slate-600 bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'}`}
                >
                    {isMenuOpen ? <XIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
                </button>
            </div>

            {isMenuOpen && (
                <div className="lg:hidden absolute left-0 right-0 top-full bg-white shadow-2xl border-b border-slate-400 z-[60] animate-fadeInDown">
                    <div className="p-3 flex flex-col gap-2 bg-white">
                        {tabOptions.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => {
                                    onTabChange(opt.id);
                                    if (opt.id !== 'team_in_site') onSelectedAssemblerChange(null);
                                    setIsMenuOpen(false);
                                }}
                                className={`w-full text-left px-5 py-4 rounded-xl flex items-center justify-between transition-all border
                                ${activeTab === opt.id 
                                    ? 'bg-blue-50 border-blue-100 text-blue-700 shadow-sm' 
                                    : 'bg-white border-transparent text-slate-600 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`${activeTab === opt.id ? 'text-blue-600' : 'text-slate-400'}`}>
                                        {opt.icon}
                                    </div>
                                    <span className={`text-sm uppercase tracking-wide ${activeTab === opt.id ? 'font-medium' : 'font-normal'}`}>{opt.label}</span>
                                </div>
                                {opt.count !== undefined && opt.count > 0 && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                                    ${activeTab === opt.id 
                                        ? 'bg-blue-600 text-white' 
                                        : 'bg-slate-100 text-slate-500'}`}>
                                        {opt.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </nav>

        <div className="p-4 sm:p-6 bg-slate-50 min-h-[400px] overflow-y-auto rounded-b-xl">
            {activeTab === 'overview' && (
                <div className="space-y-6 animate-fadeIn">
                    <Dashboard client={client} onSelectEnvironment={onSelectEnvironment} />
                    <div className="p-4 sm:p-6 border border-slate-200 rounded-xl bg-white shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-[11px] tracking-[0.2em] font-medium text-slate-500 uppercase">Observações Gerais</h3>
                            {!isEditingObs && <button onClick={() => setIsEditingObs(true)} className="text-slate-400 hover:text-blue-600"><PencilIcon className="w-4 h-4"/></button>}
                        </div>
                        {isEditingObs ? (
                            <div>
                                <textarea value={clientObs} onChange={(e) => setClientObs(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-sm font-light resize-none focus:ring-1 focus:ring-blue-500 outline-none" rows={4} />
                                <div className="flex justify-end gap-3 mt-3">
                                    <button onClick={() => setIsEditingObs(false)} className="text-[10px] tracking-widest text-slate-500 uppercase font-medium">Cancelar</button>
                                    <button onClick={() => { onUpdateClient({ ...client, observations: clientObs }); setIsEditingObs(false); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[10px] tracking-widest uppercase font-bold">Salvar</button>
                                </div>
                            </div>
                        ) : (<p className="text-sm font-light text-slate-800 whitespace-pre-wrap leading-relaxed">{client.observations || <span className="italic opacity-60">Nenhuma observação pendente.</span>}</p>)}
                    </div>
                </div>
            )}

            {activeTab === 'team_in_site' && (
                <div className="animate-fadeIn space-y-6">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-2">
                        <h3 className="text-[10px] sm:text-[11px] tracking-[0.3em] font-medium text-slate-500 uppercase truncate">
                            {selectedAssemblerIdForView && selectedAssemblerData 
                                ? `Filtro: ${selectedAssemblerData.name}` 
                                : 'Equipe na Obra'}
                        </h3>
                        {selectedAssemblerIdForView && (
                            <button 
                                onClick={() => onSelectedAssemblerChange(null)}
                                className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-widest flex-shrink-0 ml-2"
                            >
                                Limpar
                            </button>
                        )}
                    </div>

                    {!selectedAssemblerIdForView ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {teamInSite.length > 0 ? (
                                teamInSite.map(member => {
                                    const envsCount = (client.environments || []).filter(env => env.assemblerId === member.id || env.helperId === member.id || (env.checklist || []).some(i => i.assemblerId === member.id)).length;
                                    return (
                                        <button key={member.id} onClick={() => onSelectedAssemblerChange(member.id)} className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition-all flex items-center justify-between group text-left min-w-0">
                                            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-light text-base border border-slate-300 flex-shrink-0">{member.name.charAt(0).toUpperCase()}</div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-slate-900 tracking-wide truncate">{member.name}</p>
                                                    <p className="text-[8px] sm:text-[9px] text-slate-600 tracking-[0.1em] uppercase font-medium truncate">{member.role}</p>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0 ml-2">
                                                <span className="text-[8px] sm:text-[9px] font-bold tracking-widest text-blue-600 uppercase block mb-1">{envsCount} Amb.</span>
                                                <ChevronRightIcon className="w-4 h-4 text-slate-300 group-hover:text-blue-600 inline" />
                                            </div>
                                        </button>
                                    );
                                })
                            ) : (<div className="col-span-full py-16 text-center bg-white rounded-xl border-2 border-dashed border-slate-200"><p className="text-slate-400 font-medium tracking-widest uppercase text-xs">Sem equipe vinculada</p></div>)}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {environmentsForSelectedAssembler.length > 0 ? (
                                environmentsForSelectedAssembler.map(env => (
                                    <button key={env.id} onClick={() => onSelectEnvironment(env.id)} className="w-full bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 transition-all flex items-center justify-between group text-left min-w-0">
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-sm font-medium text-slate-900 tracking-widest truncate">{env.name}</h4>
                                            <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase tracking-widest">Acessar Detalhes</p>
                                        </div>
                                        <ChevronRightIcon className="w-5 h-5 text-slate-400 group-hover:text-blue-600 flex-shrink-0" />
                                    </button>
                                ))
                            ) : (
                                <div className="py-16 text-center bg-white rounded-xl border-2 border-dashed border-slate-200">
                                    <p className="text-slate-400 font-medium tracking-widest uppercase text-xs">Nenhum ambiente para este montador</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'environments' && (() => {
                const totalPortal = sortedEnvironments.reduce((acc, e) => acc + (e.portalValue || 0), 0);
                const total23 = totalPortal * 2.3;

                return (
                <div className="space-y-3 animate-fadeIn">
                    {isAddingEnv ? (
                        <form onSubmit={handleAddEnvironment} className="bg-white p-5 rounded-xl border-2 border-blue-200 shadow-lg animate-fadeIn mb-4">
                            <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3">Novo Ambiente</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                                <input value={newEnvInitials} onChange={e => setNewEnvInitials(e.target.value)} placeholder="Sigla" className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none font-bold" />
                                <input autoFocus value={newEnvName} onChange={e => setNewEnvName(e.target.value)} placeholder="Nome (Ex: Cozinha)" className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                                <input value={newEnvPO} onChange={e => setNewEnvPO(e.target.value)} placeholder="Ordens de Compra" className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                                <select value={newEnvAssembler} onChange={e => setNewEnvAssembler(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white font-light">
                                    <option value="">Selecione Montador</option>
                                    {filteredAssemblersForSelect.map(a => (<option key={a.id} value={a.name}>{a.name}</option>))}
                                </select>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => setIsAddingEnv(false)} className="px-6 py-2 text-[10px] font-normal uppercase tracking-widest text-slate-500">Cancelar</button>
                                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest">Salvar</button>
                            </div>
                        </form>
                    ) : (
                        <button onClick={() => setIsAddingEnv(true)} className="w-full bg-white/40 p-2 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-white transition-all flex items-center justify-center gap-2 group mb-2">
                            <PlusCircleIcon className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] group-hover:text-blue-600">Novo Ambiente</span>
                        </button>
                    )}

                    {/* TABLE HEADER (Desktop Only) */}
                    <div className="hidden lg:grid grid-cols-12 gap-2 px-4 py-1.5 bg-slate-900 text-[9px] font-black text-white uppercase tracking-widest rounded-t-lg border-b border-slate-700">
                        <div className="col-span-2">Ambiente</div>
                        <div className="col-span-1">Sigla</div>
                        <div className="col-span-1 text-center">Projeto</div>
                        <div className="col-span-2 text-center">Progresso</div>
                        <div className="col-span-2 pr-4">Valor Portal</div>
                        <div className="col-span-2 pr-4">Produção (2,3)</div>
                        <div className="col-span-1 pl-2">Montador</div>
                        <div className="col-span-1"></div>
                    </div>

                    {/* ENVIRONMENTS LIST */}
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm divide-y divide-slate-100 lg:divide-y-0">
                        {sortedEnvironments.length === 0 ? (
                            <div className="p-10 text-center text-slate-400 text-xs italic font-light">Nenhum ambiente cadastrado.</div>
                        ) : (
                            sortedEnvironments.map(env => {
                                const displayProgress = env.manualProgress || 0;
                                const isDone = displayProgress === 100;
                                const pParts = formatCurrencyParts(env.portalValue);
                                const vParts = formatCurrencyParts((env.portalValue || 0) * 2.3);
                                const hasProjects = env.projectFiles && env.projectFiles.length > 0;

                                return (
                                    <button key={env.id} onClick={() => onSelectEnvironment(env.id)} className="w-full transition-colors text-left group">
                                        
                                        {/* VIEW DESKTOP */}
                                        <div className="hidden lg:grid lg:grid-cols-12 items-center gap-2 px-4 py-1 border-b border-slate-100 hover:bg-blue-50/60">
                                            <div className="col-span-2 flex items-center gap-2 min-w-0">
                                                <CubeIcon className="w-3 h-3 text-slate-300 group-hover:text-blue-500 flex-shrink-0" />
                                                <span className="text-[10px] font-black text-slate-700 truncate leading-none uppercase">
                                                    {env.name}
                                                </span>
                                            </div>

                                            <div className="col-span-1 flex items-center">
                                                <span className="text-[10px] font-black text-blue-600 truncate leading-none">
                                                    {env.initials ? `[${env.initials}]` : ''}
                                                </span>
                                            </div>

                                            <div className="col-span-1 flex items-center justify-center">
                                                {hasProjects ? (
                                                    <div className="relative">
                                                        <FolderIcon className="w-4 h-4 text-blue-600" />
                                                        <span className="absolute -top-1.5 -right-1.5 bg-blue-100 text-blue-700 text-[7px] font-black w-3 h-3 flex items-center justify-center rounded-full border border-blue-200">
                                                            {env.projectFiles!.length}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <FolderIcon className="w-3.5 h-3.5 text-slate-100" />
                                                )}
                                            </div>

                                            <div className="col-span-2 flex items-center justify-center gap-2">
                                                <div className="flex-1 max-w-[80px] h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                    <div className={`h-full transition-all duration-700 ${isDone ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${displayProgress}%` }} />
                                                </div>
                                                <span className={`text-[10px] font-black min-w-[28px] ${isDone ? 'text-green-600' : 'text-blue-600'}`}>{displayProgress}%</span>
                                            </div>

                                            <div className="col-span-2 pr-4 border-l border-slate-100/50">
                                                <div className="grid grid-cols-[15px_1fr] text-[10px] font-medium">
                                                    <span className="text-slate-400 font-bold">R$</span>
                                                    <span className="text-right text-slate-600">{pParts.value}</span>
                                                </div>
                                            </div>

                                            <div className="col-span-2 pr-4 border-l border-slate-100/50">
                                                <div className="grid grid-cols-[15px_1fr] text-[10px] font-black">
                                                    <span className="text-blue-400">R$</span>
                                                    <span className="text-right text-blue-700">{vParts.value}</span>
                                                </div>
                                            </div>

                                            <div className="col-span-1 flex items-center gap-2 pl-2 border-l border-slate-100/50 min-w-0">
                                                <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                                                    <UserIcon className="w-3.5 h-3.5 text-slate-300"/>
                                                </div>
                                                <span className="text-[9px] font-black text-slate-500 uppercase truncate">{env.assembler || 'S/R'}</span>
                                            </div>

                                            <div className="col-span-1 flex justify-end">
                                                <ChevronRightIcon className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500" />
                                            </div>
                                        </div>

                                        {/* VIEW MOBILE */}
                                        <div className="lg:hidden p-4 flex items-center justify-between border-b border-slate-100 active:bg-slate-50">
                                            <div className="flex-grow min-w-0">
                                                <div className="flex items-start gap-2 mb-1">
                                                    <CubeIcon className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                                    <div className="flex flex-wrap items-baseline gap-x-2 min-w-0">
                                                        <span className="text-sm font-bold text-slate-800 truncate uppercase">
                                                            {env.name}
                                                        </span>
                                                        {env.initials && (
                                                            <span className="text-blue-600 text-[10px] font-black whitespace-nowrap">
                                                                [{env.initials}]
                                                            </span>
                                                        )}
                                                        {hasProjects && (
                                                            <div className="flex items-center gap-0.5 text-blue-500 ml-1">
                                                                <FolderIcon className="w-3 h-3" />
                                                                <span className="text-[8px] font-black">{env.projectFiles!.length}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-black uppercase">{env.purchaseOrder || '---'}</span>
                                                    <span className={`text-[10px] font-black ${isDone ? 'text-green-600' : 'text-blue-600'}`}>{displayProgress}%</span>
                                                </div>
                                                <div className="flex gap-4">
                                                    <div className="text-[10px] text-slate-500">Portal: <b className="text-slate-700 font-bold">R$ {pParts.value}</b></div>
                                                    <div className="text-[10px] text-slate-500">2,3: <b className="text-blue-700 font-black">R$ {vParts.value}</b></div>
                                                </div>
                                                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400 font-bold uppercase">
                                                    <UserIcon className="w-3 h-3"/> {env.assembler || 'N/A'}
                                                </div>
                                            </div>
                                            <ChevronRightIcon className="w-5 h-5 text-slate-300 ml-2" />
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* TOTALS SUMMARY */}
                    {sortedEnvironments.length > 0 && (
                        <div className="bg-slate-900 rounded-lg p-3 flex justify-between items-center text-white shadow-lg border border-white/10 mt-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-600 p-1.5 rounded text-white shadow-inner"><ChartBarIcon className="w-4 h-4" /></div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-blue-300 uppercase tracking-widest leading-none">Totais da Obra</span>
                                    <span className="text-[8px] text-slate-400 font-bold uppercase mt-1">{sortedEnvironments.length} Ambientes</span>
                                </div>
                            </div>
                            <div className="flex gap-4 sm:gap-10">
                                <div className="text-right border-r border-white/10 pr-4 sm:pr-10 hidden sm:block">
                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-tighter mb-1">Soma Portal</p>
                                    <div className="grid grid-cols-[15px_1fr] text-sm font-light">
                                        <span className="text-xs text-slate-600">R$</span>
                                        <span>{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(totalPortal)}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-black text-blue-400 uppercase tracking-tighter mb-1">Produção Total (2,3)</p>
                                    <div className="grid grid-cols-[20px_1fr] text-lg font-black text-blue-400 leading-none">
                                        <span className="text-xs self-start mt-1.5">R$</span>
                                        <span className="text-right">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(total23)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                );})()}

            {activeTab === 'logistics' && <div className="animate-fadeIn"><ShippingManager client={client} onUpdateClient={onUpdateClient} assemblers={assemblers} /></div>}
            {activeTab === 'visits' && <div className="animate-fadeIn"><VisitManager client={client} onUpdateClient={onUpdateClient} /></div>}
            {activeTab === 'punchlist' && <div className="animate-fadeIn"><PunchListManager client={client} assemblers={assemblers} onUpdateClient={onUpdateClient} /></div>}
            {activeTab === 'assistance' && <div className="animate-fadeIn"><AssistanceManager client={client} clients={clients} assemblers={assemblers} onUpdateClient={onUpdateClient} /></div>}
            {activeTab === 'reports' && (
                <div className="animate-fadeIn space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                        <button onClick={() => setShowPreAssemblyReport(true)} className="flex flex-col items-center justify-center p-8 sm:p-12 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-all group">
                            <ClipboardListIcon className="w-8 h-8 text-slate-400 group-hover:text-blue-600 mb-4 transition-colors"/>
                            <span className="text-[10px] tracking-[0.3em] font-medium text-slate-600 uppercase group-hover:text-slate-900 text-center">Checklist Início</span>
                        </button>
                        <button onClick={() => setShowWorkReleaseReport(true)} className="flex flex-col items-center justify-center p-8 sm:p-12 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-all group">
                            <LockClosedIcon className="w-8 h-8 text-slate-400 group-hover:text-orange-600 mb-4 transition-colors"/>
                            <span className="text-[10px] tracking-[0.3em] font-medium text-slate-600 uppercase group-hover:text-slate-900 text-center">Liberação de Obra</span>
                        </button>
                        <button onClick={() => setShowSupervisionReport(true)} className="flex flex-col items-center justify-center p-8 sm:p-12 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-all group">
                            <ShieldIcon className="w-8 h-8 text-slate-400 group-hover:text-purple-600 mb-4 transition-colors"/>
                            <span className="text-[10px] tracking-[0.3em] font-medium text-slate-600 uppercase group-hover:text-slate-900 text-center">Acompanhamento Supervisão</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>

      {showReport && <ReportModal client={client} onClose={() => setShowReport(false)} />}
      {showTodeschiniReport && <TodeschiniReportModal client={client} onClose={() => setShowTodeschiniReport(false)} onUpdateClient={onUpdateClient} />}
      {showPreAssemblyReport && <PreAssemblyReportModal client={client} onClose={() => setShowPreAssemblyReport(false)} onUpdateClient={onUpdateClient} />}
      {showWorkReleaseReport && <WorkReleaseReportModal client={client} onClose={() => setShowWorkReleaseReport(false)} onUpdateClient={onUpdateClient} />}
      {showSupervisionReport && <SupervisionReportModal client={client} assemblers={assemblers} onClose={() => setShowSupervisionReport(false)} onUpdateClient={onUpdateClient} />}
    </>
  );
};

export default ClientCard;
