
import React, { useState } from 'react';
import { Client, ChecklistItem, ChecklistStatus, Environment } from '../types';
import Modal from './Modal';
import { CubeIcon, ClipboardListIcon, CheckCircleIcon, ExclamationCircleIcon, UserIcon, UsersIcon, RefreshIcon, ChevronRightIcon, ArrowLeftIcon, TagIcon } from './icons';

interface DashboardProps {
    client: Client;
    onSelectEnvironment: (environmentId: string) => void;
}

const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode; color: string; onClick?: () => void }> = ({ title, value, icon, color, onClick }) => {
    const isClickable = !!onClick && value > 0;
    const Tag = isClickable ? 'button' : 'div';

    return (
        <Tag
            onClick={onClick}
            className={`p-2 sm:p-4 w-full text-left rounded-lg shadow-md flex items-center gap-2 sm:gap-4 ${color} ${isClickable ? 'cursor-pointer hover:shadow-lg transform hover:-translate-y-1 transition-all duration-200' : ''}`}
            disabled={!isClickable}
            aria-label={isClickable ? `Ver ${value} ${title}` : `${title}: ${value}`}
        >
            <div className="flex-shrink-0 transform scale-75 sm:scale-100 origin-left">{icon}</div>
            <div className="min-w-0 overflow-hidden">
                <p className="text-xl sm:text-3xl font-semibold truncate">{value}</p>
                <p className="text-[10px] sm:text-sm font-normal uppercase tracking-normal sm:tracking-wider truncate opacity-80" title={title}>{title}</p>
            </div>
        </Tag>
    );
};

const assemblerColors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-400',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
    'bg-slate-400', // Cor para o Não Atribuído
];

const getAssemblerColor = (index: number, isUnassigned: boolean) => {
    if (isUnassigned) return 'bg-slate-300';
    return assemblerColors[index % (assemblerColors.length - 1)];
};

