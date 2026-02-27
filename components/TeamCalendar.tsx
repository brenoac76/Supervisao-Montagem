
import React, { useState, useMemo } from 'react';
import { Assembler, Client, ChecklistStatus } from '../types';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ShieldCheckIcon } from './icons';

interface TeamCalendarProps {
  assemblers: Assembler[];
  clients: Client[];
}

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Helper para garantir data local no formato YYYY-MM-DD sem conversão para UTC
const getLocalYMD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Cores consistentes para os montadores baseadas no nome
const getAssemblerColor = (name: string) => {
    const colors = [
        'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200',
        'bg-green-100 text-green-700 border-green-200 hover:bg-green-200',
        'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200',
        'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200',
        'bg-pink-100 text-pink-700 border-pink-200 hover:bg-pink-200',
        'bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200',
        'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200',
        'bg-teal-100 text-teal-700 border-teal-200 hover:bg-teal-200',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

type AssignmentDetail = {
    assemblerName: string;
    clientName: string;
    envName: string;
    isAssistance: boolean;
    isCompleted: boolean;
    hasIssues: boolean;
    uniqueKey: string; // Para evitar chaves duplicadas no React
};

// Estado para o Tooltip Fixo
type TooltipState = {
    visible: boolean;
    x: number;
    y: number;
    data: AssignmentDetail | null;
};

const TeamCalendar: React.FC<TeamCalendarProps> = ({ assemblers, clients }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Estado para controlar o tooltip flutuante
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, data: null });

  // Navegação do Mês
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Handlers de Mouse para o Tooltip
  const handleMouseEnter = (e: React.MouseEvent, data: AssignmentDetail) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
          visible: true,
          // Centraliza horizontalmente em relação ao item e posiciona acima
          x: rect.left + rect.width / 2, 
          y: rect.top, 
          data: data
      });
  };

  const handleMouseLeave = () => {
      setTooltip(prev => ({ ...prev, visible: false }));
  };

  // Lógica de Processamento de Dados (Assignments)
  const assignments = useMemo(() => {
    // Agora mapeamos para uma lista de objetos detalhados, não apenas nomes
    const map: Record<string, AssignmentDetail[]> = {}; 

    const addRange = (
        startStr: string | undefined, 
        endStr: string | undefined, 
        assemblerId: string | undefined,
        clientName: string,
        envName: string,
        isAssistance: boolean,
        isCompleted: boolean,
        hasIssues: boolean
    ) => {
        if (!startStr || !assemblerId) return;
        
        const assembler = assemblers.find(a => a.id === assemblerId);
        if (!assembler) return;

        // FILTRO: Ignorar ajudantes no calendário
        const r = (assembler.role || '').toLowerCase();
        if (r.includes('ajudante') || r.includes('auxiliar')) return;

        const start = new Date(startStr);
        const end = endStr ? new Date(endStr) : new Date(startStr); // Se não tiver fim, assume 1 dia

        // Normaliza para ignorar horas, usando construtor local
        let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endLoop = new Date(end.getFullYear(), end.getMonth(), end.getDate());

        // Loop dia a dia
        while (current <= endLoop) {
            const dayOfWeek = current.getDay();
            
            // Só adiciona se NÃO for Sábado (6) nem Domingo (0)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                const key = getLocalYMD(current);
                if (!map[key]) map[key] = [];
                
                // Evitar duplicatas exatas (mesmo montador, mesmo ambiente, mesmo dia)
                const exists = map[key].some(a => 
                    a.assemblerName === assembler.name && 
                    a.clientName === clientName && 
                    a.envName === envName
                );

                if (!exists) {
                    map[key].push({
                        assemblerName: assembler.name,
                        clientName: clientName,
                        envName: envName,
                        isAssistance: isAssistance,
                        isCompleted: isCompleted,
                        hasIssues: hasIssues,
                        uniqueKey: `${assembler.name}-${clientName}-${envName}`
                    });
                }
            }
            
            // Avança 1 dia
            current.setDate(current.getDate() + 1);
        }
    };

    clients.forEach(client => {
        client.environments.forEach(env => {
            const isAssist = !!env.isAssistance;
            
            // Check status of env items (excluding delivery)
            const items = env.checklist.filter(i => !i.isDelivery);
            const isCompleted = items.length > 0 && items.every(i => i.status === ChecklistStatus.Completed);
            // Has issues = items pending AND past end date, OR explicit defects. 
            // For calendar visual, 'Pending' usually means late or active issue.
            const hasPending = items.some(i => i.status === ChecklistStatus.Pending || i.status === ChecklistStatus.Defective);

            // 1. Verifica itens individuais (granularidade fina)
            env.checklist.forEach(item => {
                if (item.status !== ChecklistStatus.Completed && !item.isDelivery) {
                    addRange(item.scheduledStart, item.scheduledEnd, item.assemblerId, client.name, env.name, isAssist, false, true);
                }
            });

            // 2. Verifica ambiente inteiro (fallback/legado)
            // Se o ambiente tem datas e um montador
            if (env.scheduledStart && env.assemblerId) {
                 addRange(env.scheduledStart, env.scheduledEnd, env.assemblerId, client.name, env.name, isAssist, isCompleted, hasPending);
            }
        });
    });

    return map;
  }, [clients, assemblers]);

  // Construção do Grid do Calendário
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Dom, 1 = Seg...

  const days = [];
  // Padding dias vazios antes do dia 1
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  // Dias do mês
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const todayKey = getLocalYMD(new Date());

  // Helper to determine assistance class
  const getAssistanceClass = (job: AssignmentDetail) => {
      if (!job.isAssistance) return getAssemblerColor(job.assemblerName);
      
      // Assistance Base
      let classes = 'bg-purple-100 text-purple-900';
      
      if (job.isCompleted) {
          classes += ' border-2 border-green-500'; // Green border if done
      } else if (job.hasIssues) {
          classes += ' border-2 border-red-500'; // Red border if pending/issues
      } else {
          classes += ' border border-purple-300'; // Standard purple border (In Progress)
      }
      return classes;
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden animate-fadeIn relative">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600"/>
            Escala de Montagem
        </h3>
        <div className="flex items-center gap-4">
            <button onClick={goToToday} className="text-xs font-semibold text-blue-600 hover:underline">Hoje</button>
            <div className="flex items-center bg-white rounded-md shadow-sm border border-slate-300">
                <button onClick={prevMonth} className="p-1 hover:bg-slate-100 text-slate-600 rounded-l"><ChevronLeftIcon className="w-5 h-5"/></button>
                <span className="px-3 py-1 font-bold text-slate-700 min-w-[140px] text-center">
                    {MONTHS[month]} {year}
                </span>
                <button onClick={nextMonth} className="p-1 hover:bg-slate-100 text-slate-600 rounded-r"><ChevronRightIcon className="w-5 h-5"/></button>
            </div>
        </div>
      </div>

      {/* Grid Header (Weekdays) */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {DAYS_OF_WEEK.map(day => (
            <div key={day} className="text-center py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                {day}
            </div>
        ))}
      </div>

      {/* Grid Days */}
      <div className="grid grid-cols-7 auto-rows-fr bg-slate-200 gap-px border-b border-slate-200">
        {days.map((date, idx) => {
            if (!date) return <div key={`empty-${idx}`} className="bg-slate-50 min-h-[100px]"></div>;

            const dateKey = getLocalYMD(date);
            const workers = assignments[dateKey] || [];
            const isToday = dateKey === todayKey;
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            return (
                <div key={dateKey} className={`bg-white min-h-[100px] p-1 sm:p-2 flex flex-col transition-colors ${isWeekend ? 'bg-slate-50/50' : ''}`}>
                    <div className="flex justify-between items-start mb-1">
                        <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700'}`}>
                            {date.getDate()}
                        </span>
                        {workers.length > 0 && (
                            <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded-full font-medium hidden sm:inline-block">
                                {workers.length}
                            </span>
                        )}
                    </div>
                    
                    <div className="flex-grow space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                        {workers.map((job, jIdx) => (
                            <div 
                                key={`${job.uniqueKey}-${jIdx}`} 
                                onMouseEnter={(e) => handleMouseEnter(e, job)}
                                onMouseLeave={handleMouseLeave}
                                className={`
                                    cursor-help
                                    rounded
                                    text-[8px] sm:text-[10px] 
                                    px-1 py-0.5 sm:px-1.5 
                                    leading-[1.1] 
                                    whitespace-normal break-words
                                    ${getAssistanceClass(job)}
                                `}
                            >
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1 font-bold">
                                        {job.isAssistance && <ShieldCheckIcon className="w-2 h-2 flex-shrink-0" />}
                                        <span className="truncate">{job.assemblerName}</span>
                                    </div>
                                    {/* For assistance, show client name in the box as requested */}
                                    {job.isAssistance && (
                                        <span className="text-[8px] truncate opacity-80">{job.clientName.split(' ')[0]}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {workers.length === 0 && !isWeekend && (
                            <div className="h-full hidden sm:flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-[10px] text-green-600 font-medium bg-green-50 px-2 py-1 rounded">Livre</span>
                            </div>
                        )}
                    </div>
                </div>
            );
        })}
      </div>
      <div className="p-2 text-xs text-slate-400 text-center bg-slate-50">
          * Passe o mouse sobre o nome do montador para ver detalhes.
      </div>

      {/* FIXED TOOLTIP RENDERED OUTSIDE THE GRID FLOW */}
      {tooltip.visible && tooltip.data && (
          <div 
            className="fixed z-[9999] pointer-events-none bg-slate-800 text-white text-xs rounded-md shadow-xl p-3 max-w-[220px] transition-opacity duration-200"
            style={{ 
                top: tooltip.y - 10, 
                left: tooltip.x, 
                transform: 'translateX(-50%) translateY(-100%)' 
            }}
          >
              <p className="font-bold text-blue-200 mb-1 text-sm border-b border-slate-600 pb-1">{tooltip.data.clientName}</p>
              <p className="text-slate-300 mt-1">{tooltip.data.envName}</p>
              <p className="text-slate-400 italic text-[10px] mt-1">{tooltip.data.assemblerName}</p>
              
              {tooltip.data.isAssistance && (
                  <div className="mt-2">
                      <p className="text-purple-300 font-bold text-[10px] uppercase flex items-center gap-1 bg-purple-900/50 p-1 rounded mb-1">
                          <ShieldCheckIcon className="w-3 h-3"/> Assistência
                      </p>
                      {tooltip.data.isCompleted ? (
                          <span className="text-green-400 font-bold">Concluída</span>
                      ) : tooltip.data.hasIssues ? (
                          <span className="text-red-400 font-bold">Pendência/Atrasado</span>
                      ) : (
                          <span className="text-blue-300">Em Andamento</span>
                      )}
                  </div>
              )}
              
              {/* Seta do Tooltip */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
          </div>
      )}
    </div>
  );
};

export default TeamCalendar;
