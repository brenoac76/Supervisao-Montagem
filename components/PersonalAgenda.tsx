
import React, { useState, useMemo, useRef } from 'react';
import { AgendaItem, User, AgendaIssue, Media } from '../types';
import { PlusCircleIcon, TrashIcon, CheckCircleIcon, CalendarDaysIcon, BellIcon, RefreshIcon, XIcon, CameraIcon, CameraIcon as PhotoIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon } from './icons';
import { generateUUID } from '../App';
import { fetchWithRetry, SCRIPT_URL } from '../utils/api';
import Modal from './Modal';

interface PersonalAgendaProps {
  user: User;
  agenda: AgendaItem[];
  agendaIssues?: AgendaIssue[];
  onUpdateAgenda: (items: AgendaItem[]) => void;
  onUpdateAgendaIssues: (items: AgendaIssue[]) => void;
  viewMode?: 'REMINDERS' | 'LIST';
}

const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
       const reader = new FileReader();
       reader.readAsDataURL(file);
       reader.onload = () => resolve({ base64: reader.result as string, mimeType: file.type });
       reader.onerror = error => reject(error);
       return;
    }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target?.result as string; };
    reader.onerror = (err) => reject(err);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 1280;
      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
      resolve({ base64: compressedBase64, mimeType: 'image/jpeg' });
    };
    reader.readAsDataURL(file);
  });
};

