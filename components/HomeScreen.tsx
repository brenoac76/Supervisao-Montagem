import React, { useState, useMemo, useRef } from 'react';
// Removed non-existent 'UserType' from the import list below
import { Client, ChecklistStatus, Assembler, Media } from '../types';
import AddClientForm from './AddClientForm';
import ClientProgressCircle from './ClientProgressCircle';
import Modal from './Modal';
import { 
    PlusCircleIcon, 
    SearchIcon, 
    ExclamationCircleIcon, 
    RefreshIcon, 
    HomeIcon, 
    BuildingOfficeIcon,
    CheckCircleIcon,
    UserIcon,
    ChartBarIcon,
    ChevronRightIcon,
    MapPinIcon,
    ShieldCheckIcon,
    ClipboardListIcon,
    CubeIcon,
    XIcon,
    PrinterIcon,
    CameraIcon,
    ChevronLeftIcon
} from './icons';

interface HomeScreenProps {
  clients: Client[];
  assemblers?: Assembler[];
  onSelectClient: (clientId: string) => void;
  onAddClient: (client: Omit<Client, 'id' | 'environments'>) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

type FilterStatus = 'ALL' | 'ISSUES' | 'PROGRESS' | 'COMPLETED';

interface DetailedIssue {
    id: string;
    type: 'ASTECA' | 'PÓS-OBRA';
    description: string;
    location: string;
    media: Media[];
    observations?: string;
    astecaData?: {
        oc?: string;
        num?: string;
        date?: string;
        reason?: string;
    };
}

const getDisplayableDriveUrl = (url: string): string => {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
  const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
  const match = url.match(driveRegex);
  if (match && match[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  return url;
};

// Componente de Imagem com Zoom para Mobile (Pinch-to-zoom)
const ZoomableImage: React.FC<{ url: string; alt: string }> = ({ url, alt }) => {
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    
    const lastTouchRef = useRef<{ x: number, y: number } | null>(null);
    const startPinchDistRef = useRef<number | null>(null);
    const startZoomLevelRef = useRef<number>(1);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = Math.sqrt(
                Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) + 
                Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2)
            );
            startPinchDistRef.current = dist;
            startZoomLevelRef.current = zoomLevel;
        } else if (e.touches.length === 1 && zoomLevel > 1) {
            lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            setIsDragging(true);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && startPinchDistRef.current !== null) {
            const dist = Math.sqrt(
                Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) + 
                Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2)
            );
            const scaleFactor = dist / startPinchDistRef.current;
            const newZoom = Math.max(1, Math.min(startZoomLevelRef.current * scaleFactor, 5));
            setZoomLevel(newZoom);
            if (newZoom === 1) setPanPosition({ x: 0, y: 0 });
        } else if (e.touches.length === 1 && isDragging && lastTouchRef.current) {
            const dx = e.touches[0].clientX - lastTouchRef.current.x;
            const dy = e.touches[0].clientY - lastTouchRef.current.y;
            setPanPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        startPinchDistRef.current = null;
        lastTouchRef.current = null;
    };

    const resetZoom = () => {
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
    };

    return (
        <div className="relative overflow-hidden bg-slate-100 rounded-2xl border border-slate-200 touch-none">
            <div 
                className="w-full flex items-center justify-center min-h-[300px]"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <img 
                    src={getDisplayableDriveUrl(url)} 
                    alt={alt}
                    className="w-full h-auto object-contain max-h-[70vh] mx-auto transition-transform duration-75 ease-out select-none"
                    style={{ 
                        transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
                    }}
                    draggable={false}
                />
            </div>
            {zoomLevel > 1 && (
                <button 
                    onClick={resetZoom}
                    className="absolute bottom-4 right-4 bg-black/50 text-white p-2 rounded-full backdrop-blur-sm shadow-lg z-10"
                >
                    <RefreshIcon className="w-5 h-5" />
                </button>
            )}
        </div>
    );
};

