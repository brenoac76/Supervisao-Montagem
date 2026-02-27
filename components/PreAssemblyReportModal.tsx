
import React, { useState } from 'react';
import { Client, PreAssemblyChecklist } from '../types';
import Modal from './Modal';
import { DocumentTextIcon, PrinterIcon } from './icons';
import SignaturePad from './SignaturePad';
import { jsPDF } from 'jspdf';
import { SCRIPT_URL } from '../App';

interface PreAssemblyReportModalProps {
  client: Client;
  onClose: () => void;
  onUpdateClient: (client: Client) => void;
}

const CHECKLIST_ITEMS = [
  "Verificação eletrodomésticos/equipamento eletrônico",
  "Proteção do Piso (Salva piso)",
  "Cobertura de móveis, estofados, persianas já existentes no local.",
  "Local com avarias de terceiros. Especificar o tipo de Avaria",
  "Projeto hidráulico",
  "Projeto elétrico"
];

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

const PreAssemblyReportModal: React.FC<PreAssemblyReportModalProps> = ({ client, onClose, onUpdateClient }) => {
  const [data, setData] = useState<PreAssemblyChecklist>(() => {
      return client.preAssemblyChecklist || {
          clientName: client.name || '',
          contract: '',
          phone: '',
          neighborhood: '',
          zipCode: '',
          city: 'Ipatinga',
          selectedEnvironmentIds: [],
          checklistValues: CHECKLIST_ITEMS.reduce((acc, item) => ({ ...acc, [item]: null }), {}),
          signatureBase64: ''
      };
  });

  const [isGenerating, setIsGenerating] = useState(false);

  const handleUpdate = (updates: Partial<PreAssemblyChecklist>) => {
      const newState = { ...data, ...updates };
      setData(newState);
      onUpdateClient({ ...client, preAssemblyChecklist: newState });
  };

  const toggleEnvironment = (id: string) => {
      const current = data.selectedEnvironmentIds;
      const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      handleUpdate({ selectedEnvironmentIds: next });
  };

  const setCheckValue = (item: string, val: 'SIM' | 'NÃO') => {
      handleUpdate({ checklistValues: { ...data.checklistValues, [item]: val } });
  };

  const currentDisplayName = data.clientName || client.name;

  const handleGeneratePdf = async () => {
      setIsGenerating(true);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 10;
      let y = 15;

      // --- LOGO & HEADER (DYNAMIC FETCH FROM DRIVE) ---
      try {
          const logoRes = await fetch(`${SCRIPT_URL}?action=GET_LOGO`).then(r => r.json());
          if (logoRes.success && logoRes.url) {
              const displayUrl = getDisplayableDriveUrl(logoRes.url);
              const imgResponse = await fetch(displayUrl);
              const imgBlob = await imgResponse.blob();
              const base64 = await blobToBase64(imgBlob);
              pdf.addImage(base64, 'PNG', margin, y, 45, 15);
          }
      } catch (e) {
          console.error("Erro ao carregar a logo do Drive para o PDF:", e);
      }
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text("CHECK-LIST DE MONTAGEM", pageWidth - margin, y + 7, { align: 'right' });
      y += 20;

      pdf.setFontSize(12);
      pdf.text("TODESCHINI IPATINGA", pageWidth / 2, y, { align: 'center' });
      y += 8;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const intro = `Prezado (a), ${currentDisplayName}\nÉ com grande satisfação que estamos entregando o móvel desejado. Assim, pedimos para você realizar o checklist do ambiente montado, tirando suas dúvidas com o montador, verificando-se o projeto executado está em perfeitas condições e de acordo com o desenho adquirido no momento da venda. Havendo alguma observação, favor mencioná-la abaixo. A franquia se exime de quaisquer avarias que não constam neste checklist e que não seja constatado defeito de fabricação, termos estes constantes no Manual de Cuidados Produtos Todeschini.`;
      pdf.text(pdf.splitTextToSize(intro, pageWidth - 2 * margin), margin, y);
      y += 35;

      // --- DADOS DO CLIENTE TABLE ---
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text("DADOS DO CLIENTE", margin, y);
      y += 2;
      
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.2);
      pdf.rect(margin, y, pageWidth - 2 * margin, 30);
      
      pdf.line(margin, y + 10, pageWidth - margin, y + 10);
      pdf.line(margin, y + 20, pageWidth - margin, y + 20);
      
      const col2 = pageWidth * 0.7;
      pdf.line(col2, y, col2, y + 10);
      pdf.line(col2, y + 10, col2, y + 20);
      const colZip = pageWidth * 0.4;
      pdf.line(colZip, y + 20, colZip, y + 30);
      pdf.line(col2, y + 20, col2, y + 30);

      pdf.setFontSize(8);
      pdf.text("CLIENTE", margin + 2, y + 4);
      pdf.setFont('helvetica', 'normal');
      pdf.text(currentDisplayName, margin + 2, y + 8);

      pdf.setFont('helvetica', 'bold');
      pdf.text("CONTRATO", col2 + 2, y + 4);
      pdf.setFont('helvetica', 'normal');
      pdf.text(data.contract || "---", col2 + 2, y + 8);

      pdf.setFont('helvetica', 'bold');
      pdf.text("ENDEREÇO", margin + 2, y + 14);
      pdf.setFont('helvetica', 'normal');
      pdf.text(client.address, margin + 2, y + 18);

      pdf.setFont('helvetica', 'bold');
      pdf.text("BAIRRO", col2 + 2, y + 14);
      pdf.setFont('helvetica', 'normal');
      pdf.text(data.neighborhood || "---", col2 + 2, y + 18);

      pdf.setFont('helvetica', 'bold');
      pdf.text("CIDADE", margin + 2, y + 24);
      pdf.setFont('helvetica', 'normal');
      pdf.text(data.city || "---", margin + 2, y + 28);

      pdf.setFont('helvetica', 'bold');
      pdf.text("CEP", colZip + 2, y + 24);
      pdf.setFont('helvetica', 'normal');
      pdf.text(data.zipCode || "---", colZip + 2, y + 28);

      pdf.setFont('helvetica', 'bold');
      pdf.text("FONE", col2 + 2, y + 24);
      pdf.setFont('helvetica', 'normal');
      pdf.text(data.phone || "---", col2 + 2, y + 28);

      y += 35;

      // --- AMBIENTES ---
      pdf.setFont('helvetica', 'bold');
      pdf.text("AMBIENTES A SEREM MONTADOS", margin, y);
      y += 4;
      const selectedEnvs = client.environments
        .filter(e => data.selectedEnvironmentIds.includes(e.id))
        .map(e => e.name)
        .join(" - ");
      pdf.setFont('helvetica', 'normal');
      pdf.text(selectedEnvs || "Nenhum selecionado", margin, y);
      y += 8;

      const tableW = pageWidth - 2 * margin;
      const colW = tableW / 3;
      pdf.rect(margin, y, tableW, 10);
      pdf.line(margin + colW, y, margin + colW, y + 10);
      pdf.line(margin + 2 * colW, y, margin + 2 * colW, y + 10);
      pdf.line(margin, y + 5, pageWidth - margin, y + 5);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text("DATA DE CONCLUSÃO DA ENTREGA", margin + colW / 2, y + 3.5, { align: 'center' });
      pdf.text("DATA DE INÍCIO DA MONTAGEM", margin + colW + colW / 2, y + 3.5, { align: 'center' });
      pdf.text("DATA DE TÉRMINO DA MONTAGEM", margin + 2 * colW + colW / 2, y + 3.5, { align: 'center' });
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(data.deliveryCompletionDate ? new Date(data.deliveryCompletionDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : "__ / __ / ____", margin + colW / 2, y + 8.5, { align: 'center' });
      pdf.text(data.assemblyStartDate ? new Date(data.assemblyStartDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : "__ / __ / ____", margin + colW + colW / 2, y + 8.5, { align: 'center' });
      pdf.text(data.assemblyEndDate ? new Date(data.assemblyEndDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : "__ / __ / ____", margin + 2 * colW + colW / 2, y + 8.5, { align: 'center' });
      
      y += 18;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text("ANTES DA MONTAGEM", pageWidth / 2, y, { align: 'center' });
      y += 4;
      pdf.setFontSize(8);
      pdf.text("Lista de verificação para início da instalação. Marque com um X em SIM ou NÃO.", pageWidth / 2, y, { align: 'center' });
      y += 4;

      const rowH = 6;
      const checkCol1 = tableW * 0.65;
      const checkCol2 = tableW * 0.82;

      pdf.rect(margin, y, tableW, rowH * CHECKLIST_ITEMS.length);
      
      CHECKLIST_ITEMS.forEach((item, i) => {
          const rowY = y + (i * rowH);
          pdf.line(margin, rowY, margin + tableW, rowY);
          pdf.setFont('helvetica', 'normal');
          pdf.text(item, margin + 2, rowY + 4);
          
          pdf.line(margin + checkCol1, rowY, margin + checkCol1, rowY + rowH);
          pdf.line(margin + checkCol2, rowY, margin + checkCol2, rowY + rowH);
          
          pdf.setFontSize(7);
          pdf.text("SIM", margin + checkCol1 + 5, rowY + 4);
          pdf.text("NÃO", margin + checkCol2 + 5, rowY + 4);

          const val = data.checklistValues[item];
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(12);
          if (val === 'SIM') {
              pdf.text("X", margin + checkCol1 + 6, rowY + 4.5, { align: 'center' });
          } else if (val === 'NÃO') {
              pdf.text("X", margin + checkCol2 + 6, rowY + 4.5, { align: 'center' });
          }
          pdf.setFontSize(8);
      });
      y += (rowH * CHECKLIST_ITEMS.length) + 10;

      pdf.setFont('helvetica', 'normal');
      const footerTxt = `Eu, ${currentDisplayName} autorizo executar furos em paredes sem projeto elétrico ou hidráulico fornecido e me responsabilizo por prejuízos que venham a ocorrer.`;
      pdf.text(pdf.splitTextToSize(footerTxt, pageWidth - 2 * margin), margin, y);
      y += 25;

      pdf.line(pageWidth / 2 - 40, y, pageWidth / 2 + 40, y);
      pdf.text("Assinatura", pageWidth / 2, y + 5, { align: 'center' });

      if (data.signatureBase64) {
          pdf.addImage(data.signatureBase64, 'PNG', pageWidth / 2 - 30, y - 20, 60, 20);
      }

      pdf.save(`checklist_montagem_inicio_${currentDisplayName.replace(/\s+/g, '_')}.pdf`);
      setIsGenerating(false);
  };

  return (
    <Modal onClose={onClose}>
        <div className="flex flex-col h-[85vh]">
            <div className="flex-shrink-0 mb-4 border-b pb-2 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Checklist Início de Montagem</h2>
                    <p className="text-sm text-slate-500">Formulário oficial Todeschini Ipatinga</p>
                </div>
                <button onClick={handleGeneratePdf} disabled={isGenerating} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50">
                    <PrinterIcon className="w-5 h-5"/> {isGenerating ? 'Processando Imagens...' : 'Gerar PDF Oficial'}
                </button>
            </div>

            <div className="flex-grow overflow-y-auto pr-2 space-y-8">
                {/* Dados Iniciais */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase">Cliente (Editar se necessário)</label>
                        {/* v1.6.0: Nome agora é editável */}
                        <input 
                            value={currentDisplayName} 
                            onChange={e => handleUpdate({ clientName: e.target.value })}
                            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase">Contrato</label>
                        <input value={data.contract} onChange={e => handleUpdate({ contract: e.target.value })} className="w-full p-2 border rounded" placeholder="300078..." />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase">Telefone</label>
                        <input value={data.phone} onChange={e => handleUpdate({ phone: e.target.value })} className="w-full p-2 border rounded" placeholder="(31) 9..." />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase">Bairro</label>
                        <input value={data.neighborhood} onChange={e => handleUpdate({ neighborhood: e.target.value })} className="w-full p-2 border rounded" placeholder="Horto" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase">CEP</label>
                        <input value={data.zipCode} onChange={e => handleUpdate({ zipCode: e.target.value })} className="w-full p-2 border rounded" placeholder="35160-..." />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase">Cidade</label>
                        <input value={data.city} onChange={e => handleUpdate({ city: e.target.value })} className="w-full p-2 border rounded" />
                    </div>
                </div>

                {/* Ambientes Multi-select */}
                <div className="p-4 bg-white border rounded-lg">
                    <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                        {/* v1.6.0: Removido o ícone azul gigante daqui */}
                        Ambientes a serem montados
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {client.environments.map(env => (
                            <button 
                                key={env.id} 
                                onClick={() => toggleEnvironment(env.id)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${data.selectedEnvironmentIds.includes(env.id) ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                            >
                                {env.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Datas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg border">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase">Conclusão da Entrega</label>
                        <input type="date" value={data.deliveryCompletionDate?.split('T')[0] || ''} onChange={e => handleUpdate({ deliveryCompletionDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase">Início da Montagem</label>
                        <input type="date" value={data.assemblyStartDate?.split('T')[0] || ''} onChange={e => handleUpdate({ assemblyStartDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase">Término da Montagem</label>
                        <input type="date" value={data.assemblyEndDate?.split('T')[0] || ''} onChange={e => handleUpdate({ assemblyEndDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })} className="w-full p-2 border rounded" />
                    </div>
                </div>

                {/* Checklist Antes da Montagem */}
                <div className="p-4 bg-white border rounded-lg">
                    <h3 className="font-bold text-slate-700 mb-4 uppercase text-center text-sm border-b pb-2">Antes da Montagem</h3>
                    <div className="space-y-4">
                        {CHECKLIST_ITEMS.map(item => (
                            <div key={item} className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b gap-2">
                                <span className="text-sm font-medium text-slate-700">{item}</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input type="radio" name={item} checked={data.checklistValues[item] === 'SIM'} onChange={() => setCheckValue(item, 'SIM')} className="w-5 h-5 text-blue-600" />
                                        <span className={`text-sm font-bold ${data.checklistValues[item] === 'SIM' ? 'text-blue-700' : 'text-slate-400'}`}>SIM</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input type="radio" name={item} checked={data.checklistValues[item] === 'NÃO'} onChange={() => setCheckValue(item, 'NÃO')} className="w-5 h-5 text-red-600" />
                                        <span className={`text-sm font-bold ${data.checklistValues[item] === 'NÃO' ? 'text-red-700' : 'text-slate-400'}`}>NÃO</span>
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Assinatura */}
                <div className="p-4 bg-slate-50 border rounded-lg">
                    <h3 className="font-bold text-slate-700 mb-2">Assinatura do Cliente</h3>
                    <SignaturePad 
                        onSave={(sig) => handleUpdate({ signatureBase64: sig })}
                        onClear={() => handleUpdate({ signatureBase64: '' })}
                        initialData={data.signatureBase64}
                    />
                </div>
            </div>

            <div className="flex-shrink-0 pt-4 border-t flex justify-end gap-3">
                <button onClick={onClose} className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold">Fechar</button>
                <button onClick={() => { handleUpdate({}); alert("Salvo localmente!"); }} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold">Salvar Dados</button>
            </div>
        </div>
    </Modal>
  );
};

export default PreAssemblyReportModal;
