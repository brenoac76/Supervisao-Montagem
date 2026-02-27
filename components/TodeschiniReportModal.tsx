
import React, { useState, useEffect } from 'react';
import { Client, TodeschiniChecklist, Environment } from '../types';
import Modal from './Modal';
// Added PrinterIcon to the imports
import { DocumentTextIcon, TrashIcon, CheckCircleIcon, PrinterIcon } from './icons';
import SignaturePad from './SignaturePad';
import { jsPDF } from 'jspdf';
import { SCRIPT_URL } from '../App';

interface TodeschiniReportModalProps {
  client: Client;
  environment?: Environment; // Optional specific environment
  onClose: () => void;
  onUpdateClient: (client: Client) => void;
}

const CHECKLIST_ITEMS = [
  "Acabamento interno",
  "Acabamento externo",
  "Regulagem de portas e gavetas",
  "Regulagem de dobradiças e corrediças",
  "Acabamentos gerais",
  "Instalação de aramados",
  "Tapa furo (int/ext)",
  "Acesso aos pontos de gás, água e elétricos",
  "Recolhimento total das sobras",
  "Fixação de acessório (int.)",
  "Alinhamento de puxadores",
  "Amortecedores e elevadores",
  "Limpeza do ambiente e dos móveis",
  "Tonalidades",
  "Riscos de lápis",
  "Acabamento das bordas",
  "Funcionalidade de acessórios",
  "Suportes internos",
  "Emblema Todeschini",
  "Nivelamento"
];

const CONCLUSION_ROWS = [
  "Instalação concluída sem problemas.",
  "Instalação acabou com peças do deposito.",
  "Instalação não acabou."
];

// Helper para converter UTC (ISO) para string compatível com input datetime-local
const toLocalInputString = (isoString?: string) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString; // Fallback se já for uma string manual
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().slice(0, 16);
    } catch (e) {
        return '';
    }
};

