
import React, { useState } from 'react';
import { Client, ChecklistStatus, Environment, Media } from '../types';
import Modal from './Modal';
import { DocumentTextIcon } from './icons';

interface ReportModalProps {
  client: Client;
  onClose: () => void;
}

// Helpers for Image Processing in PDF
const getDisplayableDriveUrl = (url: string): string => {
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
    const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
    const match = url.match(driveRegex);
    if (match && match[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
    return url;
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const ReportModal: React.FC<ReportModalProps> = ({ client, onClose }) => {
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGeneratePdf = async () => {
        setIsGenerating(true);
        try {
            if (!(window as any).jspdf) {
                alert("A biblioteca PDF não foi carregada.");
                setIsGenerating(false);
                return;
            }

            const { jsPDF } = (window as any).jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageHeight = Number(pdf.internal.pageSize.getHeight());
            const pageWidth = Number(pdf.internal.pageSize.getWidth());
            const margin = 10;
            let yPos = margin;

            const formatDate = (dateStr?: string) => {
                if (!dateStr) return '---';
                return new Date(dateStr).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            };

            const checkPageBreak = (needed = 10) => {
                if (yPos + needed > pageHeight - margin) {
                    pdf.addPage();
                    yPos = margin;
                    return true;
                }
                return false;
            };

            // --- HEADER ---
            pdf.setFont('helvetica', 'bold').setFontSize(13).setTextColor(40);
            pdf.text('RESUMO TÉCNICO DE MONTAGEM', margin, yPos + 4);
            
            pdf.setFontSize(7).setFont('helvetica', 'normal').setTextColor(100);
            pdf.text(`GERADO EM: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, yPos + 4, { align: 'right' });
            yPos += 10;

            // --- CLIENT INFO BAR ---
            pdf.setFillColor(245, 247, 250);
            pdf.rect(margin, yPos, pageWidth - (margin * 2), 10, 'F');
            pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(60);
            pdf.text(`CLIENTE: ${client.name.toUpperCase()}`, margin + 3, yPos + 4);
            pdf.setFont('helvetica', 'normal').setFontSize(7);
            pdf.text(`ENDEREÇO: ${client.address}`, margin + 3, yPos + 7.5);
            yPos += 14;

            // --- TABLE CONFIGURATION ---
            const colWidths = {
                env: 45,
                assembler: 35,
                start: 22,
                prev: 22,
                end: 22,
                progress: 25
            };

            const drawTableHeader = () => {
                pdf.setFillColor(51, 65, 85);
                pdf.rect(margin, yPos, pageWidth - (margin * 2), 6, 'F');
                pdf.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(255);
                let x = margin + 2;
                pdf.text("AMBIENTE", x, yPos + 4); x += colWidths.env;
                pdf.text("MONTADOR", x, yPos + 4); x += colWidths.assembler;
                pdf.text("INÍCIO", x, yPos + 4); x += colWidths.start;
                pdf.text("PREVISÃO", x, yPos + 4); x += colWidths.prev;
                pdf.text("FINALIZADO", x, yPos + 4); x += colWidths.end;
                pdf.text("STATUS", x, yPos + 4);
                yPos += 6;
            };

            drawTableHeader();

            // --- PROCESS DATA FOR TABLE ---
            const sortedEnvs = [...client.environments].sort((a, b) => a.name.localeCompare(b.name));
            let totalEnvsProgressSum = 0;
            
            for (const env of sortedEnvs) {
                const assemblyItems = env.checklist.filter(i => !i.isDelivery);
                const totalItems = assemblyItems.length;
                let envProgress = 0;
                if (totalItems > 0) {
                    const totalItemsProgressSum = assemblyItems.reduce((acc, i) => {
                        const p = i.progress !== undefined ? i.progress : (i.status === ChecklistStatus.Completed ? 100 : 0);
                        return acc + p;
                    }, 0);
                    envProgress = Math.round(totalItemsProgressSum / totalItems);
                }
                totalEnvsProgressSum += envProgress;

                const pendingItems = assemblyItems.filter(i => i.status !== ChecklistStatus.Completed);
                let rowHeight = 7;
                let pendingText = "";
                if (envProgress < 100 && pendingItems.length > 0) {
                    pendingText = "Pendências: " + pendingItems.map(i => i.description).join(", ");
                    const splitPending = pdf.splitTextToSize(pendingText, pageWidth - (margin * 2) - 10);
                    rowHeight += (splitPending.length * 3) + 1;
                }

                checkPageBreak(rowHeight);
                pdf.setDrawColor(230).setLineWidth(0.1).line(margin, yPos + rowHeight, pageWidth - margin, yPos + rowHeight);
                pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(50);
                let x = margin + 2;
                pdf.text(env.name, x, yPos + 4.5); x += colWidths.env;
                pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(80);
                pdf.text(env.assembler || '---', x, yPos + 4.5); x += colWidths.assembler;
                pdf.text(formatDate(env.scheduledStart), x, yPos + 4.5); x += colWidths.start;
                pdf.text(formatDate(env.scheduledEnd), x, yPos + 4.5); x += colWidths.prev;
                if (env.completionDate) {
                    pdf.setFont('helvetica', 'bold').setTextColor(21, 128, 61);
                    pdf.text(formatDate(env.completionDate), x, yPos + 4.5);
                } else {
                    pdf.text('---', x, yPos + 4.5);
                }
                x += colWidths.end;
                pdf.setFont('helvetica', 'bold');
                if (envProgress === 100) {
                    pdf.setTextColor(21, 128, 61);
                    pdf.text("OK", x, yPos + 4.5);
                } else {
                    pdf.setTextColor(37, 99, 235);
                    pdf.text(`${envProgress}%`, x, yPos + 4.5);
                }
                if (pendingText) {
                    pdf.setFont('helvetica', 'italic').setFontSize(6.5).setTextColor(120);
                    const splitPending = pdf.splitTextToSize(pendingText, pageWidth - (margin * 2) - 10);
                    pdf.text(splitPending, margin + 5, yPos + 7.5);
                }
                yPos += rowHeight;
            }

            const globalComp = sortedEnvs.length > 0 ? Math.round(totalEnvsProgressSum / sortedEnvs.length) : 0;
            yPos += 5;
            checkPageBreak(12);
            pdf.setFillColor(241, 245, 249).rect(margin, yPos, pageWidth - (margin * 2), 8, 'F');
            pdf.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(30);
            pdf.text(`PROGRESSO MÉDIO DA OBRA: ${globalComp}%`, margin + 3, yPos + 5.5);
            yPos += 12;

            // --- PHOTO APPENDIX SECTION ---
            checkPageBreak(20);
            pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(50);
            pdf.text("ANEXO FOTOGRÁFICO POR AMBIENTE", margin, yPos);
            pdf.setDrawColor(200).setLineWidth(0.2).line(margin, yPos + 2, pageWidth - margin, yPos + 2);
            yPos += 10;

            const imgWidth = 43; // 4 images per row
            const imgHeight = 35;
            const imgGap = 4;
            const itemsPerRow = 4;

            for (const env of sortedEnvs) {
                // Collect all images from non-delivery items
                const envMedia: Media[] = env.checklist
                    .filter(i => !i.isDelivery)
                    .flatMap(i => i.media)
                    .filter(m => m.type === 'image');

                if (envMedia.length === 0) continue;

                checkPageBreak(15);
                pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(70);
                pdf.setFillColor(248, 250, 252).rect(margin, yPos, pageWidth - (margin * 2), 5, 'F');
                pdf.text(`AMBIENTE: ${env.name.toUpperCase()}`, margin + 2, yPos + 3.5);
                yPos += 8;

                let rowCount = 0;
                let colCount = 0;

                for (const media of envMedia) {
                    const neededHeight = imgHeight + 10;
                    if (checkPageBreak(neededHeight)) {
                        // Redraw environment name if page broke
                        pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(70);
                        pdf.setFillColor(248, 250, 252).rect(margin, yPos, pageWidth - (margin * 2), 5, 'F');
                        pdf.text(`AMBIENTE: ${env.name.toUpperCase()} (CONT.)`, margin + 2, yPos + 3.5);
                        yPos += 8;
                        rowCount = 0;
                        colCount = 0;
                    }

                    const x = margin + (colCount * (imgWidth + imgGap));
                    const y = yPos;

                    try {
                        const url = getDisplayableDriveUrl(media.url);
                        const response = await fetch(url);
                        const blob = await response.blob();
                        const base64 = await blobToBase64(blob);
                        pdf.setDrawColor(220).setLineWidth(0.1).rect(x, y, imgWidth, imgHeight);
                        pdf.addImage(base64, 'JPEG', x + 0.5, y + 0.5, imgWidth - 1, imgHeight - 1, undefined, 'FAST');
                        
                        if (media.observation) {
                            pdf.setFont('helvetica', 'italic').setFontSize(5.5).setTextColor(100);
                            const splitObs = pdf.splitTextToSize(media.observation, imgWidth);
                            pdf.text(splitObs, x, y + imgHeight + 2.5);
                        }
                    } catch (e) {
                        pdf.setFontSize(6).text("[Erro carregar imagem]", x + 5, y + 15);
                    }

                    colCount++;
                    if (colCount >= itemsPerRow) {
                        colCount = 0;
                        yPos += imgHeight + 12;
                        rowCount++;
                    }
                }
                
                // If the last row wasn't completed, move yPos manually
                if (colCount > 0) {
                    yPos += imgHeight + 12;
                }
                yPos += 5; // Spacing between environments
            }

            pdf.save(`relatorio_tecnico_${client.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
        } catch (error) {
            console.error(error);
            alert("Erro ao gerar o PDF.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Modal onClose={onClose}>
            <div className="p-4 text-center">
                <DocumentTextIcon className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-slate-800 mb-2">Relatório de Montagem</h2>
                <div className="text-left bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 text-xs text-slate-600 space-y-2">
                    <p>• <b>Tabela Técnica:</b> Resumo de datas e progresso de cada ambiente.</p>
                    <p>• <b>Anexo Fotográfico:</b> Fotos organizadas e separadas por ambiente abaixo da tabela.</p>
                    <p>• <b>Layout Compacto:</b> Documento otimizado para visualização técnica e economia de papel.</p>
                    <p>• <b>Pendências:</b> Detalhamento do que falta nos ambientes incompletos.</p>
                </div>
                <div className="flex justify-center gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200 transition-colors">
                        Cancelar
                    </button>
                    <button 
                        onClick={handleGeneratePdf} 
                        disabled={isGenerating}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md flex items-center gap-2 disabled:opacity-50"
                    >
                        {isGenerating ? 'Processando Imagens...' : 'Gerar Relatório com Fotos'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ReportModal;