const Dashboard: React.FC<DashboardProps> = ({ client, onSelectEnvironment }) => {
    const [modalContent, setModalContent] = useState<{ title: string; environments: (Environment & { calculatedProgress: number })[] } | null>(null);
    const [expandedEnvId, setExpandedEnvId] = useState<string | null>(null);

    // Filtra ambientes principais (não assistência)
    const mainAssemblyEnvironments = client.environments.filter(env => !env.isAssistance);
    
    // Multiplicadores de Peso
    const getWeightMultiplier = (w?: number) => {
        if (w === 2) return 0.5;
        if (w === 3) return 0.25;
        return 1.0;
    };

    // Cálculo de progresso individual por ambiente para listagens em modais
    const envsWithProgress = mainAssemblyEnvironments.map(env => {
        const progress = env.manualProgress || 0;
        return { ...env, calculatedProgress: progress };
    });

    const completedEnvsCount = envsWithProgress.filter(e => e.calculatedProgress === 100).length;
    const inProgressEnvsCount = envsWithProgress.filter(e => e.calculatedProgress > 0 && e.calculatedProgress < 100).length;
    const notStartedEnvsCount = envsWithProgress.filter(e => e.calculatedProgress === 0).length;

    // Itens ASTECA
    const defectiveItemsCount = mainAssemblyEnvironments.flatMap(env => env.checklist).filter(item => item.status === ChecklistStatus.Defective).length;

    // Estatísticas de entrega
    const deliveryItems = client.environments.flatMap(env => env.checklist).filter(item => item.isDelivery);
    const deliveredCount = deliveryItems.filter(item => item.status === ChecklistStatus.Completed).length;

    // --- CÁLCULO DE PROGRESSO GERAL PONDERADO (PARA A BARRA SUPERIOR) ---
    const totalPossibleWeight = mainAssemblyEnvironments.reduce((acc, env) => acc + getWeightMultiplier(env.weight), 0);
    const totalWeightedProgress = mainAssemblyEnvironments.reduce((acc, env) => {
        const weight = getWeightMultiplier(env.weight);
        const progress = env.manualProgress || 0;
        return acc + (progress * weight);
    }, 0);
    const progressPercentage = totalPossibleWeight > 0 ? (totalWeightedProgress / totalPossibleWeight) : 0;

    const handleShowEnvsByProgress = (title: string, filter: 'ALL' | 'DONE' | 'DOING' | 'TODO') => {
        const targetEnvs = envsWithProgress.filter(e => {
            if (filter === 'ALL') return true;
            if (filter === 'DONE') return e.calculatedProgress === 100;
            if (filter === 'DOING') return e.calculatedProgress > 0 && e.calculatedProgress < 100;
            if (filter === 'TODO') return e.calculatedProgress === 0;
            return false;
        });
        setExpandedEnvId(null);
        setModalContent({ title: `${title} (${targetEnvs.length})`, environments: targetEnvs });
    };

    const handleShowAstecas = () => {
        const astecaEnvs = envsWithProgress.filter(env => 
            env.checklist.some(i => i.status === ChecklistStatus.Defective)
        );
        setExpandedEnvId(null);
        setModalContent({ title: `Ambientes com ASTECA (${astecaEnvs.length})`, environments: astecaEnvs });
    };
    
    const handleItemClick = (environmentId: string) => {
        setModalContent(null);
        onSelectEnvironment(environmentId);
    }

    // --- NOVA LÓGICA DE CONTRIBUIÇÃO (SOMENTE ATRIBUIÇÃO E PESO) ---
    interface AssemblerContribution {
        name: string;
        envs: number;
        weightSum: number;
        percentage: number;
        isUnassigned: boolean;
    }

    const statsByAssembler = mainAssemblyEnvironments.reduce((acc: Record<string, { count: number, weight: number }>, env) => {
        const baseWeight = getWeightMultiplier(env.weight);
        
        // Atribui ao primeiro montador
        const ass1 = env.assembler?.trim() || 'Não Atribuído';
        if (!acc[ass1]) acc[ass1] = { count: 0, weight: 0 };
        
        const split1 = env.assembler2Id ? (env.assembler1Percentage ?? 50) : 100;
        acc[ass1].count += 1;
        acc[ass1].weight += baseWeight * (split1 / 100);

        // Atribui ao segundo montador se existir
        if (env.assembler2Id) {
            const ass2 = env.assembler2?.trim() || 'Desconhecido';
            if (!acc[ass2]) acc[ass2] = { count: 0, weight: 0 };
            const split2 = env.assembler2Percentage ?? 50;
            acc[ass2].count += 1;
            acc[ass2].weight += baseWeight * (split2 / 100);
        }

        return acc;
    }, {} as Record<string, { count: number, weight: number }>);

    // Fix: Added explicit type cast to Object.entries to resolve 'unknown' type inference error on stats
    const assemblerContributions: AssemblerContribution[] = (Object.entries(statsByAssembler) as [string, { count: number, weight: number }][])
        .map(([name, stats]) => ({
            name,
            envs: stats.count,
            weightSum: stats.weight,
            percentage: totalPossibleWeight > 0 ? (stats.weight / totalPossibleWeight) * 100 : 0,
            isUnassigned: name === 'Não Atribuído'
        }))
        .sort((a, b) => {
            if (a.isUnassigned) return 1; // Não atribuído sempre por último
            if (b.isUnassigned) return -1;
            return b.percentage - a.percentage;
        });

    const getAstecaTags = (env: Environment) => {
        const astecaItems = env.checklist.filter(i => i.status === ChecklistStatus.Defective);
        if (astecaItems.length === 0) return null;
        const ocs = Array.from(new Set(astecaItems.map(i => i.astecaOC).filter(Boolean)));
        const nums = Array.from(new Set(astecaItems.map(i => i.astecaNumber).filter(Boolean)));
        return (
            <div className="flex flex-wrap gap-1 mt-1">
                {nums.map((num, idx) => (
                    <span key={`num-${idx}`} className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-sm">AST: {num}</span>
                ))}
                {ocs.map((oc, idx) => (
                    <span key={`oc-${idx}`} className="bg-red-100 text-red-700 border border-red-200 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">OC: {oc}</span>
                ))}
            </div>
        );
    };

    return (
        <>
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50 space-y-6">
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-slate-700">Visão Geral da Montagem</h3>
                        {deliveryItems.length > 0 && (
                            <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded font-medium border border-orange-200">
                                {deliveredCount}/{deliveryItems.length} Itens de Entrega
                            </span>
                        )}
                    </div>
                    
                    <button 
                        onClick={() => handleShowEnvsByProgress('Detalhamento do Progresso Geral', 'ALL')}
                        className="w-full text-left group transition-all"
                    >
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-blue-700 group-hover:text-blue-800 flex items-center gap-2">
                                Progresso Geral da Obra (Ponderado)
                                <ChevronRightIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </span>
                            <span className="text-sm font-black text-blue-700">{Math.round(progressPercentage)}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-4 shadow-inner overflow-hidden border border-slate-300 group-hover:border-blue-400 group-hover:shadow-md transition-all">
                            <div
                                className="bg-blue-600 h-4 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${progressPercentage}%` }}
                            ></div>
                        </div>
                        <p className="text-[9px] text-slate-400 uppercase font-bold mt-1 tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Clique para ver o detalhamento por ambiente</p>
                    </button>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mt-6">
                        <StatCard title="Ambientes" value={mainAssemblyEnvironments.length} icon={<CubeIcon className="w-8 h-8 text-indigo-700"/>} color="bg-indigo-100 text-indigo-800" onClick={() => handleShowEnvsByProgress('Todos os Ambientes', 'ALL')} />
                        <StatCard title="Andamento" value={inProgressEnvsCount} icon={<RefreshIcon className="w-8 h-8 text-blue-700"/>} color="bg-blue-100 text-blue-800" onClick={() => handleShowEnvsByProgress('Ambientes em Andamento', 'DOING')} />
                        <StatCard title="Concluídos" value={completedEnvsCount} icon={<CheckCircleIcon className="w-8 h-8 text-green-700"/>} color="bg-green-100 text-green-800" onClick={() => handleShowEnvsByProgress('Ambientes Concluídos', 'DONE')} />
                        <StatCard title="Falta" value={notStartedEnvsCount} icon={<ExclamationCircleIcon className="w-8 h-8 text-yellow-700"/>} color="bg-yellow-100 text-yellow-800" onClick={() => handleShowEnvsByProgress('Ambientes Não Iniciados', 'TODO')} />
                        <StatCard title="ASTECA" value={defectiveItemsCount} icon={<ExclamationCircleIcon className="w-8 h-8 text-red-700"/>} color="bg-red-100 text-red-800" onClick={handleShowAstecas} />
                    </div>
                </div>

                {assemblerContributions.length > 0 && (
                     <div className="pt-6 border-t border-slate-200">
                        <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <UsersIcon className="w-6 h-6 text-slate-600" />
                            Carga de Trabalho (Por Peso de Ambientes)
                        </h3>
                        
                        <div className="flex w-full bg-slate-200 rounded-full h-4 shadow-inner overflow-hidden">
                            {assemblerContributions.map((contrib, index) => (
                                <div
                                    key={contrib.name}
                                    className={`h-4 ${getAssemblerColor(index, contrib.isUnassigned)}`}
                                    style={{ width: `${contrib.percentage}%` }}
                                    title={`${contrib.name}: ${contrib.percentage.toFixed(1)}% do total`}
                                ></div>
                            ))}
                        </div>

                        <div className="space-y-2 mt-4">
                            {assemblerContributions.map((contrib, index) => (
                                <div key={contrib.name} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-3 h-3 rounded-full ${getAssemblerColor(index, contrib.isUnassigned)}`}></span>
                                        <p className={`font-medium ${contrib.isUnassigned ? 'text-slate-400 italic' : 'text-slate-800'}`}>
                                            {contrib.name}
                                        </p>
                                    </div>
                                    <p className="text-slate-600 font-normal">
                                        {`${contrib.percentage.toFixed(1)}%`}
                                        <span className="text-slate-500 opacity-80"> ({contrib.envs} {contrib.envs === 1 ? 'ambiente' : 'ambientes'})</span>
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            
            {modalContent && (
                <Modal onClose={() => setModalContent(null)}>
                    <div className="flex flex-col max-h-[80vh]">
                        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex-shrink-0">{modalContent.title}</h2>
                        <div className="overflow-y-auto pr-2 -mr-2 space-y-3">
                            {modalContent.environments.map(env => {
                                const isExpanded = expandedEnvId === env.id;
                                return (
                                    <div key={env.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                        <div onClick={() => setExpandedEnvId(isExpanded ? null : env.id)} className="w-full p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors">
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-800 uppercase truncate">{env.name}</span>
                                                    <div className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${env.calculatedProgress === 100 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{env.calculatedProgress}%</div>
                                                    <span className="text-[10px] text-slate-400 font-bold">P{env.weight || 1}</span>
                                                </div>
                                                {getAstecaTags(env)}
                                            </div>
                                            <ChevronRightIcon className={`w-5 h-5 text-slate-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                        </div>
                                        {isExpanded && (
                                            <div className="border-t border-slate-100 bg-slate-50/30 p-3 animate-fadeIn">
                                                <div className="flex flex-col gap-2 mb-4">
                                                    <p className="text-xs text-slate-500 uppercase font-bold">Montador 1: <span className="text-slate-800">{env.assembler || 'Não Atribuído'} {env.assembler2Id ? `(${env.assembler1Percentage}%)` : ''}</span></p>
                                                    {env.assembler2Id && <p className="text-xs text-slate-500 uppercase font-bold">Montador 2: <span className="text-slate-800">{env.assembler2} ({env.assembler2Percentage}%)</span></p>}
                                                    {env.observations && <p className="text-xs text-slate-600 italic">"{env.observations}"</p>}
                                                </div>
                                                <button onClick={() => handleItemClick(env.id)} className="w-full py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                                                    Abrir Detalhes do Ambiente <ArrowLeftIcon className="w-3 h-3 rotate-180"/>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};

export default Dashboard;
