
import React, { useState, useMemo, useEffect } from 'react';
import { Assembler, Client, ChecklistStatus, AssemblerScore } from '../types';
import TeamCalendar from './TeamCalendar';
import Modal from './Modal';
import { TeamViewType } from '../App';
import { 
    UserIcon, 
    PlusCircleIcon, 
    TrashIcon, 
    ChartBarIcon, 
    CalendarIcon, 
    ShieldCheckIcon, 
    ExclamationCircleIcon, 
    CheckCircleIcon, 
    CubeIcon, 
    UserGroupIcon, 
    PencilIcon, 
    PrinterIcon,
    HomeIcon,
    TagIcon,
    StarIcon
} from './icons';
import { generateUUID } from '../App';
import { jsPDF } from 'jspdf';
import { SCRIPT_URL, fetchWithRetry } from '../utils/api';

interface TeamManagementProps {
  assemblers: Assembler[];
  clients: Client[];
  onUpdateAssemblers: (assemblers: Assembler[]) => Promise<void> | void;
  onUpdateClient: (client: Client) => void;
  activeView: TeamViewType;
  onViewChange: (view: TeamViewType) => void;
}

// Helper Types
interface ActiveJobItem {
    id: string;
    description: string;
    progress: number;
    status: ChecklistStatus;
    completionDate?: string; 
}

interface ActiveJob {
    clientName: string;
    clientId: string;
    environmentName: string;
    environmentId: string;
    detail: string; 
    start: Date | null;
    end: Date | null;
    progress: number;
    isItemSpecific: boolean;
    assemblerId: string;
    mainAssemblerName?: string;
    helperName?: string;
    isAssistance: boolean;
    isActingAsHelper: boolean;
    items: ActiveJobItem[];
}

interface AssemblerStatus extends Assembler {
    activeJob: ActiveJob | null;
    scheduledJob: ActiveJob | null;
    unscheduledIssues: ActiveJob[];
    isFinishing: boolean;
    isHelperRole: boolean;
}

const CompletionThermometer: React.FC<{ progress: number, isFinishing: boolean, colorClass?: string }> = ({ progress, isFinishing, colorClass }) => {
    let color = colorClass || 'bg-blue-500';
    if (progress > 80 || isFinishing) color = 'bg-yellow-400';
    if (progress === 100) color = 'bg-green-500';

    return (
        <div className="w-full bg-slate-200 rounded-full h-3 mt-2 overflow-hidden relative">
            <div 
                className={`${color} h-full rounded-full transition-all duration-500 ${isFinishing ? 'animate-pulse' : ''}`} 
                style={{ width: `${Math.max(5, progress)}%` }}
            ></div>
        </div>
    );
};

const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const formatCurrencyParts = (value?: number) => {
    const formatted = new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value || 0);
    return {
        symbol: 'R$',
        value: formatted.replace('R$', '').trim()
    };
};

