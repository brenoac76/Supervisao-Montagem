import React from 'react';
import { Client } from '../types';
import { CubeIcon, UserIcon, ClipboardCheckIcon, CalendarIcon, ExclamationCircleIcon } from './icons';

type TimelineEvent = {
  date: string;
  type: 'start' | 'visit' | 'completion' | 'defect';
  text: string;
  id: string;
};

const EventIcon: React.FC<{ type: TimelineEvent['type'] }> = ({ type }) => {
  const baseClasses = "h-5 w-5";
  switch (type) {
    case 'start':
      return <CubeIcon className={`${baseClasses} text-indigo-500`} />;
    case 'visit':
      return <UserIcon className={`${baseClasses} text-sky-500`} />;
    case 'completion':
      return <ClipboardCheckIcon className={`${baseClasses} text-green-500`} />;
    case 'defect':
      return <ExclamationCircleIcon className={`${baseClasses} text-red-500`} />;
    default:
      return null;
  }
};

const formatDate = (dateString: string) => {
    // Input is YYYY-MM-DD
    const date = new Date(dateString);
    // Add timezone offset to avoid date shifting
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
};

const Timeline: React.FC<{ client: Client }> = ({ client }) => {
  const events: TimelineEvent[] = [];

  if (client.startDate) {
    events.push({
      date: client.startDate,
      type: 'start',
      text: 'Início da montagem do projeto.',
      id: 'start-date'
    });
  }

  client.visitLogs.forEach(log => {
    events.push({
      date: log.date,
      type: 'visit',
      text: log.notes,
      id: log.id
    });
  });

  client.environments.forEach(env => {
    env.checklist.forEach(item => {
      if (item.completionDate) {
        events.push({
          date: item.completionDate,
          type: 'completion',
          text: `Item Concluído: ${item.description} (Ambiente: ${env.name})`,
          id: `${item.id}-completion`
        });
      }
      if (item.defectDate) {
        events.push({
          date: item.defectDate,
          type: 'defect',
          text: `Item com Defeito: ${item.description} (Ambiente: ${env.name})`,
          id: `${item.id}-defect`
        });
      }
    });
  });

  const groupedByDay = events.reduce((acc, event) => {
    const day = new Date(event.date).toISOString().split('T')[0];
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(event);
    return acc;
  }, {} as Record<string, TimelineEvent[]>);

  const sortedDays = Object.keys(groupedByDay).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
      <h3 className="text-lg font-semibold text-slate-700 mb-6 flex items-center gap-2">
        <CalendarIcon className="w-6 h-6 text-slate-600" />
        Linha do Tempo do Projeto
      </h3>
      <div className="relative pl-8">
        {/* The vertical line */}
        {sortedDays.length > 1 && <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-300 rounded" />}

        {sortedDays.length > 0 ? (
          <div className="space-y-8">
            {sortedDays.map((day, index) => (
              <div key={day} className="relative">
                {/* Dot on the line */}
                <div className="absolute -left-1.5 top-2.5 w-5 h-5 bg-white border-4 border-slate-300 rounded-full z-10"></div>
                
                <div className="ml-4">
                  <h4 className="font-bold text-slate-600">{formatDate(day)}</h4>
                  <div className="mt-2 space-y-3">
                    {groupedByDay[day].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(event => (
                      <div key={event.id} className="flex items-start gap-3 p-3 bg-white rounded-md border border-slate-200 shadow-sm">
                        <div className="flex-shrink-0 mt-0.5">
                            <EventIcon type={event.type} />
                        </div>
                        <p className="text-sm text-slate-700 break-words">{event.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
              <p className="text-slate-500">Nenhum evento registrado. Defina uma data de início, adicione visitas ou conclua itens para começar a linha do tempo.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Timeline;