const getDisplayableDriveUrl = (url: string): string => {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
  const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
  const match = url.match(driveRegex);
  if (match && match[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  return url;
};

// Helper para pegar data local sem erro de fuso
const getLocalYYYYMMDD = () => {
    const now = new Date();
    return now.toLocaleDateString('en-CA'); // Retorna YYYY-MM-DD local
};

const PersonalAgenda: React.FC<PersonalAgendaProps> = ({ user, agenda, agendaIssues = [], onUpdateAgenda, onUpdateAgendaIssues, viewMode = 'REMINDERS' }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [filter, setFilter] = useState<'PENDING' | 'DONE'>('PENDING');
  
  // Reminders Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Issues Form State
  const [issueClient, setIssueClient] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [issueDate, setIssueDate] = useState(getLocalYYYYMMDD());
  const [issueMedia, setIssueMedia] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Media Viewer State
  const [viewingMedia, setViewingMedia] = useState<{ list: Media[], index: number } | null>(null);

  const sortedReminders = useMemo(() => {
    return [...agenda]
      .filter(item => filter === 'PENDING' ? item.status === 'Pending' : item.status === 'Done')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [agenda, filter]);

  const sortedIssues = useMemo(() => {
    return [...agendaIssues]
      .filter(item => filter === 'PENDING' ? item.status === 'Pending' : item.status === 'Resolved')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [agendaIssues, filter]);

  const calculateDaysOpen = (createdAt: string) => {
    const start = new Date(createdAt);
    const now = new Date();
    const diff = Math.abs(now.getTime() - start.getTime());
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const calculateDaysFromDate = (dateStr: string) => {
      const start = new Date(dateStr + 'T12:00:00Z'); // Meio dia para evitar pulo de fuso
      const now = new Date();
      now.setHours(12, 0, 0, 0);
      const diff = now.getTime() - start.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      return days < 0 ? 0 : days;
  };

  const handleAddReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !dueDate) return;

    const newItem: AgendaItem = {
      id: generateUUID(),
      userId: user.id,
      title: title.trim(),
      description: description.trim(),
      createdAt: new Date().toISOString(),
      dueDate: new Date(dueDate).toISOString(),
      status: 'Pending',
      notified: false
    };

    onUpdateAgenda([newItem, ...agenda]);
    setTitle('');
    setDescription('');
    setDueDate('');
    setIsAdding(false);
  };

  const handleAddIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueClient || !issueDesc || !issueDate) return;

    const newIssue: AgendaIssue = {
      id: generateUUID(),
      userId: user.id,
      clientName: issueClient.trim(),
      description: issueDesc.trim(),
      date: issueDate,
      media: issueMedia,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };

    onUpdateAgendaIssues([newIssue, ...agendaIssues]);
    setIssueClient('');
    setIssueDesc('');
    setIssueDate(getLocalYYYYMMDD());
    setIssueMedia([]);
    setIsAdding(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const tempId = generateUUID();
    const localUrl = URL.createObjectURL(file);
    const tempMedia: Media = { id: tempId, type: 'image', url: localUrl, name: file.name };
    
    setIssueMedia(prev => [...prev, tempMedia]);

    try {
      const { base64: base64Data, mimeType } = await compressImage(file);
      const response = await fetchWithRetry(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'UPLOAD_FILE', data: { base64Data, fileName: file.name, mimeType: mimeType } }),
      });
      const result = await response.json();
      if (!result.success || !result.url) throw new Error(result.message || 'Falha no upload');
      
      setIssueMedia(prev => prev.map(m => m.id === tempId ? { ...m, url: result.url } : m));
    } catch (error: any) {
        alert(`Erro no upload: ${error.message}`);
        setIssueMedia(prev => prev.filter(m => m.id !== tempId));
    } finally {
        setUploading(false);
    }
  };

  const toggleStatus = (id: string) => {
    const updated = agenda.map(item => 
      item.id === id ? { ...item, status: (item.status === 'Pending' ? 'Done' : 'Pending') as 'Pending' | 'Done' } : item
    );
    onUpdateAgenda(updated);
  };

  const toggleIssueStatus = (id: string) => {
    const updated = agendaIssues.map(item => 
      item.id === id ? { ...item, status: (item.status === 'Pending' ? 'Resolved' : 'Pending') as 'Pending' | 'Resolved' } : item
    );
    onUpdateAgendaIssues(updated);
  };

  const deleteItem = (id: string) => {
    if (window.confirm("Deseja excluir permanentemente este lembrete da sua agenda?")) {
      onUpdateAgenda(agenda.filter(i => i.id !== id));
    }
  };

  const deleteIssue = (id: string) => {
    if (window.confirm("Excluir esta pendência?")) {
      onUpdateAgendaIssues(agendaIssues.filter(i => i.id !== id));
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn font-app max-w-5xl mx-auto font-normal">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-normal text-slate-800 uppercase tracking-tighter flex items-center gap-2">
            <BellIcon className="w-6 h-6 text-blue-600" /> Agenda de {user.username}
          </h2>
          <p className="text-[10px] font-normal text-slate-400 uppercase tracking-widest">{viewMode === 'LIST' ? 'Lista Técnica de Pendências' : 'Compromissos Pessoais e Futuros'}</p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setFilter('PENDING')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-normal uppercase tracking-widest transition-all ${filter === 'PENDING' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              Pendentes
            </button>
            <button 
              onClick={() => setFilter('DONE')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-normal uppercase tracking-widest transition-all ${filter === 'DONE' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'}`}
            >
              Histórico
            </button>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex-grow sm:flex-none bg-blue-600 text-white px-5 py-2 rounded-xl font-normal text-[11px] uppercase tracking-widest shadow-md hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <PlusCircleIcon className="w-4 h-4" /> Novo Registro
          </button>
        </div>
      </div>

      {/* Forms Section */}
      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border-2 border-blue-100 shadow-xl animate-fadeIn">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-normal text-slate-800 uppercase text-sm tracking-widest">
                {viewMode === 'LIST' ? 'Registrar Pendência na Lista' : 'Novo Registro na Sua Agenda'}
            </h3>
            <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><XIcon className="w-6 h-6"/></button>
          </div>
          
          {viewMode === 'LIST' ? (
              <form onSubmit={handleAddIssue} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-[10px] font-normal text-slate-500 uppercase mb-1.5 tracking-wider">Nome do Cliente</label>
                        <input required value={issueClient} onChange={e => setIssueClient(e.target.value)} className="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-normal text-sm bg-slate-50 focus:bg-white transition-all" placeholder="Ex: João da Silva..." />
                    </div>
                    <div>
                        <label className="block text-[10px] font-normal text-slate-500 uppercase mb-1.5 tracking-wider">Data da Pendência</label>
                        <input required type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-normal text-sm bg-slate-50 focus:bg-white transition-all" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-normal text-slate-500 uppercase mb-1.5 tracking-wider">O que é a pendência?</label>
                        <textarea required value={issueDesc} onChange={e => setIssueDesc(e.target.value)} className="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-normal text-sm h-24 resize-none bg-slate-50 focus:bg-white transition-all" placeholder="Descreva o que falta ou o problema..." />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-normal text-slate-500 uppercase mb-1.5 tracking-wider">Fotos da Pendência</label>
                        <div className="flex flex-wrap gap-2">
                            {issueMedia.map(m => (
                                <div key={m.id} className="relative w-20 h-20">
                                    <img src={getDisplayableDriveUrl(m.url)} className="w-full h-full object-cover rounded-lg border border-slate-200" />
                                    <button type="button" onClick={() => setIssueMedia(prev => prev.filter(x => x.id !== m.id))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">&times;</button>
                                </div>
                            ))}
                            <label className={`w-20 h-20 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors ${uploading ? 'opacity-50' : ''}`}>
                                <CameraIcon className="w-6 h-6 text-slate-400" />
                                <span className="text-[8px] font-normal text-slate-400 uppercase mt-1">Anexar</span>
                                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} disabled={uploading} />
                            </label>
                        </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-2 text-slate-400 font-normal text-[10px] uppercase tracking-widest">Cancelar</button>
                    <button type="submit" className="px-10 py-3 bg-blue-600 text-white rounded-xl font-normal text-[11px] uppercase tracking-widest shadow-lg hover:bg-blue-700">Salvar Pendência na Lista</button>
                  </div>
              </form>
          ) : (
              <form onSubmit={handleAddReminder} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-normal text-slate-500 uppercase mb-1.5 tracking-wider">O que você precisa lembrar?</label>
                    <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-normal text-sm bg-slate-50 focus:bg-white transition-all" placeholder="Título do compromisso..." />
                  </div>
                  <div>
                    <label className="block text-[10px] font-normal text-slate-500 uppercase mb-1.5 tracking-wider">Data e Hora do Lembrete</label>
                    <input required type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-normal text-sm bg-slate-50 focus:bg-white transition-all" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-normal text-slate-500 uppercase mb-1.5 tracking-wider">Descrição Detalhada (Opcional)</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-normal text-sm h-28 resize-none bg-slate-50 focus:bg-white transition-all" placeholder="Mais detalhes sobre esta tarefa..." />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-2 text-slate-400 font-normal text-[10px] uppercase tracking-widest">Cancelar</button>
                  <button type="submit" className="px-10 py-3 bg-blue-600 text-white rounded-xl font-normal text-[11px] uppercase tracking-widest shadow-lg hover:bg-blue-700">Salvar na Agenda</button>
                </div>
              </form>
          )}
        </div>
      )}

      {/* List Content */}
      <div className="space-y-4">
        {viewMode === 'LIST' ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left font-normal border-collapse">
                        <thead>
                            <tr className="bg-slate-900 text-white text-[10px] md:text-[10px] uppercase tracking-widest font-normal">
                                <th className="p-2 w-24">Data</th>
                                <th className="p-2 w-20 text-center">Dias</th>
                                <th className="p-2 w-40">Cliente</th>
                                <th className="p-2">Pendência</th>
                                <th className="p-2 w-16 text-center">Fotos</th>
                                <th className="p-2 w-24 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[14px] md:text-[10px]">
                            {sortedIssues.length === 0 ? (
                                <tr><td colSpan={6} className="p-20 text-center text-slate-400 italic">Nenhuma pendência na lista.</td></tr>
                            ) : (
                                sortedIssues.map(issue => {
                                    const daysOpen = calculateDaysFromDate(issue.date);
                                    return (
                                        <tr key={issue.id} className={`hover:bg-slate-50 transition-colors ${issue.status === 'Resolved' ? 'opacity-50 grayscale' : ''}`}>
                                            <td className="p-2 text-slate-500">{new Date(issue.date + 'T12:00:00Z').toLocaleDateString('pt-BR')}</td>
                                            <td className="p-2 text-center">
                                                <span className={`px-2 py-0.5 rounded-full font-bold ${daysOpen > 10 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                                                    {daysOpen}d
                                                </span>
                                            </td>
                                            <td className="p-2 font-normal text-slate-800 uppercase tracking-tight truncate max-w-[150px]">{issue.clientName}</td>
                                            <td className="p-2 text-slate-600 leading-tight">{issue.description}</td>
                                            <td className="p-2 text-center">
                                                {issue.media.length > 0 ? (
                                                    <button 
                                                        onClick={() => setViewingMedia({ list: issue.media, index: 0 })}
                                                        className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                                    >
                                                        <PhotoIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-300">---</span>
                                                )}
                                            </td>
                                            <td className="p-2 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => toggleIssueStatus(issue.id)} className={`p-1.5 rounded-full ${issue.status === 'Resolved' ? 'bg-green-100 text-green-600' : 'text-slate-300 hover:text-green-600'}`}>
                                                        <CheckCircleIcon className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => deleteIssue(issue.id)} className="p-1.5 text-slate-300 hover:text-red-500">
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        ) : (
            <div className="space-y-4">
                {sortedReminders.length === 0 ? (
                <div className="py-24 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
                    <CalendarDaysIcon className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                    <p className="text-slate-400 font-normal text-xs uppercase tracking-[0.2em]">Sua agenda pessoal está vazia</p>
                </div>
                ) : (
                sortedReminders.map(item => {
                    const daysOpen = calculateDaysOpen(item.createdAt);
                    const isLate = item.status === 'Pending' && new Date(item.dueDate) < new Date();
                    
                    return (
                    <div key={item.id} className={`group bg-white p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden ${isLate ? 'border-red-200 shadow-red-50' : 'border-slate-100'} ${item.status === 'Done' ? 'opacity-60 grayscale' : 'hover:shadow-md hover:border-blue-100'}`}>
                        {isLate && <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500 animate-pulse" />}
                        
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                        <div className="flex-grow min-w-0 font-normal">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className={`font-normal uppercase tracking-tight text-sm sm:text-base ${item.status === 'Done' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                {item.title}
                            </h3>
                            {isLate && <span className="bg-red-500 text-white text-[8px] font-normal px-2 py-0.5 rounded-full uppercase">Urgente</span>}
                            </div>
                            <p className="text-xs text-slate-500 font-normal leading-relaxed mb-4">{item.description}</p>
                            
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                            <div className="flex items-center gap-2 font-normal">
                                <CalendarDaysIcon className="w-4 h-4 text-blue-400" />
                                <span className="text-[10px] font-normal text-slate-400 uppercase tracking-wide">
                                Agendado: <span className="text-blue-600">{new Date(item.dueDate).toLocaleString('pt-BR')}</span>
                                </span>
                            </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                            <button 
                            onClick={() => toggleStatus(item.id)}
                            className={`p-3 rounded-full transition-all ${item.status === 'Done' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400 hover:text-green-600 hover:bg-green-50 shadow-sm'}`}
                            >
                            <CheckCircleIcon className="w-6 h-6" />
                            </button>
                            <button 
                            onClick={() => deleteItem(item.id)}
                            className="p-3 rounded-full bg-slate-50 text-slate-300 hover:text-red-600"
                            >
                            <TrashIcon className="w-6 h-6" />
                            </button>
                        </div>
                        </div>
                    </div>
                    );
                })
                )}
            </div>
        )}
      </div>

      {/* Media Viewer Modal */}
      {viewingMedia && (
          <Modal onClose={() => setViewingMedia(null)} fullScreen={true}>
              <div className="w-full h-full flex flex-col items-center justify-center relative touch-none bg-black/95">
                <div className="flex-grow w-full h-full flex items-center justify-center overflow-hidden">
                    <img 
                        src={getDisplayableDriveUrl(viewingMedia.list[viewingMedia.index].url)} 
                        className="max-h-full max-w-full object-contain"
                    />
                </div>
                {viewingMedia.list.length > 1 && (
                    <>
                        <button className="absolute left-4 top-1/2 -translate-y-1/2 p-4 bg-white/10 rounded-full text-white" onClick={() => setViewingMedia(prev => prev ? { ...prev, index: (prev.index - 1 + prev.list.length) % prev.list.length } : null)}><ChevronLeftIcon className="w-8 h-8"/></button>
                        <button className="absolute right-4 top-1/2 -translate-y-1/2 p-4 bg-white/10 rounded-full text-white" onClick={() => setViewingMedia(prev => prev ? { ...prev, index: (prev.index + 1) % prev.list.length } : null)}><ChevronRightIcon className="w-8 h-8"/></button>
                    </>
                )}
              </div>
          </Modal>
      )}
    </div>
  );
};

export default PersonalAgenda;