const HomeScreen: React.FC<HomeScreenProps> = ({ clients, assemblers = [], onSelectClient, onAddClient, onRefresh, isRefreshing }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('ALL');
  const [viewingIssuesClient, setViewingIssuesClient] = useState<Client | null>(null);
  const [selectedDetailIssue, setSelectedDetailIssue] = useState<DetailedIssue | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleAddClient = (client: Omit<Client, 'id' | 'environments'>) => {
    onAddClient(client);
    setShowAddForm(false);
  }

  const getDetailedIssues = (client: Client): DetailedIssue[] => {
    const detailed: DetailedIssue[] = [];

    (client.environments || []).forEach(env => {
        const assemblyItems = (env.checklist || []).filter(i => !i.isDelivery);
        
        assemblyItems.forEach(item => {
            if (item.status === ChecklistStatus.Defective) {
                detailed.push({ 
                    id: item.id,
                    type: 'ASTECA', 
                    description: item.description, 
                    location: env.name,
                    media: item.astecaMedia || [],
                    observations: item.observations || item.defectObservation,
                    astecaData: {
                        oc: item.astecaOC,
                        num: item.astecaNumber,
                        date: item.astecaDate,
                        reason: item.astecaReason
                    }
                });
            }
        });
    });

    if (client.punchLists && Array.isArray(client.punchLists)) {
        client.punchLists.forEach(list => {
            (list.items || []).forEach(item => {
                if (item.issues && Array.isArray(item.issues) && item.issues.length > 0) {
                    item.issues.forEach(iss => {
                        if (iss.status === 'Pending') {
                            detailed.push({ 
                                id: iss.id,
                                type: 'PÓS-OBRA', 
                                description: iss.description, 
                                location: `${list.title} > ${item.description}`,
                                media: iss.media || [],
                                observations: iss.observations
                            });
                        }
                    });
                } 
                else if (item.status === 'Pending') {
                    detailed.push({ 
                        id: item.id,
                        type: 'PÓS-OBRA', 
                        description: item.description, 
                        location: list.title,
                        media: item.media || [],
                        observations: item.observations
                    });
                }
            });
        });
    }

    return detailed;
  };

  const handlePrintIssues = async (client: Client) => {
      setIsGeneratingPdf(true);
      try {
          const { jsPDF } = (window as any).jspdf;
          const pdf = new jsPDF('p', 'mm', 'a4');
          const issues = getDetailedIssues(client);
          const margin = 15;
          let y = 20;

          pdf.setFont('helvetica', 'bold').setFontSize(14).setTextColor(0);
          pdf.text(`PENDÊNCIAS: ${client.name.toUpperCase()}`, margin, y);
          y += 8;
          pdf.setFontSize(8).setFont('helvetica', 'normal').setTextColor(100);
          pdf.text(`RELATÓRIO GERADO EM: ${new Date().toLocaleString('pt-BR')}`, margin, y);
          y += 10;

          issues.forEach((issue, idx) => {
              if (y > 270) { pdf.addPage(); y = 20; }
              
              pdf.setFillColor(245, 245, 245).rect(margin, y, 180, 7, 'F');
              pdf.setFont('helvetica', 'bold').setFontSize(7).setTextColor(issue.type === 'ASTECA' ? 180 : 50, 0, 0);
              pdf.text(`${issue.type} > ${issue.location.toUpperCase()}`, margin + 2, y + 4.5);
              y += 10;

              pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(0);
              const splitDesc = pdf.splitTextToSize(issue.description, 170);
              pdf.text(splitDesc, margin + 2, y);
              y += (splitDesc.length * 5) + 3;

              if (issue.observations) {
                  pdf.setFont('helvetica', 'italic').setFontSize(7).setTextColor(100);
                  const splitObs = pdf.splitTextToSize(`Observação: ${issue.observations}`, 160);
                  pdf.text(splitObs, margin + 5, y);
                  y += (splitObs.length * 4) + 3;
              }

              if (issue.type === 'ASTECA' && issue.astecaData) {
                  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(80);
                  pdf.text(`OC: ${issue.astecaData.oc || '---'} | Nº: ${issue.astecaData.num || '---'} | Motivo: ${issue.astecaData.reason || '---'}`, margin + 2, y);
                  y += 6;
              }
              
              y += 5;
          });

          pdf.save(`pendencias_${client.name.replace(/\s+/g, '_')}.pdf`);
      } catch (e) {
          alert("Erro ao gerar PDF.");
      } finally {
          setIsGeneratingPdf(false);
      }
  };

  const calculateStats = (client: Client) => {
    const mainEnvironments = (client.environments || []).filter(env => !env.isAssistance);
    if (mainEnvironments.length === 0) return { progress: 0, totalIssues: 0, totalItems: 0 };

    const getWeightMultiplier = (w?: number) => {
        if (w === 2) return 0.5;
        if (w === 3) return 0.25;
        return 1.0;
    };

    const totalPossibleWeight = mainEnvironments.reduce((acc, env) => acc + getWeightMultiplier(env.weight), 0);
    const totalWeightedProgress = mainEnvironments.reduce((acc, env) => {
        const weight = getWeightMultiplier(env.weight);
        const progress = env.manualProgress || 0;
        return acc + (progress * weight);
    }, 0);

    const progress = totalPossibleWeight > 0 ? (totalWeightedProgress / totalPossibleWeight) : 0;
    const totalIssues = getDetailedIssues(client).length;
    return { progress, totalIssues, totalItems: mainEnvironments.length };
  };

  const getClientStatusCategory = (progress: number, issues: number): FilterStatus => {
      if (issues > 0) return 'ISSUES';
      if (progress >= 100) return 'COMPLETED';
      return 'PROGRESS';
  };

  const processedClients = useMemo(() => {
      return (clients || []).map(client => {
          const stats = calculateStats(client);
          const category = getClientStatusCategory(stats.progress, stats.totalIssues);
          return { ...client, stats, category };
      }).sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()));
  }, [clients]);

  const filteredClients = processedClients.filter(client => {
      const matchesSearch = (client.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (client.address || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = activeFilter === 'ALL' || client.category === activeFilter;
      return matchesSearch && matchesFilter;
  });

  const FilterButton: React.FC<{ type: FilterStatus, label: string, icon: React.ReactNode, count: number, colorClass: string }> = ({ type, label, icon, count, colorClass }) => (
      <button 
        onClick={() => setActiveFilter(type)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${activeFilter === type ? colorClass : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}`}
      >
          {icon}
          <span>{label}</span>
          <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${activeFilter === type ? 'bg-white/30' : 'bg-white text-slate-600 border border-slate-200'}`}>{count}</span>
      </button>
  );

  return (
    <div className="flex flex-col min-h-0 bg-slate-50">
      {!showAddForm && (
        <div className="flex-shrink-0 bg-white pt-4 pb-4 px-4 md:px-8 space-y-4 shadow-sm border-b border-slate-200 z-10">
            <div className="max-w-7xl mx-auto space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                    <div className="relative flex-grow w-full sm:w-auto">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><SearchIcon /></div>
                        <input
                            type="text"
                            placeholder="Buscar obra..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 bg-slate-50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm transition-all focus:bg-white"
                        />
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button onClick={onRefresh} disabled={isRefreshing} className="flex-shrink-0 flex items-center justify-center bg-white text-slate-600 border border-slate-200 p-2.5 rounded-xl hover:bg-slate-50 transition duration-300">
                            <RefreshIcon className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={() => setShowAddForm(true)} className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 bg-blue-600 text-white font-medium py-2.5 px-6 rounded-xl shadow-md hover:bg-blue-700 transition duration-300 text-sm whitespace-nowrap">
                            <PlusCircleIcon className="w-5 h-5" /> Nova Obra
                        </button>
                    </div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                    <FilterButton type="ALL" label="Todas" icon={<HomeIcon className="w-3 h-3"/>} count={clients.length} colorClass="bg-slate-800 text-white border-slate-800" />
                    <FilterButton type="ISSUES" label="Critérios" icon={<ExclamationCircleIcon className="w-3 h-3"/>} count={processedClients.filter(c => c.category === 'ISSUES').length} colorClass="bg-red-600 text-white border-red-600" />
                    <FilterButton type="PROGRESS" label="Andamento" icon={<ChartBarIcon className="w-3 h-3"/>} count={processedClients.filter(c => c.category === 'PROGRESS').length} colorClass="bg-blue-600 text-white border-blue-600" />
                    <FilterButton type="COMPLETED" label="Concluídas" icon={<CheckCircleIcon className="w-3 h-3"/>} count={processedClients.filter(c => c.category === 'COMPLETED').length} colorClass="bg-green-600 text-white border-green-600" />
                </div>
            </div>
        </div>
      )}

      {showAddForm ? (
        <div className="flex-grow p-4 sm:p-6 lg:p-8 overflow-y-auto"><div className="max-w-4xl mx-auto"><AddClientForm assemblers={assemblers} onAddClient={handleAddClient} onCancel={() => setShowAddForm(false)} /></div></div>
      ) : (
          <div className="flex-grow bg-white overflow-y-auto">
              <div className="max-w-7xl mx-auto">
                  {filteredClients.length > 0 ? (
                      <div className="divide-y divide-slate-100">
                          {filteredClients.map(client => {
                              const { progress, totalIssues } = client.stats;
                              const hasIssues = totalIssues > 0;

                              const astecaItems = client.environments.flatMap(e => e.checklist || []).filter(i => i.status === ChecklistStatus.Defective);
                              const astecaInfo = astecaItems.reduce((acc, item) => {
                                  const num = item.astecaNumber || '?';
                                  const oc = item.astecaOC || '?';
                                  if (!acc[num]) acc[num] = new Set();
                                  acc[num].add(oc);
                                  return acc;
                              }, {} as Record<string, Set<string>>);

                              return (
                                <div 
                                    key={client.id}
                                    onClick={() => onSelectClient(client.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            onSelectClient(client.id);
                                        }
                                    }}
                                    className="w-full flex items-center p-4 md:p-6 hover:bg-blue-50/50 transition-colors text-left group border-l-4 border-l-transparent active:bg-slate-100 cursor-pointer"
                                    style={{ borderLeftColor: hasIssues ? '#dc2626' : (progress >= 100 ? '#22c55e' : '#3b82f6') }}
                                >
                                    <div className="flex-shrink-0 mr-4 sm:mr-6"><ClientProgressCircle percentage={progress} /></div>
                                    <div className="flex-grow min-w-0 pr-2">
                                        <h3 className="font-bold text-slate-800 truncate text-[14px] sm:text-base mb-1 tracking-tight">{client.name}</h3>
                                        
                                        {Object.entries(astecaInfo).map(([num, ocs]) => (
                                            <button 
                                                key={num} 
                                                onClick={(e) => { e.stopPropagation(); setViewingIssuesClient(client); }}
                                                className="bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight inline-flex items-center gap-1 mb-1 shadow-md hover:bg-red-700 transition-colors"
                                            >
                                                <ShieldCheckIcon className="w-3 h-3" />
                                                AST: {num} (OC: {Array.from(ocs as any).join(', ')})
                                            </button>
                                        ))}

                                        <p className="text-xs text-slate-500 truncate mt-0.5 font-normal opacity-80">
                                            <MapPinIcon className="w-3 h-3 inline text-slate-400" /> {client.address}
                                        </p>

                                        <div className="flex gap-4 mt-2">
                                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest flex items-center gap-1.5 opacity-70">
                                                <UserIcon className="w-3 h-3 text-slate-400" /> {client.assembler || 'S/M'}
                                            </span>
                                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest flex items-center gap-1.5 opacity-70">
                                                <BuildingOfficeIcon className="w-3 h-3 text-slate-400" /> {client.unitType}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 ml-4">
                                        {hasIssues && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setViewingIssuesClient(client); }}
                                                className="bg-orange-50 text-orange-700 px-2 py-1 rounded-lg flex items-center gap-1.5 border border-orange-100 shadow-sm hover:bg-orange-100 transition-all"
                                            >
                                                <ExclamationCircleIcon className="w-4 h-4 text-orange-600"/><span className="text-xs font-bold">{totalIssues}</span>
                                            </button>
                                        )}
                                        <ChevronRightIcon className="w-5 h-5 text-slate-300 group-hover:text-blue-400 transition-colors" />
                                    </div>
                                </div>
                              );
                          })}
                      </div>
                  ) : <div className="text-center py-32 px-6 bg-slate-50 mx-4 mt-8 rounded-2xl border-2 border-dashed border-slate-200"><h2 className="text-xl font-bold text-slate-600">Nenhuma obra encontrada</h2></div>}
              </div>
          </div>
      )}

      {viewingIssuesClient && (
        <Modal onClose={() => setViewingIssuesClient(null)}>
            <div className="flex flex-col max-h-[85vh] font-app">
                <div className="flex-shrink-0 border-b pb-4 mb-4 flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                            <ExclamationCircleIcon className="w-6 h-6 text-red-600" />
                            {viewingIssuesClient.name}
                        </h2>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Clique num item para ver fotos e detalhes</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => handlePrintIssues(viewingIssuesClient)} 
                            disabled={isGeneratingPdf}
                            className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50"
                            title="Imprimir Lista"
                        >
                            <PrinterIcon className="w-6 h-6" />
                        </button>
                        <button onClick={() => setViewingIssuesClient(null)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                            <XIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto pr-2 space-y-3">
                    {getDetailedIssues(viewingIssuesClient).map((issue) => (
                        <button 
                            key={issue.id} 
                            onClick={() => setSelectedDetailIssue(issue)}
                            className={`w-full p-4 rounded-xl border text-left flex items-center justify-between gap-4 transition-all hover:shadow-md active:scale-[0.98] ${issue.type === 'ASTECA' ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}
                        >
                            <div className="flex-grow min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${issue.type === 'ASTECA' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}>
                                        {issue.type}
                                    </span>
                                    <span className="text-[10px] font-medium text-slate-400 uppercase truncate">{issue.location}</span>
                                </div>
                                <p className="text-sm font-medium text-slate-800 leading-tight">{issue.description}</p>
                                {issue.media.length > 0 && <span className="text-[9px] text-blue-600 font-medium mt-1 inline-flex items-center gap-1"><CameraIcon className="w-3 h-3"/> {issue.media.length} Foto(s)</span>}
                            </div>
                            <ChevronRightIcon className="w-5 h-5 text-slate-300" />
                        </button>
                    ))}
                </div>

                <div className="flex-shrink-0 pt-4 mt-4 border-t flex justify-end">
                    <button onClick={() => { const id = viewingIssuesClient.id; setViewingIssuesClient(null); onSelectClient(id); }} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-black transition-all">Abrir Obra Completa</button>
                </div>
            </div>
        </Modal>
      )}

      {selectedDetailIssue && (
        <Modal onClose={() => setSelectedDetailIssue(null)} fullScreen={selectedDetailIssue.media.length > 0}>
            <div className={`flex flex-col h-full font-app bg-white ${selectedDetailIssue.media.length > 0 ? 'p-0' : 'p-6'}`}>
                <div className="flex-shrink-0 border-b p-4 flex justify-between items-center bg-slate-50">
                    <button onClick={() => setSelectedDetailIssue(null)} className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase hover:text-blue-600 transition-colors">
                        <ChevronLeftIcon className="w-5 h-5" /> Voltar à Lista
                    </button>
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase ${selectedDetailIssue.type === 'ASTECA' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>
                        {selectedDetailIssue.type}
                    </span>
                </div>

                <div className="flex-grow overflow-y-auto">
                    <div className="p-6 space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 uppercase leading-tight">{selectedDetailIssue.description}</h2>
                            <p className="text-sm font-medium text-slate-400 uppercase mt-2 flex items-center gap-2"><CubeIcon className="w-4 h-4"/> {selectedDetailIssue.location}</p>
                        </div>

                        {selectedDetailIssue.type === 'ASTECA' && selectedDetailIssue.astecaData && (
                            <div className="grid grid-cols-2 gap-4 bg-red-50 p-4 rounded-xl border border-red-100">
                                <div><p className="text-[9px] font-bold text-red-400 uppercase">O.C. Compra</p><p className="font-normal text-slate-700">{selectedDetailIssue.astecaData.oc || '---'}</p></div>
                                <div><p className="text-[9px] font-bold text-red-400 uppercase">Nº Assistência</p><p className="font-normal text-slate-700">{selectedDetailIssue.astecaData.num || '---'}</p></div>
                                <div className="col-span-2"><p className="text-[9px] font-bold text-red-400 uppercase">Motivo Relatado</p><p className="font-normal text-slate-600 text-sm italic">{selectedDetailIssue.astecaData.reason || 'Não informado'}</p></div>
                            </div>
                        )}

                        {selectedDetailIssue.observations && (
                            <div className="bg-slate-50 p-4 rounded-xl border-l-4 border-blue-500">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Observações Técnicas</p>
                                <p className="text-sm text-slate-700 leading-relaxed font-normal">{selectedDetailIssue.observations}</p>
                            </div>
                        )}

                        {selectedDetailIssue.media.length > 0 && (
                            <div className="space-y-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2 tracking-widest"><CameraIcon className="w-4 h-4"/> Galeria de Fotos</p>
                                <div className="grid grid-cols-1 gap-4">
                                    {selectedDetailIssue.media.map((m) => (
                                        <div key={m.id} className="flex flex-col">
                                            <ZoomableImage url={m.url} alt="pendência" />
                                            {m.observation && <div className="p-4 bg-white border border-t-0 rounded-b-2xl text-sm font-normal text-slate-600 italic">"{m.observation}"</div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
      )}
    </div>
  );
};

export default HomeScreen;