// Helper to convert blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const getDisplayableDriveUrl = (url: string): string => {
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
    const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
    const match = url.match(driveRegex);
    if (match && match[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
    return url;
};

const TodeschiniReportModal: React.FC<TodeschiniReportModalProps> = ({ client, environment, onClose, onUpdateClient }) => {
  const [checklist, setChecklist] = useState<TodeschiniChecklist>(() => {
    const existingChecklist = environment ? environment.todeschiniChecklist : client.todeschiniChecklist;

    return existingChecklist || {
        items: CHECKLIST_ITEMS.reduce((acc, item) => ({ ...acc, [item]: null }), {}),
        problems: '',
        conclusion: CONCLUSION_ROWS.reduce((acc, item) => ({ ...acc, [item]: null }), {}),
        responsibility: null,
        supervisorOpinion: '',
        clientComments: '',
        acknowledgementDate: '',
        clientName: client.name || '',
        signatureBase64: '',
        supervisorArrival: new Date().toISOString()
    };
  });

  const [isGenerating, setIsGenerating] = useState(false);

  const updateChecklistState = (updates: Partial<TodeschiniChecklist>) => {
      const newState = { ...checklist, ...updates };
      setChecklist(newState);
      
      if (environment) {
          const updatedEnvironments = client.environments.map(env => 
              env.id === environment.id ? { ...env, todeschiniChecklist: newState } : env
          );
          onUpdateClient({ ...client, environments: updatedEnvironments });
      } else {
          onUpdateClient({ ...client, todeschiniChecklist: newState });
      }
  };

  const handleManualSave = () => {
      if (environment) {
          const updatedEnvironments = client.environments.map(env => 
              env.id === environment.id ? { ...env, todeschiniChecklist: checklist } : env
          );
          onUpdateClient({ ...client, environments: updatedEnvironments });
      } else {
          onUpdateClient({ ...client, todeschiniChecklist: checklist });
      }
      alert("Checklist salvo com sucesso!");
  };

  const handleClearChecklist = () => {
      if (window.confirm("Tem certeza que deseja limpar este checklist?")) {
          const emptyState: TodeschiniChecklist = {
              items: CHECKLIST_ITEMS.reduce((acc, item) => ({ ...acc, [item]: null }), {}),
              problems: '',
              conclusion: CONCLUSION_ROWS.reduce((acc, item) => ({ ...acc, [item]: null }), {}),
              responsibility: null,
              supervisorOpinion: '',
              clientComments: '',
              acknowledgementDate: '',
              clientName: client.name || '',
              signatureBase64: '',
              supervisorArrival: new Date().toISOString()
          };
          setChecklist(emptyState);
          
          if (environment) {
              const updatedEnvironments = client.environments.map(env => 
                  env.id === environment.id ? { ...env, todeschiniChecklist: emptyState } : env
              );
              onUpdateClient({ ...client, environments: updatedEnvironments });
          } else {
              onUpdateClient({ ...client, todeschiniChecklist: emptyState });
          }
      }
  };

  const handleItemChange = (item: string, value: 'C' | 'NC') => {
      updateChecklistState({ items: { ...checklist.items, [item]: value } });
  };

  const handleConclusionChange = (row: string, value: 'C' | 'NC') => {
      updateChecklistState({ conclusion: { ...checklist.conclusion, [row]: value } });
  };

  const handleGeneratePdf = async () => {
    setIsGenerating(true);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = Number(pdf.internal.pageSize.getWidth());
    const margin = 10;
    let yPos = margin;

    // --- Header Logo Discovery ---
    try {
        const logoRes = await fetch(`${SCRIPT_URL}?action=GET_LOGO`).then(r => r.json());
        if (logoRes.success && logoRes.url) {
            const displayUrl = getDisplayableDriveUrl(logoRes.url);
            const imgResponse = await fetch(displayUrl);
            const imgBlob = await imgResponse.blob();
            const base64 = await blobToBase64(imgBlob);
            // v1.5.9: Logo retornada para a esquerda (margin - 5)
            pdf.addImage(base64, 'PNG', margin - 5, yPos - 5, 45, 15);
        }
    } catch (e) {
        console.error("Erro ao carregar a logo do Drive:", e);
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text("APÓS A MONTAGEM", pageWidth / 2, yPos + 5, { align: 'center' });
    pdf.setFontSize(10);
    pdf.text("Lista de verificação final antes da entrega da instalação Móvel Todeschini", pageWidth / 2, yPos + 12, { align: 'center' });
    yPos += 18;

    if (environment) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text(environment.name.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
        yPos += 8;
    } else {
        yPos += 2;
    }

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text("Marque um X em C quando o item estiver OK ou em NC se o item estiver com problema.", margin, yPos);
    yPos += 4;

    const colWidth = (pageWidth - 2 * margin) / 2;
    const itemHeight = 6;
    const leftItems = CHECKLIST_ITEMS.slice(0, 10);
    const rightItems = CHECKLIST_ITEMS.slice(10, 20);

    const drawItemRow = (item: string, x: number, y: number, w: number) => {
        pdf.setDrawColor(0);
        pdf.rect(x, y, w, itemHeight);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(item, x + 2, y + 4);
        const boxWidth = 8;
        const ncX = x + w - boxWidth;
        const cX = ncX - boxWidth;
        pdf.line(cX, y, cX, y + itemHeight);
        pdf.line(ncX, y, ncX, y + itemHeight);
        pdf.setFontSize(8);
        pdf.text("C", cX + 2.5, y + 4);
        pdf.text("NC", ncX + 1.5, y + 4);
        const status = checklist.items[item];
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        if (status === 'C') {
            pdf.text("X", cX + 2, y + 4.5);
        } else if (status === 'NC') {
            pdf.text("X", ncX + 1, y + 4.5);
        }
    };

    for (let i = 0; i < 10; i++) {
        drawItemRow(leftItems[i], margin, yPos + (i * itemHeight), colWidth);
        drawItemRow(rightItems[i], margin + colWidth, yPos + (i * itemHeight), colWidth);
    }
    yPos += 10 * itemHeight + 5;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text("Relate abaixo os problemas identificados.", margin, yPos);
    yPos += 4;
    pdf.rect(margin, yPos, pageWidth - 2 * margin, 25);
    pdf.setFont('helvetica', 'normal');
    if (checklist.problems) {
        const splitProb = pdf.splitTextToSize(checklist.problems, pageWidth - 2 * margin - 4);
        pdf.text(splitProb, margin + 2, yPos + 4);
    }
    yPos += 30;

    pdf.setFont('helvetica', 'bold');
    pdf.text("Conclusão da Montagem", margin, yPos);
    yPos += 4;
    const conclusionW = pageWidth - 2 * margin;
    const boxSize = 8;
    
    // v1.5.5: Modified drawConclusionRow to place boxes on the left
    const drawConclusionRow = (text: string, currentY: number) => {
        pdf.setDrawColor(0);
        pdf.rect(margin, currentY, conclusionW, itemHeight);
        
        // Two boxes at the beginning
        pdf.rect(margin, currentY, boxSize, itemHeight);
        pdf.rect(margin + boxSize, currentY, boxSize, itemHeight);
        
        const status = checklist.conclusion[text];
        pdf.setFont('helvetica', 'bold');
        if (status === 'C') {
            pdf.setFontSize(10);
            pdf.text("C", margin + 2, currentY + 4.5);
        }
        if (status === 'NC') {
            pdf.setFontSize(8);
            pdf.text("NC", margin + boxSize + 1, currentY + 4.5);
        }

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(text, margin + (boxSize * 2) + 2, currentY + 4);
    };

    drawConclusionRow(CONCLUSION_ROWS[0], yPos);
    yPos += itemHeight;
    drawConclusionRow(CONCLUSION_ROWS[1], yPos);
    yPos += itemHeight;
    
    // v1.5.5: Modified Row 3 to align checkboxes to the left
    pdf.rect(margin, yPos, conclusionW, itemHeight);
    pdf.rect(margin, yPos, boxSize, itemHeight);
    pdf.rect(margin + boxSize, yPos, boxSize, itemHeight);
    
    const status3 = checklist.conclusion[CONCLUSION_ROWS[2]];
    pdf.setFont('helvetica', 'bold');
    if (status3 === 'C') { pdf.setFontSize(10); pdf.text("C", margin + 2, yPos + 4.5); }
    if (status3 === 'NC') { pdf.setFontSize(8); pdf.text("NC", margin + boxSize + 1, yPos + 4.5); }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(CONCLUSION_ROWS[2], margin + (boxSize * 2) + 2, yPos + 4);

    const fabX = margin + 115;
    const servX = margin + 140;
    const cliX = margin + 165;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text("Fábrica", fabX, yPos + 4);
    pdf.rect(fabX + 13, yPos + 1, 4, 4);
    if (checklist.responsibility === 'Fabrica') { pdf.setFont('helvetica', 'bold'); pdf.text("X", fabX + 13.5, yPos + 4); pdf.setFont('helvetica', 'normal'); }
    pdf.text("Serviço", servX, yPos + 4);
    pdf.rect(servX + 13, yPos + 1, 4, 4);
    if (checklist.responsibility === 'Servico') { pdf.setFont('helvetica', 'bold'); pdf.text("X", servX + 13.5, yPos + 4); pdf.setFont('helvetica', 'normal'); }
    pdf.text("Cliente", cliX, yPos + 4);
    pdf.rect(cliX + 12, yPos + 1, 4, 4);
    if (checklist.responsibility === 'Cliente') { pdf.setFont('helvetica', 'bold'); pdf.text("X", cliX + 12.5, yPos + 4); pdf.setFont('helvetica', 'normal'); }

    yPos += itemHeight + 5;
    pdf.setFont('helvetica', 'bold').setFontSize(10).text("Parecer final do Supervisor.", margin, yPos);
    yPos += 4;
    pdf.rect(margin, yPos, pageWidth - 2 * margin, 20);
    pdf.setFont('helvetica', 'normal');
    if (checklist.supervisorOpinion) {
        const splitOp = pdf.splitTextToSize(checklist.supervisorOpinion, pageWidth - 2 * margin - 4);
        pdf.text(splitOp, margin + 2, yPos + 4);
    }
    yPos += 25;
    
    // v1.5.7: Formatação da data de chegada no PDF
    const arrivalDateStr = checklist.supervisorArrival 
        ? new Date(checklist.supervisorArrival).toLocaleString('pt-BR') 
        : '___ / ___ / ___  ___ : ___';
    pdf.text(`Chegada do Supervisor: ${arrivalDateStr}`, margin, yPos);
    
    yPos += 10;
    pdf.setFont('helvetica', 'bold').text("Comentários do Cliente", margin, yPos);
    yPos += 4;
    pdf.rect(margin, yPos, pageWidth - 2 * margin, 20);
    pdf.setFont('helvetica', 'normal');
    if (checklist.clientComments) {
        const splitComm = pdf.splitTextToSize(checklist.clientComments, pageWidth - 2 * margin - 4);
        pdf.text(splitComm, margin + 2, yPos + 4);
    }
    yPos += 25;
    const dateStr = checklist.acknowledgementDate ? new Date(checklist.acknowledgementDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '__/__/____';
    // v1.5.5: Updated footer text
    pdf.setFontSize(9).text(`Ciente de que a montagem foi devidamente finalizada sem deixar qualquer tipo de pendência nesta data ${dateStr}.`, margin, yPos);
    yPos += 25;
    const sigLineX = (pageWidth - 100) / 2;
    pdf.line(sigLineX, yPos, sigLineX + 100, yPos);
    yPos += 5;
    pdf.text(checklist.clientName || "Cliente", pageWidth / 2, yPos, { align: 'center' });
    if (checklist.signatureBase64) {
        pdf.addImage(checklist.signatureBase64, 'PNG', (pageWidth - 60) / 2, (yPos - 5) - 18, 60, 20);
    }
    pdf.save(`checklist-todeschini-${client.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
    setIsGenerating(false);
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col h-[80vh]">
        <div className="flex-shrink-0 mb-4 border-b pb-2 flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Checklist Todeschini</h2>
                <p className="text-sm text-slate-500">Pós-montagem e Conferência Final</p>
            </div>
            <button onClick={handleGeneratePdf} disabled={isGenerating} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50">
                <PrinterIcon className="w-5 h-5"/> {isGenerating ? 'Processando...' : 'Gerar PDF Oficial'}
            </button>
        </div>
        
        <div className="flex-grow overflow-y-auto pr-2 space-y-6">
            <div className="bg-slate-50 p-4 rounded-lg border">
                <h3 className="font-bold text-slate-700 mb-3">Itens de Verificação</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    {CHECKLIST_ITEMS.map(item => (
                        <div key={item} className="flex items-center justify-between py-1 border-b border-slate-200">
                            <span className="text-sm text-slate-700">{item}</span>
                            <div className="flex gap-2">
                                <label className="flex items-center gap-1 cursor-pointer">
                                    <input type="radio" name={item} checked={checklist.items[item] === 'C'} onChange={() => handleItemChange(item, 'C')} className="text-blue-600" />
                                    <span className="text-xs font-bold text-slate-600">C</span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                    <input type="radio" name={item} checked={checklist.items[item] === 'NC'} onChange={() => handleItemChange(item, 'NC')} className="text-red-600" />
                                    <span className="text-xs font-bold text-slate-600">NC</span>
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Problemas Identificados</label>
                <textarea value={checklist.problems} onChange={e => updateChecklistState({ problems: e.target.value })} className="w-full p-2 border border-slate-300 rounded" rows={3} />
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border">
                <h3 className="font-bold text-slate-700 mb-3">Conclusão da Montagem</h3>
                <div className="space-y-3">
                    {CONCLUSION_ROWS.map(row => (
                        <div key={row} className="flex items-center justify-between">
                            <span className="text-sm text-slate-700">{row}</span>
                            <div className="flex gap-2">
                                <label className="flex items-center gap-1 cursor-pointer">
                                    <input type="radio" name={`conclusion-${row}`} checked={checklist.conclusion[row] === 'C'} onChange={() => handleConclusionChange(row, 'C')} />
                                    <span className="text-xs font-bold text-blue-700">C</span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                    <input type="radio" name={`conclusion-${row}`} checked={checklist.conclusion[row] === 'NC'} onChange={() => handleConclusionChange(row, 'NC')} />
                                    <span className="text-xs font-bold text-red-700">NC</span>
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex gap-4 border-t pt-3 flex-wrap">
                    <span className="text-sm font-bold w-full sm:w-auto">Responsabilidade:</span>
                    {(['Fabrica', 'Servico', 'Cliente'] as const).map(resp => (
                        <label key={resp} className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" name="responsibility" checked={checklist.responsibility === resp} onChange={() => updateChecklistState({ responsibility: resp })} />
                            <span className="text-sm">{resp}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Parecer final do Supervisor</label>
                <textarea value={checklist.supervisorOpinion} onChange={e => updateChecklistState({ supervisorOpinion: e.target.value })} className="w-full p-2 border border-slate-300 rounded" rows={3} />
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border">
                <div className="mb-4">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Data/Hora Chegada do Supervisor</label>
                    {/* v1.5.7: Alterado para datetime-local para usar o calendário do sistema */}
                    <input 
                        type="datetime-local" 
                        value={toLocalInputString(checklist.supervisorArrival)} 
                        onChange={e => updateChecklistState({ supervisorArrival: e.target.value ? new Date(e.target.value).toISOString() : '' })} 
                        className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div className="mb-4">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Data de Ciência</label>
                    <input type="date" value={checklist.acknowledgementDate || ''} onChange={e => updateChecklistState({ acknowledgementDate: e.target.value })} className="p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="mb-4">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Nome do Cliente</label>
                    <input type="text" value={checklist.clientName} onChange={e => updateChecklistState({ clientName: e.target.value })} className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Assinatura do Cliente</label>
                    <SignaturePad onSave={(data) => updateChecklistState({ signatureBase64: data })} onClear={() => updateChecklistState({ signatureBase64: '' })} initialData={checklist.signatureBase64} />
                </div>
            </div>
        </div>

        <div className="flex-shrink-0 pt-4 border-t mt-4 flex justify-end gap-3 flex-wrap">
            <button onClick={handleClearChecklist} className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 mr-auto flex items-center gap-1 font-semibold">
                <TrashIcon className="w-4 h-4" /> Limpar
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-slate-200 rounded text-slate-700 hover:bg-slate-300">Fechar</button>
            <button onClick={handleManualSave} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5" /> Salvar Dados
            </button>
        </div>
      </div>
    </Modal>
  );
};

export default TodeschiniReportModal;
