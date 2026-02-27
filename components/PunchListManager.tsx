import React, { useState, useRef, useEffect } from 'react';
import { Client, PunchList, PunchListItem, PunchListIssue, Assembler, Media } from '../types';
import { SCRIPT_URL, generateUUID } from '../App';
import { fetchWithRetry } from '../utils/api';
import Modal from './Modal';
import {
    ClipboardCheckIcon,
    PlusCircleIcon,
    TrashIcon,
    ChevronRightIcon,
    UserIcon,
    CalendarIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    CameraIcon,
    RefreshIcon,
    PencilIcon,
    XIcon,
    ChevronLeftIcon,
    ZoomInIcon,
    ZoomOutIcon,
    PrinterIcon,
    CubeIcon,
    ClipboardListIcon,
    ShareIcon,
    DownloadIcon
} from './icons';

// --- Helpers ---
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

interface PunchListManagerProps {
    client: Client;
    assemblers: Assembler[];
    onUpdateClient: (client: Client) => void;
}

interface EditingState {
    id: string;
    type: 'list' | 'item' | 'issue';
    text: string;
}

const PunchListManager: React.FC<PunchListManagerProps> = ({ client, assemblers, onUpdateClient }) => {
    const [expandedListId, setExpandedListId] = useState<string | null>(null);
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
    const [newListTitle, setNewListTitle] = useState('');
    const [newItemDesc, setNewItemDesc] = useState('');
    const [newIssueTexts, setNewIssueTexts] = useState<Record<string, string>>({}); 
    
    const [uploadingIds, setUploadingIds] = useState<string[]>([]);
    const [mediaViewer, setMediaViewer] = useState<{ list: Media[], index: number } | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    
    // Editing State
    const [editing, setEditing] = useState<EditingState | null>(null);
    
    // Obs Editing State (Local temp state for inputs to avoid stutter)
    const [editingObservation, setEditingObservation] = useState<{ id: string, text: string } | null>(null);

    // Zoom State
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });

    const punchLists = client.punchLists || [];
    
    // REF para acessar o estado mais recente dentro de funções assíncronas (upload)
    const punchListsRef = useRef(punchLists);
    useEffect(() => {
        punchListsRef.current = punchLists;
    }, [punchLists]);

    const handleAddList = (e: React.FormEvent) => {
        e.preventDefault();
        if(!newListTitle.trim()) return;
        const newList: PunchList = {
            id: generateUUID(),
            title: newListTitle.trim(),
            items: []
        };
        onUpdateClient({ ...client, punchLists: [newList, ...punchLists] });
        setNewListTitle('');
        setExpandedListId(newList.id);
    };

    const handleDeleteList = (listId: string) => {
        if(!window.confirm("Excluir esta lista de pendências e todos os seus itens?")) return;
        onUpdateClient({ ...client, punchLists: punchLists.filter(l => l.id !== listId) });
    };

    const handleAddItem = (listId: string) => {
        if(!newItemDesc.trim()) return;
        const updatedLists = punchLists.map(list => {
            if(list.id === listId) {
                const newItem: PunchListItem = {
                    id: generateUUID(),
                    description: newItemDesc.trim(),
                    media: [],
                    issues: [],
                    status: 'Pending',
                    creationDate: new Date().toISOString()
                };
                return { ...list, items: [...list.items, newItem] };
            }
            return list;
        });
        onUpdateClient({ ...client, punchLists: updatedLists });
        setNewItemDesc('');
    };

    const handleDeleteItem = (listId: string, itemId: string) => {
        if(!window.confirm("Excluir este local?")) return;
        const updatedLists = punchLists.map(list => {
            if(list.id === listId) {
                return { ...list, items: list.items.filter(i => i.id !== itemId) };
            }
            return list;
        });
        onUpdateClient({ ...client, punchLists: updatedLists });
    };

    const handleAddIssue = (listId: string, itemId: string) => {
        const text = newIssueTexts[itemId];
        if(!text?.trim()) return;

        const updatedLists = punchLists.map(list => {
            if(list.id === listId) {
                const updatedItems = list.items.map(item => {
                    if(item.id === itemId) {
                        const newIssue: PunchListIssue = {
                            id: generateUUID(),
                            description: text.trim(),
                            status: 'Pending',
                            media: [],
                            creationDate: new Date().toISOString(),
                            category: 'Geral'
                        };
                        return { ...item, issues: [...(item.issues || []), newIssue] };
                    }
                    return item;
                });
                return { ...list, items: updatedItems };
            }
            return list;
        });
        onUpdateClient({ ...client, punchLists: updatedLists });
        setNewIssueTexts(prev => ({ ...prev, [itemId]: '' }));
    };

    const updateIssue = (itemId: string, updatedIssue: PunchListIssue) => {
        const updatedLists = punchLists.map(list => {
            const hasItem = list.items.some(i => i.id === itemId);
            if(hasItem) {
                const updatedItems = list.items.map(item => {
                    if(item.id === itemId) {
                        return { 
                            ...item, 
                            issues: item.issues.map(iss => iss.id === updatedIssue.id ? updatedIssue : iss) 
                        };
                    }
                    return item;
                });
                return { ...list, items: updatedItems };
            }
            return list;
        });
        onUpdateClient({ ...client, punchLists: updatedLists });
    };

    const deleteIssue = (listId: string, itemId: string, issueId: string) => {
        if(!window.confirm("Excluir pendência?")) return;
        const updatedLists = punchLists.map(list => {
            if(list.id === listId) {
                const updatedItems = list.items.map(item => {
                    if(item.id === itemId) {
                        return { ...item, issues: item.issues.filter(iss => iss.id !== issueId) };
                    }
                    return item;
                });
                return { ...list, items: updatedItems };
            }
            return list;
        });
        onUpdateClient({ ...client, punchLists: updatedLists });
    };

    // --- WHATSAPP SHARE ---
    const handleShareWhatsapp = (itemDesc: string, issue: PunchListIssue) => {
        const images = issue.media.filter(m => m.type === 'image');
        
        let msg = `*PENDÊNCIA - TODESCHINI*\n`;
        msg += `*Cliente:* ${client.name}\n`;
        msg += `*Local:* ${itemDesc}\n`;
        msg += `*Descrição:* ${issue.description}\n`;
        if(issue.observations) msg += `*Obs:* ${issue.observations}\n`;
        
        if (images.length > 0) {
            let hasBlob = false;
            msg += `\n*Fotos:*\n`;
            images.forEach(img => {
                if(img.url.startsWith('blob:')) {
                    hasBlob = true;
                } else {
                    msg += `${img.url}\n`;
                }
            });

            if(hasBlob) {
                alert("Algumas imagens ainda estão sendo enviadas para o servidor. Aguarde o upload completo para gerar os links corretamente.");
                return;
            }
        } else {
            msg += `\n_(Sem fotos anexadas)_\n`;
        }

        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // --- EDITING HANDLERS ---
    const startEditing = (id: string, type: 'list' | 'item' | 'issue', currentText: string) => {
        setEditing({ id, type, text: currentText });
    };

    const saveEditing = () => {
        if (!editing) return;
        const { id, type, text } = editing;
        if (!text.trim()) { setEditing(null); return; }

        let updatedLists = [...punchLists];

        if (type === 'list') {
            updatedLists = updatedLists.map(l => l.id === id ? { ...l, title: text } : l);
        } else if (type === 'item') {
            updatedLists = updatedLists.map(l => ({
                ...l,
                items: l.items.map(i => i.id === id ? { ...i, description: text } : i)
            }));
        } else if (type === 'issue') {
            updatedLists = updatedLists.map(l => ({
                ...l,
                items: l.items.map(i => ({
                    ...i,
                    issues: i.issues.map(iss => iss.id === id ? { ...iss, description: text } : iss)
                }))
            }));
        }

        onUpdateClient({ ...client, punchLists: updatedLists });
        setEditing(null);
    };

    // --- OBSERVATION EDITING (SAFE MODE) ---
    const handleObsChange = (issueId: string, text: string) => {
        setEditingObservation({ id: issueId, text });
    };

    const handleObsBlur = (itemId: string, issue: PunchListIssue) => {
        if (editingObservation && editingObservation.id === issue.id) {
            updateIssue(itemId, { ...issue, observations: editingObservation.text });
            setEditingObservation(null);
        }
    };

    const handleGenerateListPDF = async (list: PunchList) => {
        setIsGeneratingPdf(true);
        try {
            if (!(window as any).jspdf) throw new Error("Biblioteca PDF não carregada.");
            const { jsPDF } = (window as any).jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            let y = margin;

            // --- HEADER ---
            pdf.setFont('helvetica', 'bold').setFontSize(14).setTextColor(0);
            pdf.text("CHECKLIST DE PENDÊNCIAS PÓS-OBRA", margin, y + 5);
            
            pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100);
            pdf.text(`EMISSÃO: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - margin, y + 5, { align: 'right' });
            y += 10;

            pdf.setFont('helvetica', 'normal').setFontSize(10).setTextColor(0);
            pdf.text(`CLIENTE: ${client.name.toUpperCase()}`, margin, y);
            y += 5;

            const startDate = client.startDate ? new Date(client.startDate).toLocaleDateString('pt-BR') : '--/--/----';
            const resp = client.assembler ? client.assembler : '---';
            
            pdf.setFontSize(9).setTextColor(80);
            pdf.text(`Lista: ${list.title} | Início: ${startDate} | Responsável: ${resp}`, margin, y);
            y += 3;
            
            pdf.setDrawColor(200);
            pdf.setLineWidth(0.2);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 8;

            const pendingIssues: Array<{ item: PunchListItem, issue: PunchListIssue }> = [];
            const completedIssues: Array<{ item: PunchListItem, issue: PunchListIssue }> = [];

            list.items.forEach(item => {
                if (item.issues && item.issues.length > 0) {
                    item.issues.forEach(issue => {
                        if (issue.status === 'Completed') {
                            completedIssues.push({ item, issue });
                        } else {
                            pendingIssues.push({ item, issue });
                        }
                    });
                } else if (item.status === 'Pending') {
                    const dummyIssue: PunchListIssue = {
                        id: generateUUID(),
                        description: "Verificar item",
                        status: 'Pending',
                        category: 'Geral',
                        creationDate: new Date().toISOString(),
                        media: []
                    };
                    pendingIssues.push({ item, issue: dummyIssue });
                }
            });

            const checkPageBreak = (needed = 35) => {
                if (y + needed > pageHeight - margin) {
                    pdf.addPage();
                    y = margin;
                    return true;
                }
                return false;
            };

            if (pendingIssues.length > 0) {
                pdf.setFillColor(243, 244, 246);
                pdf.rect(margin, y, pageWidth - 2 * margin, 6, 'F');
                pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(180, 0, 0);
                pdf.text("1. PENDÊNCIAS A REALIZAR", margin + 3, y + 4.5);
                y += 8;

                let lastLocationId = "";

                for (const { item, issue } of pendingIssues) {
                    checkPageBreak(40);
                    if (y <= margin + 5) lastLocationId = ""; 

                    const verticalLineX = margin + 6;
                    const contentX = verticalLineX + 4;

                    if (item.id !== lastLocationId) {
                        if (y > margin + 10) y += 2;
                        pdf.setFillColor(248, 250, 252);
                        pdf.rect(margin, y, pageWidth - 2 * margin, 5, 'F');
                        pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(30, 41, 59);
                        pdf.text(`LOCAL: ${item.description.toUpperCase()}${y <= margin + 10 && lastLocationId ? ' (CONT.)' : ''}`, margin + 2, y + 3.5);
                        y += 6; 
                        lastLocationId = item.id;
                    } else {
                        pdf.setDrawColor(220);
                        pdf.setLineWidth(0.1);
                        pdf.line(contentX, y, pageWidth - margin, y);
                        y += 3;
                    }

                    const blockStartY = y;
                    pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(0);
                    const descText = issue.description || '';
                    const splitDesc = pdf.splitTextToSize(descText, pageWidth - margin - contentX);
                    pdf.text(splitDesc, contentX, y + 3);
                    y += (splitDesc.length * 4) + 1;

                    const images = issue.media.filter(m => m.type === 'image');
                    if (images.length > 0) {
                        const imgSize = 22;
                        const gap = 2;
                        let imgX = contentX;
                        if (checkPageBreak(imgSize + 5)) {
                            lastLocationId = ""; 
                            pdf.setFillColor(248, 250, 252);
                            pdf.rect(margin, y, pageWidth - 2 * margin, 5, 'F');
                            pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(30, 41, 59);
                            pdf.text(`LOCAL: ${item.description.toUpperCase()} (CONT.)`, margin + 2, y + 3.5);
                            y += 6;
                        }
                        for (const img of images) {
                            try {
                                const url = getDisplayableDriveUrl(img.url);
                                const resp = await fetch(url);
                                const blob = await resp.blob();
                                const base64 = await blobToBase64(blob);
                                pdf.addImage(base64, 'JPEG', imgX, y, imgSize, imgSize, undefined, 'FAST');
                                imgX += imgSize + gap;
                            } catch (e) {}
                        }
                        y += imgSize + 3;
                    }

                    if (issue.observations) {
                        pdf.setFont('helvetica', 'italic').setFontSize(7).setTextColor(100);
                        const splitObs = pdf.splitTextToSize(`Obs: ${issue.observations}`, pageWidth - margin - contentX);
                        pdf.text(splitObs, contentX, y + 3);
                        y += splitObs.length * 3.5;
                    } else {
                        y += 2;
                    }

                    const checkboxY = y + 1;
                    if (checkPageBreak(8)) { lastLocationId = ""; }
                    if (y === margin) {
                         pdf.setFillColor(248, 250, 252);
                         pdf.rect(margin, y, pageWidth - 2 * margin, 5, 'F');
                         pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(30, 41, 59);
                         pdf.text(`LOCAL: ${item.description.toUpperCase()} (CONT.)`, margin + 2, y + 3.5);
                         y += 6;
                    }

                    pdf.setFont('helvetica', 'bold').setFontSize(7).setTextColor(80);
                    pdf.text("CONCLUÍDO:", contentX, y + 2.5);
                    const simBoxX = contentX + 20;
                    pdf.setDrawColor(100);
                    pdf.setLineWidth(0.1);
                    pdf.rect(simBoxX, y, 3, 3);
                    pdf.text("SIM", simBoxX + 4, y + 2.5);
                    const naoBoxX = simBoxX + 12;
                    pdf.rect(naoBoxX, y, 3, 3);
                    pdf.text("NÃO", naoBoxX + 4, y + 2.5);
                    const motivoX = naoBoxX + 15;
                    pdf.text("MOTIVO:", motivoX, y + 2.5);
                    pdf.setDrawColor(200);
                    pdf.setLineWidth(0.1);
                    pdf.line(motivoX + 12, y + 2.5, pageWidth - margin, y + 2.5);
                    y += 6; 

                    const blockEndY = y - 1;
                    pdf.setDrawColor(200, 200, 200);
                    pdf.setLineWidth(0.5);
                    pdf.line(verticalLineX, blockStartY, verticalLineX, blockEndY);
                    y += 1;
                }
            }

            if (completedIssues.length > 0) {
                checkPageBreak(30);
                pdf.setFillColor(243, 244, 246);
                pdf.rect(margin, y, pageWidth - 2 * margin, 6, 'F');
                pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(22, 163, 74);
                pdf.text("2. PENDÊNCIAS CONCLUÍDAS", margin + 3, y + 4.5);
                y += 8;

                let lastLocationId = "";
                for (const { item, issue } of completedIssues) {
                    checkPageBreak(35);
                    if (y <= margin + 5) lastLocationId = "";
                    const verticalLineX = margin + 6;
                    const contentX = verticalLineX + 4;

                    if (item.id !== lastLocationId) {
                        if (y > margin + 10) y += 2;
                        pdf.setFillColor(248, 250, 252);
                        pdf.rect(margin, y, pageWidth - 2 * margin, 5, 'F');
                        pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(30, 41, 59);
                        pdf.text(`LOCAL: ${item.description.toUpperCase()}${y <= margin + 10 && lastLocationId ? ' (CONT.)' : ''}`, margin + 2, y + 3.5);
                        y += 6;
                        lastLocationId = item.id;
                    } else {
                        pdf.setDrawColor(220);
                        pdf.setLineWidth(0.1);
                        pdf.line(contentX, y, pageWidth - margin, y);
                        y += 3;
                    }

                    const blockStartY = y;
                    pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(0);
                    const descText = issue.description || '';
                    const splitDesc = pdf.splitTextToSize(descText, pageWidth - margin - contentX);
                    pdf.text(splitDesc, contentX, y + 3);
                    const compDate = issue.completionDate ? new Date(issue.completionDate).toLocaleDateString('pt-BR') : '---';
                    pdf.setFont('helvetica', 'bold').setFontSize(7).setTextColor(22, 163, 74);
                    pdf.text(`CONCLUÍDO EM: ${compDate}`, pageWidth - margin - 5, y + 3, { align: 'right' });
                    y += (splitDesc.length * 4) + 1;

                    if (issue.observations) {
                        pdf.setTextColor(100).setFont('helvetica', 'italic').setFontSize(7);
                        const splitObs = pdf.splitTextToSize(`Obs: ${issue.observations}`, pageWidth - margin - contentX);
                        pdf.text(splitObs, contentX, y + 3);
                        y += splitObs.length * 3.5;
                    } else {
                        y += 2;
                    }

                    const images = issue.media.filter(m => m.type === 'image');
                    if (images.length > 0) {
                        const imgSize = 22;
                        const gap = 2;
                        let imgX = contentX;
                        if (checkPageBreak(imgSize + 5)) {
                             lastLocationId = "";
                             pdf.setFillColor(248, 250, 252);
                             pdf.rect(margin, y, pageWidth - 2 * margin, 5, 'F');
                             pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(30, 41, 59);
                             pdf.text(`LOCAL: ${item.description.toUpperCase()} (CONT.)`, margin + 2, y + 3.5);
                             y += 6;
                        }
                        for (const img of images) {
                            try {
                                const url = getDisplayableDriveUrl(img.url);
                                const resp = await fetch(url);
                                const blob = await resp.blob();
                                const base64 = await blobToBase64(blob);
                                pdf.addImage(base64, 'JPEG', imgX, y, imgSize, imgSize, undefined, 'FAST');
                                imgX += imgSize + gap;
                            } catch (e) {}
                        }
                        y += imgSize + 3;
                    } else {
                        y += 2;
                    }
                    y += 2;
                    const blockEndY = y - 1;
                    pdf.setDrawColor(200, 200, 200);
                    pdf.setLineWidth(0.5);
                    pdf.line(verticalLineX, blockStartY, verticalLineX, blockEndY);
                    y += 2;
                }
            }

            checkPageBreak(35);
            y += 10;
            pdf.setDrawColor(0);
            pdf.setLineWidth(0.3);
            pdf.line(margin, y, margin + 80, y);
            pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(0);
            pdf.text("ASSINATURA RESPONSÁVEL", margin, y + 4);
            pdf.setFont('helvetica', 'normal');
            pdf.text(resp, margin, y + 8);
            pdf.text("Data: ____ / ____ / ______", pageWidth - margin - 50, y + 4);

            const pageCount = pdf.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8).setTextColor(150);
                pdf.text(`${client.name} - Checklist de Pendências Pós-Obra`, margin, pageHeight - 10);
                pdf.text(`Página ${i}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
            }

            pdf.save(`pendencias_${list.title.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (e) {
            console.error(e);
            alert("Erro ao gerar PDF.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, issueId: string, itemId: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingIds(prev => [...prev, issueId]);
        const tempId = generateUUID();
        const localUrl = URL.createObjectURL(file);
        
        let targetListId = '';
        
        // Use punchListsRef.current to get the LATEST state before async op
        const currentPunchLists = punchListsRef.current;
        const listsCopy = JSON.parse(JSON.stringify(currentPunchLists));
        
        for(const l of listsCopy) {
            for(const i of l.items) {
                if(i.id === itemId) {
                    targetListId = l.id;
                    const issue = i.issues.find((iss: PunchListIssue) => iss.id === issueId);
                    if(issue) {
                        // Fix for TypeScript type narrowing: explicitly cast added media object to Media
                        issue.media = [...(issue.media || []), { id: tempId, type: 'image' as const, url: localUrl, name: file.name } as Media];
                    }
                }
            }
        }
        
        // Optimistic Update
        onUpdateClient({ ...client, punchLists: listsCopy });

        try {
            const { base64: base64Data, mimeType } = await compressImage(file);
            const response = await fetchWithRetry(SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'UPLOAD_FILE',
                    data: { base64Data, fileName: file.name, mimeType: mimeType }
                }),
            });
            const result = await response.json();
            if (!result.success || !result.url) throw new Error(result.message || 'Falha no upload');

            // CRITICAL: Use ref again to get latest state (which includes text changes made during upload)
            const latestLists = punchListsRef.current;
            
            const finalLists: PunchList[] = latestLists.map(l => {
                if (l.id === targetListId) {
                    return {
                        ...l,
                        items: l.items.map(i => {
                            if (i.id === itemId) {
                                return {
                                    ...i,
                                    issues: i.issues.map(iss => {
                                        if (iss.id === issueId) {
                                            // Ensure we update the correct media item in the current state list
                                            const currentMedia = iss.media || [];
                                            // Check if temp media exists in current state (it should from optimistic update)
                                            const hasTemp = currentMedia.some(m => m.id === tempId);
                                            
                                            if (hasTemp) {
                                                return {
                                                    ...iss,
                                                    // Fix for TypeScript type narrowing: ensure updated media item is typed as Media
                                                    media: currentMedia.map(m => m.id === tempId ? ({ ...m, url: result.url } as Media) : m)
                                                };
                                            } else {
                                                // Fallback if state was completely reset (rare but possible)
                                                return {
                                                    ...iss,
                                                    // Fix for TypeScript type narrowing: ensure fallback media item is typed as Media
                                                    media: [...currentMedia, { id: tempId, type: 'image' as const, url: result.url, name: file.name } as Media]
                                                };
                                            }
                                        }
                                        return iss;
                                    })
                                };
                            }
                            return i;
                        })
                    };
                }
                return l;
            });
            
            onUpdateClient({ ...client, punchLists: finalLists });
            URL.revokeObjectURL(localUrl);

        } catch (error: any) {
            alert(`Erro no upload: ${error.message}`);
            // Revert on error using latest state
            const latestListsWithError = punchListsRef.current;
            const revertedLists = latestListsWithError.map(l => {
                if(l.id === targetListId) {
                    return {
                        ...l,
                        items: l.items.map(i => {
                            if(i.id === itemId) {
                                return {
                                    ...i,
                                    issues: i.issues.map(iss => {
                                        if(iss.id === issueId) {
                                            return { ...iss, media: (iss.media || []).filter(m => m.id !== tempId) };
                                        }
                                        return iss;
                                    })
                                };
                            }
                            return i;
                        })
                    };
                }
                return l;
            });
            onUpdateClient({ ...client, punchLists: revertedLists });
        } finally {
            setUploadingIds(prev => prev.filter(id => id !== issueId));
        }
    };

    const removeMedia = (mediaId: string, issueId: string, itemId: string) => {
        if(!window.confirm("Remover anexo?")) return;
        // Use ref for remove as well to be safe
        const currentLists = punchListsRef.current;
        const updatedLists = currentLists.map(list => {
            const hasItem = list.items.some(i => i.id === itemId);
            if(hasItem) {
                const updatedItems = list.items.map(item => {
                    if(item.id === itemId) {
                        return {
                            ...item,
                            issues: item.issues.map(iss => {
                                if(iss.id === issueId) {
                                    return { ...iss, media: iss.media.filter(m => m.id !== mediaId) };
                                }
                                return iss;
                            })
                        };
                    }
                    return item;
                });
                return { ...list, items: updatedItems };
            }
            return list;
        });
        onUpdateClient({ ...client, punchLists: updatedLists });
    };

    // --- NOVA FUNÇÃO DE DOWNLOAD ---
    const handleDownloadMedia = async (media: Media) => {
        try {
            const url = getDisplayableDriveUrl(media.url);
            // Tenta fetch para criar blob e forçar download com nome correto
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error('Network response was not ok');
            
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = media.name || `imagem-${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (e) {
            console.warn("Download direto falhou, abrindo em nova aba.", e);
            // Fallback: abrir em nova aba
            window.open(getDisplayableDriveUrl(media.url), '_blank');
        }
    };

    return (
        <div className="space-y-6 font-montserrat animate-fadeIn">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2 mb-4">
                    <ClipboardCheckIcon className="w-6 h-6 text-blue-600" />
                    Listas de Pendências (Pós-Obra)
                </h3>
                
                <form onSubmit={handleAddList} className="flex gap-2">
                    <input 
                        type="text" 
                        value={newListTitle} 
                        onChange={e => setNewListTitle(e.target.value)} 
                        placeholder="Nova Lista (Ex: Cozinha, Geral, Banheiros...)" 
                        className="flex-grow p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-md flex items-center gap-2">
                        <PlusCircleIcon className="w-4 h-4"/> Criar
                    </button>
                </form>
            </div>

            <div className="space-y-4">
                {punchLists.length === 0 && (
                    <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                        <ClipboardListIcon className="w-12 h-12 text-slate-300 mx-auto mb-2"/>
                        <p className="text-slate-500 font-bold text-sm">Nenhuma lista de pendências.</p>
                        <p className="text-slate-400 text-xs">Crie uma lista (ex: "Vistoria Final") para começar.</p>
                    </div>
                )}

                {punchLists.map(list => (
                    <div key={list.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <div 
                            className="bg-slate-100 p-4 flex justify-between items-center cursor-pointer hover:bg-slate-200 transition-colors"
                            onClick={() => setExpandedListId(expandedListId === list.id ? null : list.id)}
                        >
                            <div className="flex items-center gap-3 flex-grow min-w-0">
                                {expandedListId === list.id ? <ChevronRightIcon className="w-4 h-4 rotate-90"/> : <ChevronRightIcon className="w-4 h-4"/>}
                                {editing?.id === list.id && editing.type === 'list' ? (
                                    <div className="flex items-center gap-2 w-full" onClick={e => e.stopPropagation()}>
                                        <input 
                                            autoFocus
                                            type="text" 
                                            value={editing.text} 
                                            onChange={e => setEditing({...editing, text: e.target.value})}
                                            className="font-bold text-slate-700 uppercase text-sm border-b border-blue-500 outline-none bg-transparent w-full"
                                            onKeyDown={e => { if(e.key === 'Enter') saveEditing(); }}
                                            onBlur={saveEditing}
                                        />
                                    </div>
                                ) : (
                                    <h4 className="font-bold text-slate-800 uppercase flex items-center gap-2 group">
                                        {list.title}
                                        <button onClick={(e) => { e.stopPropagation(); startEditing(list.id, 'list', list.title); }} className="text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <PencilIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </h4>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 font-medium bg-white px-2 py-1 rounded-full border border-slate-200">
                                    {list.items.reduce((acc, i) => acc + (i.issues?.length || 0), 0)} pendências
                                </span>
                                <button onClick={(e) => { e.stopPropagation(); handleGenerateListPDF(list); }} disabled={isGeneratingPdf} className="text-slate-400 hover:text-blue-600 p-1.5" title="Gerar PDF">
                                    <PrinterIcon className="w-4 h-4"/>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id); }} className="text-slate-400 hover:text-red-500 p-1.5">
                                    <TrashIcon className="w-4 h-4"/>
                                </button>
                            </div>
                        </div>

                        {expandedListId === list.id && (
                            <div className="p-4 bg-slate-50 border-t border-slate-200">
                                {/* Item Creator (Location) */}
                                <div className="flex gap-2 mb-4">
                                    <input 
                                        type="text" 
                                        value={newItemDesc} 
                                        onChange={e => setNewItemDesc(e.target.value)} 
                                        placeholder="Novo Local (ex: Cozinha, Quarto 1...)" 
                                        className="flex-grow p-2 border border-slate-300 rounded text-sm"
                                    />
                                    <button onClick={() => handleAddItem(list.id)} className="bg-slate-700 text-white px-3 py-2 rounded font-bold text-xs uppercase hover:bg-slate-800">
                                        Adicionar Local
                                    </button>
                                </div>

                                {/* Items List */}
                                <div className="space-y-3">
                                    {list.items.length === 0 && <p className="text-center text-slate-400 italic text-xs py-4">Nenhum local adicionado.</p>}
                                    {list.items.map(item => (
                                        <div key={item.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                            <div 
                                                className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 cursor-pointer"
                                                onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                                            >
                                                <div className="flex items-center gap-2 flex-grow">
                                                    <CubeIcon className="w-4 h-4 text-slate-400"/>
                                                    {editing?.id === item.id && editing.type === 'item' ? (
                                                        <input 
                                                            autoFocus
                                                            className="font-bold text-slate-700 text-sm border-b border-blue-500 outline-none w-full"
                                                            value={editing.text}
                                                            onChange={e => setEditing({...editing, text: e.target.value})}
                                                            onBlur={saveEditing}
                                                            onKeyDown={e => { if(e.key === 'Enter') saveEditing(); }}
                                                            onClick={e => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <span className="font-bold text-slate-700 text-sm flex items-center gap-2 group">
                                                            {item.description}
                                                            <button onClick={(e) => { e.stopPropagation(); startEditing(item.id, 'item', item.description); }} className="text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"><PencilIcon className="w-3 h-3"/></button>
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-bold border border-red-100">
                                                        {item.issues?.filter(i => i.status === 'Pending').length} Abertos
                                                    </span>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(list.id, item.id); }} className="text-slate-300 hover:text-red-500 ml-2">
                                                        <TrashIcon className="w-4 h-4"/>
                                                    </button>
                                                </div>
                                            </div>

                                            {expandedItemId === item.id && (
                                                <div className="p-3">
                                                    {/* Issues List */}
                                                    <div className="space-y-3">
                                                        {item.issues?.map(issue => {
                                                            const isCompleted = issue.status === 'Completed';
                                                            return (
                                                                <div key={issue.id} className={`p-3 rounded-lg border ${isCompleted ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'} transition-all`}>
                                                                    <div className="flex justify-between items-start gap-3">
                                                                        <div className="flex-grow min-w-0">
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <button 
                                                                                    onClick={() => updateIssue(item.id, { ...issue, status: isCompleted ? 'Pending' : 'Completed', completionDate: isCompleted ? undefined : new Date().toISOString() })}
                                                                                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-orange-300 text-transparent hover:border-green-500 bg-white'}`}
                                                                                >
                                                                                    <CheckCircleIcon className="w-3 h-3"/>
                                                                                </button>
                                                                                
                                                                                {editing?.id === issue.id && editing.type === 'issue' ? (
                                                                                    <input 
                                                                                        autoFocus
                                                                                        className="text-sm font-semibold text-slate-800 border-b border-blue-500 outline-none flex-grow bg-transparent"
                                                                                        value={editing.text}
                                                                                        onChange={e => setEditing({...editing, text: e.target.value})}
                                                                                        onBlur={saveEditing}
                                                                                        onKeyDown={e => { if(e.key === 'Enter') saveEditing(); }}
                                                                                    />
                                                                                ) : (
                                                                                    <span className={`text-sm font-semibold flex-grow flex items-center gap-2 group ${isCompleted ? 'text-green-800 line-through' : 'text-slate-800'}`}>
                                                                                        {issue.description}
                                                                                        <button onClick={() => startEditing(issue.id, 'issue', issue.description)} className="text-slate-400 hover:text-blue-500 opacity-0 group-hover:opacity-100"><PencilIcon className="w-3 h-3"/></button>
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            
                                                                            <div className="flex flex-wrap gap-2 mt-2">
                                                                                <select 
                                                                                    value={issue.category || 'Geral'} 
                                                                                    onChange={e => updateIssue(item.id, { ...issue, category: e.target.value as any })}
                                                                                    className={`text-[10px] font-bold uppercase border rounded px-1 py-0.5 text-slate-600 outline-none focus:ring-1 focus:ring-blue-400 ${isCompleted ? 'bg-white/50 border-green-200' : 'bg-white/50 border-orange-200'}`}
                                                                                >
                                                                                    <option value="Geral">Geral</option>
                                                                                    <option value="Falta">Falta</option>
                                                                                    <option value="Peça Batida">Peça Batida</option>
                                                                                </select>

                                                                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded border ${isCompleted ? 'bg-white/50 border-green-200' : 'bg-white/50 border-orange-200'}`}>
                                                                                    <UserIcon className="w-3 h-3 text-slate-400"/>
                                                                                    <select 
                                                                                        value={issue.assignedAssemblerId || ''} 
                                                                                        onChange={e => updateIssue(item.id, { ...issue, assignedAssemblerId: e.target.value })}
                                                                                        className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-24"
                                                                                    >
                                                                                        <option value="">Responsável</option>
                                                                                        {assemblers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                                                    </select>
                                                                                </div>

                                                                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded border ${isCompleted ? 'bg-white/50 border-green-200' : 'bg-white/50 border-orange-200'}`}>
                                                                                    <CalendarIcon className="w-3 h-3 text-slate-400"/>
                                                                                    <input 
                                                                                        type="date" 
                                                                                        value={issue.scheduledExecutionDate?.split('T')[0] || ''} 
                                                                                        onChange={e => updateIssue(item.id, { ...issue, scheduledExecutionDate: e.target.value })}
                                                                                        className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-20"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            <button onClick={() => handleShareWhatsapp(item.description, issue)} className="text-slate-300 hover:text-green-500" title="Enviar no WhatsApp">
                                                                                <ShareIcon className="w-4 h-4"/>
                                                                            </button>
                                                                            <button onClick={() => deleteIssue(list.id, item.id, issue.id)} className="text-slate-300 hover:text-red-500">
                                                                                <TrashIcon className="w-4 h-4"/>
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* Footer: Media & Observations */}
                                                                    <div className={`flex flex-col sm:flex-row gap-3 pl-7 mt-3 pt-2 border-t ${isCompleted ? 'border-green-200' : 'border-orange-200'}`}>
                                                                        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                                                                            {issue.media.map((m, idx) => (
                                                                                <div key={m.id} className="relative w-12 h-12 group flex-shrink-0">
                                                                                    <img src={getDisplayableDriveUrl(m.url)} className="w-full h-full object-cover rounded-lg border border-slate-200 cursor-pointer" onClick={() => setMediaViewer({ list: issue.media, index: idx })} />
                                                                                    <button onClick={() => removeMedia(m.id, issue.id, item.id)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px] shadow-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                                                                                </div>
                                                                            ))}
                                                                            <label className={`w-12 h-12 flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-colors flex-shrink-0 ${uploadingIds.includes(issue.id) ? 'opacity-50 cursor-not-allowed' : ''} ${isCompleted ? 'border-green-300 bg-green-100 hover:bg-white' : 'border-orange-300 bg-orange-100 hover:bg-white'}`}>
                                                                                {uploadingIds.includes(issue.id) ? <RefreshIcon className="w-4 h-4 animate-spin text-slate-400"/> : <CameraIcon className="w-5 h-5 text-slate-400"/>}
                                                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, issue.id, item.id)} disabled={uploadingIds.includes(issue.id)} />
                                                                            </label>
                                                                        </div>
                                                                        <div className={`w-full sm:flex-grow flex items-start gap-2 px-2 py-1.5 rounded-lg border ${isCompleted ? 'bg-white border-green-200' : 'bg-white border-orange-200'}`}>
                                                                            <PencilIcon className="w-3 h-3 text-slate-300 flex-shrink-0 mt-1"/>
                                                                            <textarea 
                                                                                value={editingObservation && editingObservation.id === issue.id ? editingObservation.text : (issue.observations || '')} 
                                                                                onChange={e => handleObsChange(issue.id, e.target.value)} 
                                                                                onBlur={e => handleObsBlur(item.id, issue)}
                                                                                placeholder="Observação técnica..." 
                                                                                className="text-[10px] outline-none bg-transparent flex-grow text-slate-600 resize-none min-h-[40px]"
                                                                                rows={2}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Issue Creator */}
                                                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                                                        <input 
                                                            type="text" 
                                                            value={newIssueTexts[item.id] || ''} 
                                                            onChange={e => setNewIssueTexts({...newIssueTexts, [item.id]: e.target.value})} 
                                                            onKeyDown={e => { if(e.key === 'Enter') handleAddIssue(list.id, item.id); }}
                                                            placeholder="Nova pendência neste item..." 
                                                            className="flex-grow p-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-orange-500 outline-none"
                                                        />
                                                        <button onClick={() => handleAddIssue(list.id, item.id)} className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded font-bold text-xs hover:bg-slate-300">
                                                            Adicionar
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* OVERLAY DE CARREGAMENTO NOVO */}
            {isGeneratingPdf && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 animate-fadeIn transform scale-100">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-slate-200 rounded-full"></div>
                            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                            <PrinterIcon className="w-6 h-6 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <div className="text-center">
                            <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-1">Montando Relatório</h4>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">MONTANDO E PREPARANDO IMPRESSÃO...</p>
                        </div>
                    </div>
                </div>
            )}

            {mediaViewer && mediaViewer.list.length > 0 && (
                <Modal onClose={() => setMediaViewer(null)} fullScreen={true}>
                    <div className="w-full h-full flex flex-col items-center justify-center relative touch-none bg-black/95">
                        <div className="flex-grow w-full h-full flex items-center justify-center overflow-hidden">
                            <img 
                                src={getDisplayableDriveUrl(mediaViewer.list[mediaViewer.index].url)} 
                                className="transition-transform duration-75 ease-out select-none max-h-full max-w-full object-contain"
                                style={{ transform: `scale(${zoomLevel}) translate(${panPosition.x}px, ${panPosition.y}px)` }}
                            />
                        </div>
                        
                        {/* Navigation */}
                        {mediaViewer.list.length > 1 && (
                            <>
                                <button 
                                    className="absolute left-4 top-1/2 -translate-y-1/2 p-4 bg-white/10 rounded-full hover:bg-white/20 text-white z-50 backdrop-blur-sm"
                                    onClick={(e) => { e.stopPropagation(); setMediaViewer(prev => prev ? { ...prev, index: (prev.index - 1 + prev.list.length) % prev.list.length } : null); }}
                                >
                                    <ChevronLeftIcon className="w-8 h-8"/>
                                </button>
                                <button 
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-4 bg-white/10 rounded-full hover:bg-white/20 text-white z-50 backdrop-blur-sm"
                                    onClick={(e) => { e.stopPropagation(); setMediaViewer(prev => prev ? { ...prev, index: (prev.index + 1) % prev.list.length } : null); }}
                                >
                                    <ChevronRightIcon className="w-8 h-8"/>
                                </button>
                            </>
                        )}

                        {/* Controls */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-6 bg-white/10 p-3 rounded-full backdrop-blur-md z-50">
                            {/* --- BOTÃO DE DOWNLOAD --- */}
                            <button 
                                onClick={() => handleDownloadMedia(mediaViewer.list[mediaViewer.index])} 
                                className="text-white hover:text-green-400 transition-colors" 
                                title="Baixar Imagem"
                            >
                                <DownloadIcon className="w-6 h-6"/>
                            </button>
                            <button onClick={() => setZoomLevel(z => Math.max(1, z - 0.5))} className="text-white hover:text-blue-300 transition-colors"><ZoomOutIcon className="w-6 h-6"/></button>
                            <button onClick={() => { setZoomLevel(1); setPanPosition({x:0, y:0}); }} className="text-white hover:text-blue-300 transition-colors"><RefreshIcon className="w-6 h-6"/></button>
                            <button onClick={() => setZoomLevel(z => Math.min(4, z + 0.5))} className="text-white hover:text-blue-300 transition-colors"><ZoomInIcon className="w-6 h-6"/></button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default PunchListManager;