const TeamManagement: React.FC<TeamManagementProps> = ({ assemblers, clients, onUpdateAssemblers, onUpdateClient, activeView, onViewChange }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('Montador');

  const [validatingJob, setValidatingJob] = useState<ActiveJob | null>(null);
  const [newEndDate, setNewEndDate] = useState('');
  const [showValidationModal, setShowValidationModal] = useState(false);
  
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [selectedReportMonth, setSelectedReportMonth] = useState(new Date().getMonth());
  const [selectedReportYear, setSelectedReportYear] = useState(new Date().getFullYear());

  // Score State
  const [scores, setScores] = useState<AssemblerScore[]>([]);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
  const [selectedAssemblerId, setSelectedAssemblerId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [scoreDate, setScoreDate] = useState(new Date().toISOString().split('T')[0]);
  const [scoreReportStartDate, setScoreReportStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [scoreReportEndDate, setScoreReportEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
  
  const [ratings, setRatings] = useState({
      punctuality: 'Bom',
      organization: 'Bom',
      posture: 'Bom',
      finish: 'Bom',
      cleaning: 'Bom',
      uniform: 'Bom',
      observation: ''
  });

  useEffect(() => {
      if (activeView === 'EVALUATION') {
          fetchWithRetry(`${SCRIPT_URL}?action=GET_SCORES`)
              .then(res => res.json())
              .then(data => {
                  if (data.success && Array.isArray(data.data)) setScores(data.data);
              })
              .catch(console.error);
      }
  }, [activeView]);

  const handleGenerateScoreReport = () => {
      setIsGeneratingPdf(true);
      try {
          const pdf = new jsPDF('p', 'mm', 'a4'); // Portrait
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const margin = 10;
          let yPos = margin;

          const checkBreak = (h: number) => {
              if (yPos + h > pageHeight - margin) { pdf.addPage(); yPos = margin; return true; }
              return false;
          };

          // Filter scores
          const start = new Date(scoreReportStartDate);
          const end = new Date(scoreReportEndDate);
          end.setHours(23, 59, 59, 999);
          
          const filteredScores = scores.filter(s => {
              const d = new Date(s.date);
              // Fix timezone for comparison
              const offset = d.getTimezoneOffset() * 60000;
              const localDate = new Date(d.getTime() + offset);
              return localDate >= start && localDate <= end;
          }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          // Header
          pdf.setFillColor(30, 41, 59);
          pdf.rect(0, 0, pageWidth, 25, 'F');
          pdf.setTextColor(255);
          pdf.setFont('helvetica', 'bold').setFontSize(14);
          pdf.text("RELATÓRIO DE PONTUAÇÃO DE EQUIPE", margin, 10);
          pdf.setFontSize(9).setFont('helvetica', 'normal');
          pdf.text(`Período: ${new Date(scoreReportStartDate).toLocaleDateString('pt-BR')} a ${new Date(scoreReportEndDate).toLocaleDateString('pt-BR')}`, margin, 18);
          
          yPos = 35;

          // Table Header
          const cols = [
              { name: "DATA", w: 16, align: 'left' },
              { name: "MONTADOR", w: 26, align: 'left' },
              { name: "CLIENTE", w: 30, align: 'left' },
              { name: "PONTUALIDADE", w: 18, align: 'center' },
              { name: "ORGANIZAÇÃO", w: 18, align: 'center' },
              { name: "POSTURA", w: 18, align: 'center' },
              { name: "ACABAMENTO", w: 18, align: 'center' },
              { name: "LIMPEZA", w: 18, align: 'center' },
              { name: "UNIFORME", w: 18, align: 'center' },
              { name: "NOTA", w: 10, align: 'center' }
          ];

          pdf.setFillColor(241, 245, 249);
          pdf.rect(margin, yPos - 5, pageWidth - (2 * margin), 8, 'F');
          pdf.setTextColor(30, 41, 59);
          pdf.setFont('helvetica', 'bold').setFontSize(5.5);
          
          let xPos = margin + 1;
          cols.forEach(col => {
              if (col.align === 'center') {
                  const txtWidth = pdf.getTextWidth(col.name);
                  pdf.text(col.name, xPos + (col.w - txtWidth) / 2, yPos);
              } else {
                  pdf.text(col.name, xPos, yPos);
              }
              xPos += col.w;
          });
          
          yPos += 5;
          pdf.setDrawColor(200);
          pdf.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 5;

          // Rows
          filteredScores.forEach(score => {
              checkBreak(10);
              
              // Calculate values
              const values: Record<string, number> = { 'Excelente': 3, 'Bom': 2, 'Regular': 1 };
              const items = [score.punctuality, score.organization, score.posture, score.finish, score.cleaning, score.uniform];
              const total = items.reduce((acc, curr) => acc + (values[curr] || 0), 0);
              const percentage = Math.round((total / 18) * 100);

              // Fix date
              const d = new Date(score.date);
              const offset = d.getTimezoneOffset() * 60000;
              const localDate = new Date(d.getTime() + offset);

              pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(50);
              xPos = margin + 1;

              // Date
              pdf.text(localDate.toLocaleDateString('pt-BR'), xPos, yPos);
              xPos += cols[0].w;

              // Assembler
              pdf.setFont('helvetica', 'bold');
              pdf.text(score.assemblerName.substring(0, 18), xPos, yPos);
              pdf.setFont('helvetica', 'normal');
              xPos += cols[1].w;

              // Client
              pdf.text(score.clientName.substring(0, 22), xPos, yPos);
              xPos += cols[2].w;

              // Ratings
              const drawRating = (val: string, x: number, y: number) => {
                  let r=200, g=200, b=200; // default gray
                  if (val === 'Excelente') { r=220; g=252; b=231; } // green-100
                  else if (val === 'Bom') { r=255; g=237; b=213; } // orange-100
                  else if (val === 'Regular') { r=254; g=226; b=226; } // red-100
                  
                  // Center badge in column (width 18)
                  const badgeWidth = 15;
                  const badgeX = x + (18 - badgeWidth) / 2;

                  pdf.setFillColor(r, g, b);
                  pdf.roundedRect(badgeX, y - 3, badgeWidth, 4, 1, 1, 'F');
                  
                  let tr=30, tg=41, tb=59;
                  if (val === 'Excelente') { tr=21; tg=128; tb=61; } // green-700
                  else if (val === 'Bom') { tr=194; tg=65; tb=12; } // orange-700
                  else if (val === 'Regular') { tr=185; tg=28; tb=28; } // red-700
                  
                  pdf.setTextColor(tr, tg, tb);
                  pdf.setFontSize(5).setFont('helvetica', 'bold');
                  
                  const text = val.toUpperCase();
                  const textWidth = pdf.getTextWidth(text);
                  const textX = badgeX + (badgeWidth - textWidth) / 2;
                  
                  pdf.text(text, textX, y);
              };

              drawRating(score.punctuality, xPos, yPos); xPos += cols[3].w;
              drawRating(score.organization, xPos, yPos); xPos += cols[4].w;
              drawRating(score.posture, xPos, yPos); xPos += cols[5].w;
              drawRating(score.finish, xPos, yPos); xPos += cols[6].w;
              drawRating(score.cleaning, xPos, yPos); xPos += cols[7].w;
              drawRating(score.uniform, xPos, yPos); xPos += cols[8].w;

              // Score
              let sr=50, sg=50, sb=50;
              if (percentage === 100) { sr=22; sg=163; sb=74; }
              else if (percentage >= 70) { sr=37; sg=99; sb=235; }
              else if (percentage >= 50) { sr=249; sg=115; sb=22; }
              else { sr=220; sg=38; sb=38; }
              
              pdf.setTextColor(sr, sg, sb);
              pdf.setFontSize(8).setFont('helvetica', 'bold');
              
              const scoreText = `${percentage}%`;
              const scoreWidth = pdf.getTextWidth(scoreText);
              // Center in NOTA column (width 10)
              pdf.text(scoreText, xPos + (10 - scoreWidth) / 2, yPos);

              // Line
              yPos += 3;
              pdf.setDrawColor(240);
              pdf.line(margin, yPos, pageWidth - margin, yPos);
              yPos += 5;
          });

          pdf.save(`Pontuacao_Equipe_${scoreReportStartDate}_${scoreReportEndDate}.pdf`);

      } catch (e: any) {
          alert('Erro ao gerar PDF: ' + e.message);
      } finally {
          setIsGeneratingPdf(false);
      }
  };


  const handleEditScore = (score: AssemblerScore) => {
      setEditingScoreId(score.id);
      setSelectedAssemblerId(score.assemblerId);
      
      // Try to find client by name if ID not available or mismatch
      const client = clients.find(c => c.name === score.clientName);
      setSelectedClientId(client ? client.id : '');
      
      // Fix date for input (YYYY-MM-DD)
      // Assuming score.date is ISO string or YYYY-MM-DD
      const d = new Date(score.date);
      // Adjust for timezone offset to get correct local date string for input
      const offset = d.getTimezoneOffset();
      const localDate = new Date(d.getTime() - (offset*60*1000));
      setScoreDate(localDate.toISOString().split('T')[0]);

      setRatings({
          punctuality: score.punctuality,
          organization: score.organization,
          posture: score.posture,
          finish: score.finish,
          cleaning: score.cleaning,
          uniform: score.uniform,
          observation: score.observation || ''
      });
      setIsScoreModalOpen(true);
  };

  const handleSaveScore = async () => {
      if (!selectedAssemblerId || !selectedClientId) {
          alert("Selecione um montador e um cliente.");
          return;
      }
      
      const assembler = assemblers.find(a => a.id === selectedAssemblerId);
      const client = clients.find(c => c.id === selectedClientId);
      
      const scoreData: AssemblerScore = {
          id: editingScoreId || generateUUID(),
          assemblerId: selectedAssemblerId,
          assemblerName: assembler?.name || '',
          clientName: client?.name || '',
          date: scoreDate,
          punctuality: ratings.punctuality as any,
          organization: ratings.organization as any,
          posture: ratings.posture as any,
          finish: ratings.finish as any,
          cleaning: ratings.cleaning as any,
          uniform: ratings.uniform as any,
          observation: ratings.observation
      };
      
      let updatedScores;
      if (editingScoreId) {
          updatedScores = scores.map(s => s.id === editingScoreId ? scoreData : s);
      } else {
          updatedScores = [scoreData, ...scores];
      }

      setScores(updatedScores);
      setIsScoreModalOpen(false);
      setEditingScoreId(null);
      
      // Reset form
      setRatings({
          punctuality: 'Bom',
          organization: 'Bom',
          posture: 'Bom',
          finish: 'Bom',
          cleaning: 'Bom',
          uniform: 'Bom',
          observation: ''
      });
      setScoreDate(new Date().toISOString().split('T')[0]);
      setSelectedAssemblerId('');
      setSelectedClientId('');

      try {
          await fetchWithRetry(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'SAVE_SCORES', data: updatedScores })
          });
      } catch (e) {
          console.error(e);
          alert('Erro ao salvar pontuação');
      }
  };

  const handleDeleteScore = async (id: string) => {
      if (!window.confirm("Deseja realmente excluir esta avaliação?")) return;
      
      const updatedScores = scores.filter(s => s.id !== id);
      setScores(updatedScores);
      
      try {
          await fetchWithRetry(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'SAVE_SCORES', data: updatedScores })
          });
      } catch (e) {
          console.error(e);
          alert('Erro ao excluir pontuação');
      }
  };

  const allAssemblerStatuses = useMemo<AssemblerStatus[]>(() => {
      const now = new Date();
      return (assemblers || []).map(assembler => {
          let activeJob: ActiveJob | null = null;
          let scheduledJob: ActiveJob | null = null;
          const unscheduledIssues: ActiveJob[] = [];
          const isHelperRole = assembler.role.toLowerCase().includes('ajudante') || assembler.role.toLowerCase().includes('auxiliar');

          for (const client of (clients || [])) {
              for (const env of (client.environments || [])) {
                  if (env.completionDate || env.manualProgress === 100) continue;
                  
                  const isMainAssembler = env.assemblerId === assembler.id;
                  const isSecondAssembler = env.assembler2Id === assembler.id;
                  const isHelper = env.helperId === assembler.id;
                  
                  if (!isMainAssembler && !isSecondAssembler && !isHelper) continue;
                  
                  const progress = env.manualProgress || 0;
                  const jobStart = env.scheduledStart ? new Date(env.scheduledStart) : null;
                  const jobEnd = env.scheduledEnd ? new Date(env.scheduledEnd) : jobStart;

                  const jobData: ActiveJob = {
                      clientName: client.name,
                      clientId: client.id,
                      environmentName: env.name,
                      environmentId: env.id,
                      detail: env.isAssistance ? 'Assistência Técnica' : 'Montagem de Ambiente',
                      start: jobStart,
                      end: jobEnd,
                      progress: progress,
                      isItemSpecific: false,
                      assemblerId: assembler.id,
                      isAssistance: !!env.isAssistance,
                      isActingAsHelper: isHelper,
                      items: (env.checklist || []).map(i => ({ id: i.id, description: i.description, progress: i.progress || 0, status: i.status }))
                  };

                  if (jobStart && jobEnd) {
                      const startDate = new Date(jobStart);
                      startDate.setHours(0, 0, 0, 0);
                      const endDate = new Date(jobEnd);
                      endDate.setHours(23, 59, 59, 999);

                      if (now >= startDate && now <= endDate) {
                          if (!activeJob) activeJob = jobData;
                      } else if (now < startDate) {
                          if (!scheduledJob) scheduledJob = jobData;
                      } else if (now > endDate && progress < 100) {
                          unscheduledIssues.push(jobData);
                      }
                  } else if (progress < 100) {
                      unscheduledIssues.push(jobData);
                  }
              }
          }
          const isFinishing = activeJob ? (activeJob.progress > 85 || (activeJob.end && (activeJob.end.getTime() - now.getTime()) < 24 * 60 * 60 * 1000)) : false;
          return { ...assembler, activeJob, scheduledJob, unscheduledIssues, isFinishing, isHelperRole } as AssemblerStatus;
      });
  }, [assemblers, clients]);

  const productionData = useMemo(() => {
      const data: any[] = [];
      const reportMonthStart = new Date(selectedReportYear, selectedReportMonth, 1);
      const reportMonthEnd = new Date(selectedReportYear, selectedReportMonth + 1, 0, 23, 59, 59);

      const fmt = (dStr?: string) => {
          if(!dStr) return '';
          const d = new Date(dStr);
          return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      };

      assemblers.forEach(assembler => {
          const r = (assembler.role || '').toLowerCase();
          if (r.includes('ajudante') || r.includes('auxiliar')) return;

          const works: any[] = [];
          let assemblerTotalProduced = 0;

          clients.forEach(client => {
              client.environments.forEach(env => {
                  const isMain = env.assemblerId === assembler.id;
                  const isSecond = env.assembler2Id === assembler.id;
                  const isHelper = env.helperId === assembler.id;
                  if (!isMain && !isSecond && !isHelper) return;
                  
                  const start = env.scheduledStart ? new Date(env.scheduledStart) : null;
                  const end = env.scheduledEnd ? new Date(env.scheduledEnd) : start;
                  const completion = env.completionDate ? new Date(env.completionDate) : null;
                  
                  const startedBeforeSelectedMonth = start && start < reportMonthStart;

                  let isPartialMonth = false;
                  let isBalanceMonth = false;

                  if (env.limitMonth) {
                      const [lY, lM] = env.limitMonth.split('-').map(Number);
                      const limitDate = new Date(lY, lM - 1, 1);
                      if (selectedReportYear === lY && selectedReportMonth === (lM - 1)) isPartialMonth = true;
                      const balanceDate = new Date(lY, lM, 1);
                      if (selectedReportYear === balanceDate.getFullYear() && selectedReportMonth === balanceDate.getMonth()) isBalanceMonth = true;
                  }

                  const isCompletionMonth = completion && 
                                           completion.getMonth() === selectedReportMonth && 
                                           completion.getFullYear() === selectedReportYear;

                  const isActiveInMonth = (start && start <= reportMonthEnd && (!end || end >= reportMonthStart));
                  
                  if (isActiveInMonth || isCompletionMonth || isPartialMonth || isBalanceMonth) {
                      const envTotalProgress = env.manualProgress || 0;
                      const paidBefore = env.paidPercentage || 0;
                      const paymentLimit = env.paymentLimit || 0;
                      
                      let currentMonthPercentageTotal = 0;
                      let infoText = "";

                      if (isPartialMonth) {
                          currentMonthPercentageTotal = paymentLimit;
                          infoText = "ADIANTAMENTO LANÇADO";
                      } else if (isBalanceMonth) {
                          currentMonthPercentageTotal = Math.max(0, 100 - paymentLimit);
                          infoText = "SALDO AUTOMÁTICO";
                      } else {
                          let totalDeductions = paidBefore;
                          if (env.limitMonth) {
                               const [lY, lM] = env.limitMonth.split('-').map(Number);
                               if (selectedReportYear > lY || (selectedReportYear === lY && selectedReportMonth > (lM - 1))) totalDeductions += paymentLimit;
                          }
                          if (isCompletionMonth) {
                              currentMonthPercentageTotal = Math.max(0, 100 - totalDeductions);
                              infoText = totalDeductions > 0 ? `SALDO (DED. ${totalDeductions}%)` : "100% NO MÊS";
                          } else if (isActiveInMonth) {
                              currentMonthPercentageTotal = Math.max(0, envTotalProgress - totalDeductions);
                              if (totalDeductions > 0 && currentMonthPercentageTotal > 0) infoText = `PROG. (DED. ${totalDeductions}%)`;
                          }
                      }

                      if (currentMonthPercentageTotal <= 0) return;

                      let mySplit = 100;
                      if (env.assemblerId && env.assembler2Id) {
                          if (isMain) mySplit = env.assembler1Percentage ?? 50;
                          else if (isSecond) mySplit = env.assembler2Percentage ?? 50;
                      }
                      
                      const totalValue = (env.portalValue || 0) * 2.3;
                      const valueProduced = isHelper ? 0 : (totalValue * (currentMonthPercentageTotal / 100)) * (mySplit / 100);
                      assemblerTotalProduced += valueProduced;

                      let periodStr = "---";
                      if (start) {
                          periodStr = fmt(env.scheduledStart);
                          if (end && env.scheduledEnd !== env.scheduledStart) periodStr += ` a ${fmt(env.scheduledEnd)}`;
                      }
                      
                      works.push({
                          clientName: client.name,
                          envName: env.name,
                          purchaseOrder: env.purchaseOrder || '',
                          period: periodStr,
                          percentage: currentMonthPercentageTotal,
                          info: infoText,
                          valueProduced: valueProduced,
                          isHelper,
                          isExtended: startedBeforeSelectedMonth, 
                          completionDate: env.completionDate ? fmt(env.completionDate) : null,
                          mySplit: (env.assemblerId && env.assembler2Id && !isHelper) ? mySplit : null
                      });
                  }
              });
          });
          if (works.length > 0) {
              works.sort((a, b) => {
                  if (a.clientName === b.clientName) return a.envName.localeCompare(b.envName);
                  return a.clientName.localeCompare(b.clientName);
              });
              data.push({ assembler, works, assemblerTotalProduced });
          }
      });
      return data.sort((a, b) => a.assembler.name.localeCompare(b.assembler.name));
  }, [assemblers, clients, selectedReportMonth, selectedReportYear]);

  const grandTotalProduced = useMemo(() => {
      return productionData.reduce((acc, entry) => acc + entry.assemblerTotalProduced, 0);
  }, [productionData]);

  const totalTeamCount = allAssemblerStatuses.length;
  const activeTeamCount = allAssemblerStatuses.filter(a => a.activeJob).length;
  const availableTeamCount = Math.max(0, totalTeamCount - activeTeamCount);
  const freeMembers = allAssemblerStatuses.filter(a => !a.activeJob);
  const finishingMembers = allAssemblerStatuses.filter(a => a.activeJob && a.isFinishing);
  const busyMembers = allAssemblerStatuses.filter(a => a.activeJob && !a.isFinishing);

  const groupedMembers = useMemo<Record<string, Assembler[]>>(() => {
      const groups = { 'Montadores': [] as Assembler[], 'Ajudantes': [] as Assembler[], 'Assistência Técnica': [] as Assembler[], 'Outros': [] as Assembler[] };
      const sorted = [...(assemblers || [])].sort((a, b) => a.name.localeCompare(b.name));
      sorted.forEach(a => {
          const r = a.role.toLowerCase();
          if (r.includes('ajudante') || r.includes('auxiliar')) groups['Ajudantes'].push(a);
          else if (r.includes('técnico') || r.includes('tecnico') || r.includes('assistência')) groups['Assistência Técnica'].push(a);
          else if (r.includes('montador') || r.includes('líder') || r.includes('marceneiro')) groups['Montadores'].push(a);
          else groups['Outros'].push(a);
      });
      return groups;
  }, [assemblers]);

  const openAddModal = () => { setEditingId(null); setName(''); setRole('Montador'); setIsModalOpen(true); };
  const openEditModal = (assembler: Assembler) => { setEditingId(assembler.id); setName(assembler.name); setRole(assembler.role); setIsModalOpen(true); };

  const handleSaveAssembler = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingId) {
      const updatedList = assemblers.map(a => a.id === editingId ? { ...a, name, role } : a);
      onUpdateAssemblers(updatedList);
    } else {
      const newAssembler: Assembler = { id: generateUUID(), name, role: role || 'Montador' };
      onUpdateAssemblers([...assemblers, newAssembler]);
    }
    setIsModalOpen(false);
  };

  const handleDeleteAssembler = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este membro da equipe?')) {
      onUpdateAssemblers(assemblers.filter(a => a.id !== id));
    }
  };

  const handleGenerateReport = async () => {
      setIsGeneratingPdf(true);
      try {
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const margin = 15;
          let yPos = margin;
          const reportMonthStart = new Date(selectedReportYear, selectedReportMonth, 1);
          const reportMonthEnd = new Date(selectedReportYear, selectedReportMonth + 1, 0, 23, 59, 59);
          const fmtDate = (d?: Date | string | null) => {
              if (!d) return '--/--';
              const date = new Date(d);
              return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`;
          };
          const checkBreak = (h: number) => {
              if (yPos + h > pageHeight - margin) { pdf.addPage(); yPos = margin; return true; }
              return false;
          };
          pdf.setFillColor(30, 41, 59);
          pdf.rect(0, 0, pageWidth, 40, 'F');
          pdf.setTextColor(255);
          pdf.setFont('helvetica', 'bold').setFontSize(22);
          pdf.text("TRACKER", margin, 18);
          pdf.setFont('helvetica', 'normal').setFontSize(10);
          pdf.text("CONSOLIDADO MENSAL DE PRODUTIVIDADE", margin, 26);
          pdf.setFontSize(12);
          pdf.text(`${MONTH_NAMES[selectedReportMonth].toUpperCase()} / ${selectedReportYear}`, pageWidth - margin, 26, { align: 'right' });
          yPos = 50;
          let totalMonthTasks = 0;
          let completedMonthTasks = 0;
          const reportData: any[] = [];
          assemblers.forEach(assembler => {
              const r = (assembler.role || '').toLowerCase();
              if (r.includes('ajudante') || r.includes('auxiliar')) return;

              const tasks: any[] = [];
              clients.forEach(c => {
                  c.environments.forEach(env => {
                      const isMain = env.assemblerId === assembler.id;
                      const isSecond = env.assembler2Id === assembler.id;
                      const isHelper = env.helperId === assembler.id;
                      if (!isMain && !isSecond && !isHelper) return;
                      const start = env.scheduledStart ? new Date(env.scheduledStart) : null;
                      const end = env.scheduledEnd ? new Date(env.scheduledEnd) : start;
                      if (start && start <= reportMonthEnd && (!end || end >= reportMonthStart)) {
                          const progress = env.manualProgress || 0;
                          const isDone = !!env.completionDate || progress === 100;
                          totalMonthTasks++;
                          if (isDone) completedMonthTasks++;
                          tasks.push({ client: c.name, env: env.name, start, end, progress, isDone, isHelper });
                      }
                  });
              });
              if (tasks.length > 0) reportData.push({ assembler, tasks });
          });
          pdf.setFillColor(248, 250, 252);
          pdf.roundedRect(margin, yPos, pageWidth - (margin * 2), 25, 3, 3, 'F');
          pdf.setTextColor(30, 41, 59);
          pdf.setFontSize(8).setFont('helvetica', 'bold');
          pdf.text("RESUMO OPERACIONAL", margin + 5, yPos + 7);
          pdf.setFontSize(16);
          pdf.text(String(totalMonthTasks), margin + 15, yPos + 18);
          pdf.setFontSize(7).setFont('helvetica', 'normal').text("ATIVIDADES", margin + 15, yPos + 22);
          pdf.setFontSize(16).setTextColor(22, 163, 74);
          pdf.text(String(completedMonthTasks), margin + 55, yPos + 18);
          pdf.setFontSize(7).setTextColor(100).text("CONCLUÍDAS", margin + 55, yPos + 22);
          pdf.setFontSize(16).setTextColor(37, 99, 235);
          const perc = totalMonthTasks > 0 ? Math.round((completedMonthTasks/totalMonthTasks)*100) : 0;
          pdf.text(`${perc}%`, margin + 95, yPos + 18);
          pdf.setFontSize(7).setTextColor(100).text("EFICIÊNCIA", margin + 95, yPos + 22);
          yPos += 40;
          reportData.sort((a,b) => a.assembler.name.localeCompare(b.assembler.name)).forEach(entry => {
              checkBreak(20);
              pdf.setFillColor(241, 245, 249);
              pdf.rect(margin, yPos, pageWidth - (margin * 2), 8, 'F');
              pdf.setTextColor(30, 41, 59);
              pdf.setFont('helvetica', 'bold').setFontSize(10);
              pdf.text(entry.assembler.name.toUpperCase(), margin + 3, yPos + 5.5);
              pdf.setFontSize(7).setFont('helvetica', 'normal').setTextColor(100);
              pdf.text(entry.assembler.role, pageWidth - margin - 3, yPos + 5.5, { align: 'right' });
              yPos += 12;
              pdf.setFont('helvetica', 'bold').setFontSize(7).setTextColor(150);
              pdf.text("CLIENTE / AMBIENTE", margin + 3, yPos);
              pdf.text("PERÍODO", margin + 90, yPos);
              pdf.text("PROG.", margin + 120, yPos);
              pdf.text("STATUS", pageWidth - margin - 20, yPos);
              yPos += 3;
              pdf.setDrawColor(230).setLineWidth(0.1).line(margin, yPos, pageWidth - margin, yPos);
              yPos += 6;
              entry.tasks.forEach((t: any) => {
                  checkBreak(10);
                  pdf.setTextColor(50);
                  pdf.setFont('helvetica', 'bold').setFontSize(8);
                  pdf.text(t.client.toUpperCase(), margin + 3, yPos);
                  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(100);
                  pdf.text(t.env, margin + 3, yPos + 4);
                  pdf.text(`${fmtDate(t.start)} - ${fmtDate(t.end)}`, margin + 90, yPos + 2);
                  pdf.setFillColor(230);
                  pdf.rect(margin + 120, yPos + 0.5, 30, 2, 'F');
                  pdf.setFillColor(t.isDone ? 34 : 37, t.isDone ? 197 : 99, t.isDone ? 94 : 235);
                  pdf.rect(margin + 120, yPos + 0.5, (t.progress/100)*30, 2, 'F');
                  if (t.isDone) {
                      pdf.setTextColor(21, 128, 61).setFont('helvetica', 'bold').text("CONCLUÍDO", pageWidth - margin - 20, yPos + 2);
                  } else {
                      const isDelayed = t.end && t.end < new Date();
                      pdf.setTextColor(isDelayed ? 220 : 100, isDelayed ? 38 : 100, isDelayed ? 38 : 100);
                      pdf.text(isDelayed ? "ATRASADO" : "ATIVO", pageWidth - margin - 20, yPos + 2);
                  }
                  yPos += 10;
              });
              yPos += 5;
          });
          pdf.setFontSize(7).setTextColor(180);
          pdf.text(`Tracker System - Relatório gerado em ${new Date().toLocaleString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
          pdf.save(`Produtividade_${MONTH_NAMES[selectedReportMonth]}_${selectedReportYear}.pdf`);
      } catch (e: any) { alert(`Erro ao gerar PDF: ${e.message}`); } finally { setIsGeneratingPdf(false); }
  };

  const handleGenerateProductionReport = async () => {
      setIsGeneratingPdf(true);
      try {
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const margin = 10;
          let yPos = margin;
          const checkBreak = (h: number) => {
              if (yPos + h > pageHeight - margin) { pdf.addPage(); yPos = margin; return true; }
              return false;
          };
          pdf.setFillColor(37, 99, 235);
          pdf.rect(0, 0, pageWidth, 30, 'F');
          pdf.setTextColor(255);
          pdf.setFont('helvetica', 'bold').setFontSize(16);
          pdf.text("RELATÓRIO DE PRODUÇÃO", margin, 15);
          pdf.setFont('helvetica', 'normal').setFontSize(9);
          pdf.text("DETALHAMENTO POR AMBIENTE E ORDEM DE COMPRA", margin, 22);
          pdf.setFontSize(11);
          pdf.text(`${MONTH_NAMES[selectedReportMonth].toUpperCase()} / ${selectedReportYear}`, pageWidth - margin, 18, { align: 'right' });
          yPos = 38;
          productionData.forEach(entry => {
              checkBreak(25);
              pdf.setFillColor(241, 245, 249);
              pdf.rect(margin, yPos, pageWidth - (2 * margin), 9, 'F');
              pdf.setTextColor(30, 41, 59);
              pdf.setFont('helvetica', 'bold').setFontSize(10);
              pdf.text(entry.assembler.name.toUpperCase(), margin + 3, yPos + 6);
              const subtotalFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(entry.assemblerTotalProduced);
              pdf.setFontSize(7).setFont('helvetica', 'normal').setTextColor(100);
              pdf.text(`${entry.assembler.role} | Subtotal: ${subtotalFormatted}`, pageWidth - margin - 3, yPos + 6, { align: 'right' });
              yPos += 11;
              pdf.setFillColor(226, 232, 240);
              pdf.rect(margin, yPos, pageWidth - (2 * margin), 6, 'F');
              pdf.setTextColor(71, 85, 105);
              pdf.setFont('helvetica', 'bold').setFontSize(7);
              const c1 = margin + 2; const c2 = margin + 40; const c3 = margin + 80; const c4 = margin + 110; const c5 = margin + 142; const c6 = pageWidth - margin - 2;
              pdf.text("CLIENTE", c1, yPos + 4); pdf.text("AMBIENTE", c2, yPos + 4); pdf.text("O.C.", c3, yPos + 4); pdf.text("PERÍODO", c4, yPos + 4); pdf.text("PROG. MÊS", c5, yPos + 4); pdf.text("VALOR", c6, yPos + 4, { align: 'right' });
              yPos += 8;
              entry.works.forEach((w: any) => {
                  checkBreak(10);
                  pdf.setTextColor(50); pdf.setFont('helvetica', 'normal').setFontSize(7);
                  pdf.text(w.clientName.toUpperCase(), c1, yPos, { maxWidth: c2 - c1 - 2 });
                  pdf.text(w.envName, c2, yPos, { maxWidth: c3 - c2 - 2 });
                  pdf.text(w.purchaseOrder || "---", c3, yPos, { maxWidth: c4 - c3 - 2 });
                  pdf.text(w.period, c4, yPos, { maxWidth: c5 - c4 - 2 });
                  let percText = `${w.percentage}%`;
                  if (w.mySplit && w.mySplit < 100) percText += ` [S:${w.mySplit}%]`;
                  if (w.info) { percText += ` (${w.info})`; pdf.setFontSize(6); }
                  pdf.text(percText, c5, yPos, { maxWidth: c6 - c5 - 15 });
                  pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
                  const valueFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(w.valueProduced);
                  pdf.text(valueFormatted, c6, yPos, { align: 'right' });
                  pdf.setDrawColor(226, 232, 240).line(margin, yPos + 2, pageWidth - margin, yPos + 2);
                  yPos += 6;
              });
              yPos += 6;
          });
          checkBreak(20);
          pdf.setFillColor(30, 41, 59);
          pdf.rect(margin, yPos, pageWidth - (2 * margin), 10, 'F');
          pdf.setTextColor(255);
          pdf.setFont('helvetica', 'bold').setFontSize(10);
          pdf.text("TOTAL GERAL PRODUZIDO:", margin + 5, yPos + 6.5);
          const grandTotalFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(grandTotalProduced);
          pdf.text(grandTotalFormatted, pageWidth - margin - 5, yPos + 6.5, { align: 'right' });
          pdf.setFontSize(7).setTextColor(150).setFont('helvetica', 'normal');
          pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, pageHeight - 8);
          pdf.save(`Producao_Detalhada_${MONTH_NAMES[selectedReportMonth]}_${selectedReportYear}.pdf`);
      } catch (e: any) { alert("Erro ao gerar PDF: " + e.message); } finally { setIsGeneratingPdf(false); }
  };

  const confirmCompletion = () => {
      if (!validatingJob) return;
      const client = clients.find(c => c.id === validatingJob.clientId);
      if (client) {
          const updatedEnvironments = (client.environments || []).map(env => {
              if (env.id === validatingJob.environmentId) {
                  const updatedChecklist = (env.checklist || []).map(item => ({ ...item, status: ChecklistStatus.Completed, progress: 100, completionDate: new Date().toISOString() }));
                  return { ...env, checklist: updatedChecklist, manualProgress: 100, completionDate: new Date().toISOString() };
              }
              return env;
          });
          onUpdateClient({ ...client, environments: updatedEnvironments });
      }
      setShowValidationModal(false);
  };

  const rescheduleJob = () => {
      if (!validatingJob || !newEndDate) return;
      const client = clients.find(c => c.id === validatingJob.clientId);
      if (client) {
          const [y, m, d] = newEndDate.split('-').map(Number);
          const newEndISO = new Date(y, m - 1, d, 18, 0, 0).toISOString();
          const updatedEnvironments = (client.environments || []).map(env => {
              if (env.id === validatingJob.environmentId) return { ...env, scheduledEnd: newEndISO };
              return env;
          });
          onUpdateClient({ ...client, environments: updatedEnvironments });
      }
      setShowValidationModal(false);
  }

  const formatTime = (date: Date | null) => date ? date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--';
  const formatDate = (date: Date | null) => date ? date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}) : '--/--';

  return (
    <div className="space-y-6 pb-20">
       <div className="md:hidden flex flex-col sm:flex-row gap-2 items-center bg-white rounded-lg p-2 border border-slate-200 shadow-sm">
           <div className="flex w-full overflow-x-auto gap-1">
               <button onClick={() => onViewChange('STATUS')} className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold whitespace-nowrap ${activeView === 'STATUS' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}><ChartBarIcon className="w-4 h-4 inline-block mr-2" /> Status</button>
               <button onClick={() => onViewChange('CALENDAR')} className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold whitespace-nowrap ${activeView === 'CALENDAR' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}><CalendarIcon className="w-4 h-4 inline-block mr-2" /> Agenda</button>
               <button onClick={() => onViewChange('MEMBERS')} className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold whitespace-nowrap ${activeView === 'MEMBERS' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}><UserIcon className="w-4 h-4 inline-block mr-2" /> Membros</button>
               <button onClick={() => onViewChange('PRODUCTION')} className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold whitespace-nowrap ${activeView === 'PRODUCTION' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}><ChartBarIcon className="w-4 h-4 inline-block mr-2" /> Produção</button>
               <button onClick={() => onViewChange('REPORT')} className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold whitespace-nowrap ${activeView === 'REPORT' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}><PrinterIcon className="w-4 h-4 inline-block mr-2" /> PDF</button>
           </div>
       </div>

       {activeView === 'STATUS' && (
           <div className="space-y-8 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                    <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500 flex items-center justify-between">
                        <div><p className="text-slate-500 text-xs font-bold uppercase">Total Equipe</p><p className="text-2xl font-bold text-slate-800">{totalTeamCount}</p></div>
                        <div className="bg-blue-100 p-2 rounded-full"><UserGroupIcon className="text-blue-600 w-6 h-6"/></div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-orange-500 flex items-center justify-between">
                        <div><p className="text-slate-500 text-xs font-bold uppercase">Em Atividade</p><p className="text-2xl font-bold text-slate-800">{activeTeamCount}</p></div>
                        <div className="bg-orange-100 p-2 rounded-full"><CubeIcon className="text-orange-600 w-6 h-6"/></div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500 flex items-center justify-between">
                        <div><p className="text-slate-500 text-xs font-bold uppercase">Disponíveis</p><p className="text-2xl font-bold text-slate-800">{availableTeamCount}</p></div>
                        <div className="bg-green-100 p-2 rounded-full"><CheckCircleIcon className="text-green-600 w-6 h-6"/></div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-md border border-slate-200 p-5">
                    <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2"><CubeIcon className="w-5 h-5 text-slate-500"/>Mapa de Capacidade</h3>
                    <div className="space-y-6">
                        {freeMembers.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-green-700 uppercase mb-2 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Disponíveis Agora</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {freeMembers.map(a => (
                                        <div key={a.id} className={`bg-green-50 border border-green-200 rounded p-2 flex flex-col gap-2 relative ${!a.isHelperRole && a.unscheduledIssues.length > 0 ? 'border-l-4 border-l-red-400' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-full ${a.isHelperRole ? 'bg-indigo-500' : 'bg-green-500'} text-white flex items-center justify-center text-xs font-bold shadow-sm`}>{a.name.charAt(0).toUpperCase()}</div>
                                                <span className="text-sm font-semibold text-slate-700 truncate">{a.name.split(' ')[0]}</span>
                                            </div>
                                            {!a.isHelperRole && a.unscheduledIssues.length > 0 && <span className="text-[9px] text-red-600 font-bold bg-red-50 px-1 rounded border border-red-100 text-center">{a.unscheduledIssues.length} Pendências Ativas</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {finishingMembers.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-yellow-700 uppercase mb-2 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span> Terminando em Breve</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {finishingMembers.map(a => (
                                        <div key={a.id} className="bg-yellow-50 border border-yellow-200 rounded p-3 relative flex flex-col">
                                            <div className="flex justify-between items-start mb-2"><div><div className="font-bold text-slate-800">{a.name}</div></div><span className="text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">{a.activeJob?.end ? `Fim: ${formatDate(a.activeJob.end)}` : '> 85%'}</span></div>
                                            <div className="text-xs text-slate-600 truncate mb-1">{a.activeJob?.clientName} - {a.activeJob?.detail}</div>
                                            <CompletionThermometer progress={a.activeJob?.progress || 0} isFinishing={true} colorClass={a.isHelperRole ? 'bg-indigo-400' : 'bg-blue-500'} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {busyMembers.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-blue-700 uppercase mb-2 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Em Andamento</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {busyMembers.map(a => (
                                        <div key={a.id} className="bg-slate-50 border border-slate-200 rounded p-3">
                                            <div className="flex justify-between items-start mb-2"><div><div className="font-bold text-slate-700">{a.name}</div></div><span className="text-xs text-slate-500">{a.activeJob?.end ? `Prev: ${formatDate(a.activeJob.end)}` : 'Em andamento'}</span></div>
                                            <div className="text-xs text-slate-500 truncate mb-1">{a.activeJob?.clientName}</div>
                                            <CompletionThermometer progress={a.activeJob?.progress || 0} isFinishing={false} colorClass={a.isHelperRole ? 'bg-indigo-500' : 'bg-blue-600'} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <h3 className="text-xl font-bold text-slate-700 mb-4">Detalhamento da Equipe</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {allAssemblerStatuses.map((assembler) => {
                            const active = assembler.activeJob;
                            const scheduled = assembler.scheduledJob;
                            const isHelper = assembler.isHelperRole;
                            
                            let cardColor = isHelper ? 'indigo' : 'green';
                            let statusLabel = 'DISPONÍVEL';
                            let displayJob = null;

                            if (active) {
                                cardColor = isHelper ? 'purple' : 'orange';
                                statusLabel = isHelper ? 'AUXILIANDO' : 'OCUPADO';
                                displayJob = active;
                            } else if (scheduled) {
                                cardColor = 'blue';
                                statusLabel = 'AGENDADO';
                                displayJob = scheduled;
                            }

                            const cardBorder = `border-${cardColor}-200`;
                            const headerBg = `bg-gradient-to-r from-${cardColor}-50 to-white`;
                            const avatarBg = `bg-${cardColor}-500`;

                            return (
                                <div key={assembler.id} className={`bg-white rounded-xl shadow-md border overflow-hidden flex flex-col ${cardBorder}`}>
                                    <div className={`p-4 flex items-center gap-3 ${headerBg}`}>
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${avatarBg}`}>
                                            {assembler.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-bold text-slate-800 truncate">{assembler.name}</h4>
                                            <p className="text-xs text-slate-500 truncate uppercase tracking-tighter font-semibold">{assembler.role}</p>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => openEditModal(assembler)} className="text-slate-400 hover:text-blue-600 p-1">
                                                <PencilIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-4 flex-grow flex flex-col justify-center">
                                        {displayJob ? (
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2 text-sm flex-wrap">
                                                    <span className={`bg-${cardColor}-100 text-${cardColor}-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide`}>
                                                        {statusLabel}
                                                    </span>
                                                    {displayJob.isAssistance && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border border-purple-200 flex items-center gap-1"><ShieldCheckIcon className="w-3 h-3"/> ASSISTÊNCIA</span>}
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-400 uppercase font-bold mb-1">{isHelper && active ? 'Ajudando em' : 'Obra'}</p>
                                                    <p className="text-sm font-semibold text-slate-800 truncate" title={displayJob.clientName}>{displayJob.clientName}</p>
                                                    <p className="text-xs text-slate-600 truncate">{displayJob.environmentName}</p>
                                                </div>
                                                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                                    <div className="flex justify-between text-xs text-slate-600 mb-1"><span>{active ? 'Início:' : 'Prev. Início:'} <b>{formatDate(displayJob.start)} {formatTime(displayJob.start)}</b></span></div>
                                                    <div className="flex justify-between text-xs text-slate-600 mb-2"><span>Prev. Fim: <b className="text-blue-600">{formatDate(displayJob.end)} {formatTime(displayJob.end)}</b></span></div>
                                                    <div className="w-full bg-slate-200 rounded-full h-1.5"><div className={`bg-${cardColor}-500 h-1.5 rounded-full`} style={{ width: `${displayJob.progress}%` }}></div></div>
                                                    <p className="text-[10px] text-right text-slate-400 mt-1">{Math.round(displayJob.progress)}% Concluído</p>
                                                </div>
                                                {/* Detalhamento das pendências para montadores ocupados */}
                                                {!isHelper && assembler.unscheduledIssues.length > 0 && (
                                                    <div className="pt-3 border-t border-slate-100 mt-2">
                                                        <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                            <ExclamationCircleIcon className="w-3 h-3"/> Pendências Ativas:
                                                        </p>
                                                        <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1 scrollbar-hide">
                                                            {assembler.unscheduledIssues.map((iss, idx) => (
                                                                <div key={idx} className="bg-red-50/50 border border-red-100 p-1.5 rounded text-left">
                                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                                        <HomeIcon className="w-3 h-3 text-red-400 flex-shrink-0" />
                                                                        <p className="text-[10px] font-bold text-slate-800 truncate uppercase">{iss.clientName}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 ml-4">
                                                                        <CubeIcon className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                                                                        <p className="text-[9px] text-slate-600 truncate">{iss.environmentName}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center py-2 flex-grow flex flex-col justify-center">
                                                <span className={`bg-${isHelper ? 'indigo' : 'green'}-100 text-${isHelper ? 'indigo' : 'green'}-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide inline-block mx-auto mb-3`}>Disponível</span>
                                                {!isHelper && assembler.unscheduledIssues.length > 0 && (
                                                    <div className="flex-grow">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-[9px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1">
                                                                <ExclamationCircleIcon className="w-3 h-3"/> {assembler.unscheduledIssues.length} Pendências Ativas
                                                            </p>
                                                        </div>
                                                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 scrollbar-hide">
                                                            {assembler.unscheduledIssues.map((iss, idx) => (
                                                                <div key={idx} className="bg-red-50/50 border border-red-100 p-2 rounded-lg text-left">
                                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                                        <HomeIcon className="w-3 h-3 text-red-400 flex-shrink-0" />
                                                                        <p className="text-[10px] font-bold text-slate-800 truncate uppercase">{iss.clientName}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 ml-4">
                                                                        <CubeIcon className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                                                                        <p className="text-[9px] text-slate-600 truncate">{iss.environmentName}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
           </div>
       )}

       {activeView === 'MEMBERS' && (
           <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 animate-fadeIn">
               <div className="flex justify-between items-center mb-4">
                   <h2 className="text-lg font-bold text-slate-700">Gerenciar Cadastro de Membros</h2>
                   <button onClick={openAddModal} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-1 text-xs">
                       <PlusCircleIcon className="w-4 h-4"/> Novo Membro
                   </button>
               </div>
               
               <div className="overflow-x-auto">
                   <table className="w-full text-[10px] text-left border-collapse">
                       <thead>
                           <tr className="bg-slate-100 text-slate-600 uppercase tracking-wider border-b border-slate-200">
                               <th className="px-2 py-1.5 font-bold w-1/3">Nome</th>
                               <th className="px-2 py-1.5 font-bold w-1/3">Função</th>
                               <th className="px-2 py-1.5 font-bold text-center w-1/3">Ações</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                           {(Object.entries(groupedMembers) as [string, Assembler[]][]).map(([groupName, groupMembers]) => {
                               if (groupMembers.length === 0) return null;
                               return (
                                   <React.Fragment key={groupName}>
                                       <tr className="bg-slate-50">
                                           <td colSpan={3} className="px-2 py-1 font-bold text-slate-500 uppercase tracking-widest border-y border-slate-200 bg-slate-50/50">
                                               {groupName} ({groupMembers.length})
                                           </td>
                                       </tr>
                                       {groupMembers.map(assembler => (
                                           <tr key={assembler.id} className="hover:bg-blue-50 transition-colors">
                                               <td className="px-2 py-1 font-medium text-slate-800 border-b border-slate-100">
                                                   {assembler.name}
                                               </td>
                                               <td className="px-2 py-1 text-slate-500 border-b border-slate-100">
                                                   {assembler.role}
                                               </td>
                                               <td className="px-2 py-1 text-center border-b border-slate-100">
                                                   <div className="flex items-center justify-center gap-1">
                                                       <button onClick={() => openEditModal(assembler)} className="text-blue-600 hover:text-blue-800 p-0.5 rounded hover:bg-blue-100">
                                                           <PencilIcon className="w-3 h-3" />
                                                       </button>
                                                       <button onClick={() => handleDeleteAssembler(assembler.id)} className="text-red-600 hover:text-red-800 p-0.5 rounded hover:bg-red-100">
                                                           <TrashIcon className="w-3 h-3" />
                                                       </button>
                                                   </div>
                                               </td>
                                           </tr>
                                       ))}
                                   </React.Fragment>
                               );
                           })}
                       </tbody>
                   </table>
               </div>
           </div>
       )}

       {activeView === 'CALENDAR' && <TeamCalendar assemblers={assemblers} clients={clients} />}

       {activeView === 'PRODUCTION' && (
           <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-1 md:p-3 animate-fadeIn max-w-7xl mx-auto flex flex-col h-[calc(100vh-140px)]">
               <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2 border-b border-slate-200 pb-2 mb-2 px-2">
                   <div>
                       <h2 className="text-base md:text-xl font-bold text-slate-800 flex items-center gap-2">
                           <ChartBarIcon className="w-5 h-5 text-blue-600" />
                           Produção de Montagem
                       </h2>
                   </div>
                   <div className="flex items-center gap-1.5 w-full lg:w-auto">
                       <select value={selectedReportMonth} onChange={(e) => setSelectedReportMonth(Number(e.target.value))} className="flex-1 md:flex-none p-1.5 rounded-lg border border-slate-300 text-[10px] bg-slate-50 font-bold outline-none">
                           {MONTH_NAMES.map((m, i) => (<option key={i} value={i}>{m}</option>))}
                       </select>
                       <select value={selectedReportYear} onChange={(e) => setSelectedReportYear(Number(e.target.value))} className="flex-1 md:flex-none p-1.5 rounded-lg border border-slate-300 text-[10px] bg-slate-50 font-bold outline-none">
                           {Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i).map(y => (<option key={y} value={y}>{y}</option>))}
                       </select>
                       <button onClick={handleGenerateProductionReport} disabled={isGeneratingPdf} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider hover:bg-blue-700 shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition-all">
                           <PrinterIcon className="w-3 h-3" /> PDF
                       </button>
                   </div>
               </div>

               {productionData.length === 0 ? (
                   <div className="flex-grow flex flex-col items-center justify-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                       <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Nenhuma atividade no período.</p>
                   </div>
               ) : (
                   <div className="flex-grow border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-y-auto scrollbar-thin">
                       <table className="w-full text-left text-[11px] border-separate border-spacing-0">
                           <thead className="hidden lg:table-header-group sticky top-0 z-30">
                               <tr className="bg-slate-900 text-white text-[9px] uppercase tracking-wider font-black">
                                   <th className="p-2 pl-4 border-b border-slate-800">Montador / Cliente</th>
                                   <th className="p-2 border-b border-slate-800">Ambiente</th>
                                   <th className="p-2 border-b border-slate-800">Período</th>
                                   <th className="p-2 border-b border-slate-800">O.C.</th>
                                   <th className="p-2 text-center border-b border-slate-800">Relativo / Split</th>
                                   <th className="p-2 border-b border-slate-800 min-w-[120px]">Produzido (R$)</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                               {productionData.map((entry) => (
                                   <React.Fragment key={entry.assembler.id}>
                                       <tr className="bg-slate-100 sticky top-0 lg:top-[28px] z-20">
                                           <td colSpan={6} className="px-2 py-1.5 border-y border-slate-200">
                                               <div className="flex items-center justify-between gap-1">
                                                   <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                       <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                                                           <UserIcon className="w-3.5 h-3.5 text-slate-500"/>
                                                       </div>
                                                       <h3 className="font-black text-slate-800 text-xs lg:text-[9px] uppercase truncate">{entry.assembler.name}</h3>
                                                   </div>
                                                   <div className="flex items-center gap-1 flex-shrink-0">
                                                       <span className="text-[7px] text-slate-400 font-black uppercase tracking-tighter">SUB:</span>
                                                       <div className="flex items-center gap-0.5 text-xs lg:text-[10px] font-black text-blue-700">
                                                           <span className="text-[7px] text-slate-400">R$</span>
                                                           <span className="whitespace-nowrap">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(entry.assemblerTotalProduced)}</span>
                                                       </div>
                                                   </div>
                                               </div>
                                           </td>
                                       </tr>
                                       {entry.works.map((work: any, idx: number) => {
                                           const parts = formatCurrencyParts(work.valueProduced);
                                           const rowBg = work.isExtended ? 'bg-amber-50 border-l-2 border-l-amber-400' : 'hover:bg-blue-50/40';
                                           return (
                                               <tr key={idx} className={`${rowBg} transition-colors group`}>
                                                   <td className="p-1 px-2 align-middle min-w-0" colSpan={1}>
                                                       <div className="flex items-start gap-1.5">
                                                            <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center mt-0.5">
                                                                <HomeIcon className={`w-3 h-3 ${work.isExtended ? 'text-amber-500' : 'text-slate-300 group-hover:text-blue-400'}`}/>
                                                            </div>
                                                            <div className="min-w-0 flex-grow">
                                                                <span className="font-bold text-slate-700 text-xs lg:text-[9px] uppercase block truncate">{work.clientName}</span>
                                                                <span className="text-slate-500 text-xs lg:text-[8px] font-medium block truncate lg:hidden">{work.envName}</span>
                                                                <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5 lg:hidden">
                                                                    <div className={`flex items-center gap-0.5 font-bold text-xs lg:text-[7px] ${work.isExtended ? 'text-amber-700' : 'text-slate-400'}`}>
                                                                        <CalendarIcon className="w-2 h-2 opacity-50"/>
                                                                        {work.period}
                                                                    </div>
                                                                    <span className="text-xs lg:text-[7px] text-slate-400 font-black tracking-tighter uppercase">{work.purchaseOrder || ''}</span>
                                                                </div>
                                                            </div>
                                                       </div>
                                                   </td>
                                                   <td className="p-1 align-middle hidden lg:table-cell">
                                                       <span className="text-slate-600 text-[10px] font-medium truncate max-w-[120px] block">{work.envName}</span>
                                                   </td>
                                                   <td className="p-1 align-middle hidden lg:table-cell">
                                                       <div className={`flex items-center gap-1 font-bold text-[9px] ${work.isExtended ? 'text-amber-700' : 'text-slate-400'}`}>
                                                           <CalendarIcon className="w-3 h-3 opacity-50"/>
                                                           {work.period}
                                                       </div>
                                                   </td>
                                                   <td className="p-1 align-middle hidden lg:table-cell">
                                                       <span className="text-[9px] text-slate-400 font-black tracking-tighter uppercase">{work.purchaseOrder || '---'}</span>
                                                   </td>
                                                   <td className="p-1 text-center align-middle w-10 sm:w-auto">
                                                       <div className="flex flex-col items-center">
                                                           <span className={`font-black text-xs lg:text-[9px] ${work.percentage === 100 ? 'text-green-600' : 'text-blue-600'}`}>{work.percentage}%</span>
                                                           {work.mySplit && work.mySplit < 100 && (
                                                               <span className="text-[6.5px] text-indigo-600 font-black mt-[-2px] uppercase">S:{work.mySplit}%</span>
                                                           )}
                                                       </div>
                                                   </td>
                                                   <td className="p-1 pr-2 align-middle w-20 sm:w-auto">
                                                       <div className="flex items-center justify-end gap-0.5">
                                                           <span className="text-slate-400 font-bold text-xs sm:text-[8px]">R$</span>
                                                           <span className="text-right font-black text-slate-700 text-xs sm:text-xs lg:text-[10px] whitespace-nowrap">{parts.value}</span>
                                                       </div>
                                                       {work.isHelper && <span className="text-[6.5px] text-orange-400 font-black block leading-none text-right">AJUDANTE</span>}
                                                   </td>
                                               </tr>
                                           );
                                       })}
                                   </React.Fragment>
                               ))}
                           </tbody>
                       </table>
                   </div>
               )}
               {productionData.length > 0 && (
                   <div className="mt-1 bg-slate-900 text-white rounded-lg p-2 flex justify-between items-center shadow-lg border border-white/10 px-3">
                       <div className="flex items-center gap-1.5 flex-1">
                           <div className="bg-blue-600 p-1 rounded"><ChartBarIcon className="w-3 h-3 text-white"/></div>
                           <span className="font-black uppercase tracking-tight text-[8px] sm:text-[9px]">Total Produzido:</span>
                       </div>
                       <div className="flex items-center gap-1 flex-shrink-0">
                           <span className="text-[8px] text-blue-300 font-bold">R$</span>
                           <span className="text-blue-400 font-black text-xs sm:text-base leading-none">
                               {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(grandTotalProduced)}
                           </span>
                       </div>
                   </div>
               )}
           </div>
       )}

        {activeView === 'EVALUATION' && (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-6 animate-fadeIn">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-700 flex items-center gap-2">
                        <StarIcon className="w-6 h-6 text-yellow-500" />
                        Pontuação da Equipe
                    </h2>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase min-w-[20px]">De:</span>
                                <input 
                                    type="date" 
                                    value={scoreReportStartDate} 
                                    onChange={(e) => setScoreReportStartDate(e.target.value)}
                                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase min-w-[20px]">Até:</span>
                                <input 
                                    type="date" 
                                    value={scoreReportEndDate} 
                                    onChange={(e) => setScoreReportEndDate(e.target.value)}
                                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleGenerateScoreReport} disabled={isGeneratingPdf} className="flex-1 sm:flex-none bg-slate-700 text-white px-3 py-2 rounded-lg font-bold text-xs hover:bg-slate-800 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all shadow-sm">
                                <PrinterIcon className="w-4 h-4" /> PDF
                            </button>
                            <button onClick={() => {
                                setEditingScoreId(null);
                                setScoreDate(new Date().toISOString().split('T')[0]);
                                setSelectedAssemblerId('');
                                setSelectedClientId('');
                                setRatings({
                                    punctuality: 'Bom',
                                    organization: 'Bom',
                                    posture: 'Bom',
                                    finish: 'Bom',
                                    cleaning: 'Bom',
                                    uniform: 'Bom',
                                    observation: ''
                                });
                                setIsScoreModalOpen(true);
                            }} className="flex-1 sm:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 flex items-center justify-center gap-2 text-xs md:text-sm">
                                <PlusCircleIcon className="w-5 h-5"/> Nova Avaliação
                            </button>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto -mx-3 sm:mx-0">
                    <table className="w-full text-[10px] text-left text-slate-600 min-w-[1000px]">
                        <thead className="text-[10px] text-slate-700 uppercase bg-slate-50">
                            <tr>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Montador</th>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3 text-center">Pontualidade</th>
                                <th className="px-4 py-3 text-center">Organização</th>
                                <th className="px-4 py-3 text-center">Postura</th>
                                <th className="px-4 py-3 text-center">Acabamento</th>
                                <th className="px-4 py-3 text-center">Limpeza</th>
                                <th className="px-4 py-3 text-center">Uniforme</th>
                                <th className="px-4 py-3 text-center">Nota Final</th>
                                <th className="px-4 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {scores.length === 0 ? (
                                <tr><td colSpan={11} className="text-center py-4">Nenhuma avaliação registrada.</td></tr>
                            ) : (
                                scores.map(score => {
                                    const calculatePercentage = (s: AssemblerScore) => {
                                        const values: Record<string, number> = { 'Excelente': 3, 'Bom': 2, 'Regular': 1 };
                                        const items = [s.punctuality, s.organization, s.posture, s.finish, s.cleaning, s.uniform];
                                        const total = items.reduce((acc, curr) => acc + (values[curr] || 0), 0);
                                        return Math.round((total / 18) * 100);
                                    };
                                    
                                    const getBadgeClass = (val: string) => {
                                        switch(val) {
                                            case 'Excelente': return 'bg-green-100 text-green-800 border border-green-200';
                                            case 'Bom': return 'bg-orange-100 text-orange-800 border border-orange-200';
                                            case 'Regular': return 'bg-red-100 text-red-800 border border-red-200';
                                            default: return 'bg-slate-100 text-slate-800';
                                        }
                                    };

                                    const percentage = calculatePercentage(score);
                                    let scoreColor = 'text-slate-700';
                                    if (percentage === 100) scoreColor = 'text-green-600';
                                    else if (percentage >= 70) scoreColor = 'text-blue-600';
                                    else if (percentage >= 50) scoreColor = 'text-orange-500';
                                    else scoreColor = 'text-red-600';

                                    // Fix date display
                                    const dateObj = new Date(score.date);
                                    // Add timezone offset to display correctly in local time
                                    const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
                                    const correctedDate = new Date(dateObj.getTime() + userTimezoneOffset);

                                    return (
                                        <tr key={score.id} className="border-b hover:bg-slate-50">
                                            <td className="px-4 py-3 whitespace-nowrap">{correctedDate.toLocaleDateString('pt-BR')}</td>
                                            <td className="px-4 py-3 font-bold whitespace-nowrap">{score.assemblerName}</td>
                                            <td className="px-4 py-3 truncate max-w-[150px]" title={score.clientName}>{score.clientName}</td>
                                            <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded text-[9px] font-bold ${getBadgeClass(score.punctuality)}`}>{score.punctuality}</span></td>
                                            <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded text-[9px] font-bold ${getBadgeClass(score.organization)}`}>{score.organization}</span></td>
                                            <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded text-[9px] font-bold ${getBadgeClass(score.posture)}`}>{score.posture}</span></td>
                                            <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded text-[9px] font-bold ${getBadgeClass(score.finish)}`}>{score.finish}</span></td>
                                            <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded text-[9px] font-bold ${getBadgeClass(score.cleaning)}`}>{score.cleaning}</span></td>
                                            <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded text-[9px] font-bold ${getBadgeClass(score.uniform)}`}>{score.uniform}</span></td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex flex-col items-center justify-center">
                                                    <span className={`text-sm font-black ${scoreColor}`}>{percentage}%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => handleEditScore(score)} className="text-blue-600 hover:text-blue-800 p-1 bg-blue-50 rounded hover:bg-blue-100 transition-colors">
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteScore(score.id)} className="text-red-600 hover:text-red-800 p-1 bg-red-50 rounded hover:bg-red-100 transition-colors">
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
        )}

        {activeView === 'REPORT' && (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 animate-fadeIn max-w-lg mx-auto mt-10"><h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2"><PrinterIcon className="w-6 h-6 text-slate-600" />Gerar Relatório de Equipe</h2>
                <div className="space-y-4"><div><label className="block text-sm font-bold text-slate-600 mb-1">Mês de Referência</label><select value={selectedReportMonth} onChange={(e) => setSelectedReportMonth(Number(e.target.value))} className="w-full p-2 rounded border border-slate-300 text-sm">{MONTH_NAMES.map((m, i) => (<option key={i} value={i}>{m}</option>))}</select></div><div><label className="block text-sm font-bold text-slate-600 mb-1">Ano</label><select value={selectedReportYear} onChange={(e) => setSelectedReportYear(Number(e.target.value))} className="w-full p-2 rounded border border-slate-300 text-sm">{Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i).map(y => (<option key={y} value={y}>{y}</option>))}</select></div><button onClick={handleGenerateReport} disabled={isGeneratingPdf} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 shadow-md disabled:opacity-50 mt-4">{isGeneratingPdf ? 'Gerando...' : 'Baixar PDF'}</button></div>
            </div>
        )}

        {isScoreModalOpen && (
            <Modal onClose={() => setIsScoreModalOpen(false)}>
                <div className="p-4">
                    <h3 className="text-xl font-bold text-slate-800 mb-4">
                        {editingScoreId ? "Editar Avaliação" : "Nova Avaliação Semanal"}
                    </h3>
                    <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Montador</label>
                        <select 
                            value={selectedAssemblerId} 
                            onChange={(e) => setSelectedAssemblerId(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-lg"
                        >
                            <option value="">Selecione...</option>
                            {assemblers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Cliente / Obra</label>
                        <select 
                            value={selectedClientId} 
                            onChange={(e) => setSelectedClientId(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-lg"
                        >
                            <option value="">Selecione...</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Data da Avaliação</label>
                        <input 
                            type="date" 
                            value={scoreDate} 
                            onChange={(e) => setScoreDate(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-lg"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['punctuality', 'organization', 'posture', 'finish', 'cleaning', 'uniform'].map((field) => (
                            <div key={field} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                                    {field === 'punctuality' ? 'Pontualidade' : 
                                     field === 'organization' ? 'Organização' : 
                                     field === 'posture' ? 'Postura' : 
                                     field === 'finish' ? 'Acabamento' : 
                                     field === 'cleaning' ? 'Limpeza' : 'Uniforme'}
                                </label>
                                <div className="flex gap-2">
                                    {['Excelente', 'Bom', 'Regular'].map(option => (
                                        <button
                                            key={option}
                                            onClick={() => setRatings(prev => ({ ...prev, [field]: option }))}
                                            className={`flex-1 py-1 px-2 text-xs rounded border ${
                                                ratings[field as keyof typeof ratings] === option 
                                                ? (option === 'Excelente' ? 'bg-green-100 border-green-300 text-green-700 font-bold' : 
                                                   option === 'Bom' ? 'bg-blue-100 border-blue-300 text-blue-700 font-bold' : 
                                                   'bg-yellow-100 border-yellow-300 text-yellow-700 font-bold')
                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                                            }`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Observações</label>
                        <textarea 
                            value={ratings.observation} 
                            onChange={(e) => setRatings(prev => ({ ...prev, observation: e.target.value }))}
                            className="w-full p-2 border border-slate-300 rounded-lg h-20"
                            placeholder="Observações adicionais..."
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <button onClick={() => setIsScoreModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                        <button onClick={handleSaveScore} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold">Salvar Avaliação</button>
                    </div>
                </div>
            </div>
        </Modal>
        )}

       {isModalOpen && (
        <Modal onClose={() => setIsModalOpen(false)}><div className="p-4"><h3 className="text-xl font-bold text-slate-800 mb-4">{editingId ? 'Editar Montador' : 'Novo Montador'}</h3><form onSubmit={handleSaveAssembler} className="space-y-4"><div><label className="block text-sm font-bold text-slate-700 mb-1">Nome Completo</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border border-slate-300 rounded outline-none" placeholder="Ex: João da Silva" required /></div><div><label className="block text-sm font-bold text-slate-700 mb-1">Função</label><input type="text" value={role} onChange={e => setRole(e.target.value)} className="w-full p-2 border border-slate-300 rounded outline-none" placeholder="Ex: Montador, Ajudante..." list="role-suggestions" /></div><div className="flex justify-end gap-3 pt-4 border-t mt-4"><button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300">Cancelar</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow-sm">Salvar</button></div></form></div></Modal>
      )}

      {showValidationModal && validatingJob && (
          <Modal onClose={() => setShowValidationModal(false)}><div className="p-4 text-center"><h3 className="text-xl font-bold text-slate-800 mb-2">Validar Término</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6"><button onClick={confirmCompletion} className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700 w-full">Finalizou (100%)</button><div className="bg-orange-50 p-4 rounded-lg border border-orange-200"><input type="date" className="w-full p-2 border border-slate-300 rounded mb-2 text-sm" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} /><button onClick={rescheduleJob} disabled={!newEndDate} className="bg-orange-500 text-white px-4 py-2 rounded font-bold hover:bg-orange-600 w-full disabled:opacity-50">Reagendar</button></div></div></div></Modal>
      )}
    </div>
  );
};

export default TeamManagement;
