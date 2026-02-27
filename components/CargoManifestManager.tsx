import React, { useState, useMemo } from 'react';
import { Client, CargoManifest, ShippingItem } from '../types';
import { generateUUID } from '../App';
import { TruckIcon, PlusCircleIcon, CalendarIcon, UserIcon, MapPinIcon, BoxIcon, TrashIcon, PrinterIcon, CheckCircleIcon, CubeIcon, ChevronRightIcon, ArrowLeftIcon } from './icons';
import { jsPDF } from 'jspdf';

interface CargoManifestManagerProps {
  clients: Client[];
  manifests: CargoManifest[];
  onUpdateClient: (client: Client) => void;
  onUpdateClientsBulk: (clients: Client[]) => void;
  onSaveManifests: (manifests: CargoManifest[]) => void;
}

const CargoManifestManager: React.FC<CargoManifestManagerProps> = ({ clients, manifests, onUpdateClient, onUpdateClientsBulk, onSaveManifests }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [viewingManifestId, setViewingManifestId] = useState<string | null>(null);
  
  // New Manifest State
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newDestination, setNewDestination] = useState('');
  const [newDriver, setNewDriver] = useState('');
  const [newVehicle, setNewVehicle] = useState('');
  
  // Selection State
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // --- Logic: Aggregation ---
  const allPendingItems = useMemo(() => {
      const list: Array<ShippingItem & { clientId: string, clientName: string, clientAddress: string, clientCity: string }> = [];
      clients.forEach(client => {
          if (client.shippingItems) {
              client.shippingItems.forEach(item => {
                  // FILTRO ESTRITO: Apenas itens 'Pending' que NÃO possuem manifestId e não foram enviados
                  // Adicionada checagem robusta de manifestId
                  const hasManifest = item.manifestId !== undefined && item.manifestId !== null && item.manifestId !== '';
                  if (item.status === 'Pending' && !hasManifest) {
                      const addressParts = client.address.split('-');
                      const city = addressParts.length > 2 ? addressParts[addressParts.length - 1].trim() : 'Geral';
                      list.push({ ...item, clientId: client.id, clientName: client.name, clientAddress: client.address, clientCity: city });
                  }
              });
          }
      });
      return list;
  }, [clients]);

  const itemsByCity = useMemo(() => {
      const groups: Record<string, typeof allPendingItems> = {};
      allPendingItems.forEach(item => {
          if (!groups[item.clientCity]) groups[item.clientCity] = [];
          groups[item.clientCity].push(item);
      });
      return groups;
  }, [allPendingItems]);

  const selectedTotals = useMemo(() => {
      const selectedItems = allPendingItems.filter(i => selectedItemIds.includes(i.id));
      const totalVolumes = selectedItems.reduce((acc, item) => acc + item.quantity, 0);
      return { itemsCount: selectedItems.length, volumesCount: totalVolumes };
  }, [allPendingItems, selectedItemIds]);

  // Sort manifests by date descending
  const sortedManifests = useMemo(() => {
      return [...manifests].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [manifests]);

  const activeManifest = manifests.find(m => m.id === viewingManifestId);

  // --- Actions ---
  const toggleItemSelection = (itemId: string) => {
      setSelectedItemIds(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
  };

  const selectAllInCity = (city: string) => {
      const idsInCity = itemsByCity[city].map(i => i.id);
      const allSelected = idsInCity.every(id => selectedItemIds.includes(id));
      setSelectedItemIds(prev => allSelected ? prev.filter(id => !idsInCity.includes(id)) : Array.from(new Set([...prev, ...idsInCity])));
  };

  const handleCreateManifest = () => {
      if (!newDestination || selectedItemIds.length === 0) {
          alert("Informe o destino e selecione pelo menos um item.");
          return;
      }

      const manifestId = generateUUID();
      const manifestDate = new Date(newDate).toISOString();
      const manifestItemsData = allPendingItems.filter(i => selectedItemIds.includes(i.id));
      
      const manifestItems = manifestItemsData.map(i => ({ 
          ...i, 
          status: 'Shipped' as const,
          manifestId: manifestId,
          shippedDate: manifestDate
      }));

      const newManifest: CargoManifest = {
          id: manifestId,
          date: manifestDate,
          destination: newDestination,
          driver: newDriver,
          vehicle: newVehicle,
          status: 'Open',
          items: manifestItems,
          createdAt: new Date().toISOString()
      };

      // Agrupar atualizações por cliente para salvar em lote (BULK)
      const affectedClientIds = Array.from(new Set(manifestItems.map(i => i.clientId)));
      const updatedClients: Client[] = [];

      affectedClientIds.forEach(clientId => {
          const client = clients.find(c => c.id === clientId);
          if (client && client.shippingItems) {
              const updatedShippingItems = client.shippingItems.map(item => {
                  if (selectedItemIds.includes(item.id)) {
                      return { 
                          ...item, 
                          status: 'Shipped' as const, 
                          manifestId: manifestId, 
                          shippedDate: manifestDate 
                      };
                  }
                  return item;
              });
              updatedClients.push({ ...client, shippingItems: updatedShippingItems });
          }
      });

      // Salva todos os clientes de uma vez e o romaneio
      onUpdateClientsBulk(updatedClients);
      onSaveManifests([newManifest, ...manifests]);

      setIsCreating(false);
      setNewDestination('');
      setNewDriver('');
      setNewVehicle('');
      setSelectedItemIds([]);
  };

  const handleDeleteManifest = (manifest: CargoManifest) => {
      if (window.confirm("ATENÇÃO: Ao excluir este romaneio, todos os itens voltarão para a fila de espera dos respectivos clientes. Deseja continuar?")) {
          const affectedClientIds = Array.from(new Set(manifest.items.map(i => i.clientId)));
          const updatedClients: Client[] = [];

          affectedClientIds.forEach(clientId => {
              const client = clients.find(c => c.id === clientId);
              if (client && client.shippingItems) {
                  const updatedItems = client.shippingItems.map(item => {
                      if (item.manifestId === manifest.id) {
                          return { ...item, status: 'Pending' as const, manifestId: undefined, shippedDate: undefined };
                      }
                      return item;
                  });
                  updatedClients.push({ ...client, shippingItems: updatedItems });
              }
          });

          onUpdateClientsBulk(updatedClients);
          onSaveManifests(manifests.filter(m => m.id !== manifest.id));
          setViewingManifestId(null);
      }
  };

  const generatePDF = (manifest: CargoManifest) => {
      const pdf = new jsPDF();
      const margin = 10;
      let yPos = margin;
      const totalVolumes = manifest.items.reduce((acc, i) => acc + i.quantity, 0);
      const totalItems = manifest.items.length;

      pdf.setFont('helvetica', 'bold').setFontSize(18);
      pdf.text("ROMANEIO DE CARGA", 105, yPos, { align: 'center' });
      yPos += 10;
      pdf.setFontSize(10).setDrawColor(0).rect(margin, yPos, 190, 25);
      pdf.text(`DATA: ${new Date(manifest.date).toLocaleDateString('pt-BR', {timeZone:'UTC'})}`, margin + 5, yPos + 7);
      pdf.text(`DESTINO: ${manifest.destination.toUpperCase()}`, margin + 5, yPos + 14);
      pdf.text(`MOTORISTA: ${manifest.driver || '---'}`, margin + 90, yPos + 7);
      pdf.text(`VEÍCULO: ${manifest.vehicle || '---'}`, margin + 90, yPos + 14);
      pdf.text(`ID: #${manifest.id.slice(0, 8)}`, margin + 5, yPos + 21);
      pdf.setFontSize(11).text(`TOTAL: ${totalItems} ITENS / ${totalVolumes} VOLUMES`, margin + 90, yPos + 21);
      yPos += 35;

      const itemsByClient: Record<string, typeof manifest.items> = {};
      manifest.items.forEach(item => {
          if(!itemsByClient[item.clientName]) itemsByClient[item.clientName] = [];
          itemsByClient[item.clientName].push(item);
      });

      pdf.setFontSize(12).text("LISTA DE ENTREGAS", margin, yPos);
      yPos += 8;
      Object.keys(itemsByClient).sort().forEach(clientName => {
          if (yPos > 250) { pdf.addPage(); yPos = margin; }
          const clientItems = itemsByClient[clientName];
          pdf.setFillColor(240, 240, 240).rect(margin, yPos, 190, 8, 'F');
          pdf.setFont('helvetica', 'bold').setFontSize(10).text(clientName, margin + 2, yPos + 5.5);
          pdf.setFont('helvetica', 'normal').setFontSize(8).text(clientItems[0].clientAddress, margin + 80, yPos + 5.5);
          yPos += 10;
          clientItems.forEach(item => {
              if (yPos > 270) { pdf.addPage(); yPos = margin; }
              pdf.rect(margin, yPos, 190, 12); 
              pdf.setFont('helvetica', 'bold').setFontSize(10).text(`${item.quantity} ${item.unit || ''}`, margin + 5, yPos + 7);
              pdf.setFont('helvetica', 'normal').setFontSize(9);
              const descText = item.assembler ? `${item.description} - (${item.assembler})` : item.description;
              pdf.text(pdf.splitTextToSize(descText, 90), margin + 30, yPos + 5);
              const boxY = yPos + 3;
              pdf.rect(margin + 120, boxY, 4, 4); pdf.setFontSize(7).text("Env.", margin + 125, boxY + 3);
              pdf.rect(margin + 135, boxY, 4, 4); pdf.text("Rec.", margin + 140, boxY + 3);
              pdf.text("Ass: ________________________", margin + 150, boxY + 3);
              yPos += 12;
          });
          yPos += 5;
      });
      if (yPos > 250) { pdf.addPage(); yPos = margin; }
      yPos = 260;
      pdf.setLineWidth(0.5).line(margin + 60, yPos, margin + 130, yPos);
      pdf.setFontSize(10).text("Assinatura do Motorista", 105, yPos + 5, { align: 'center' });
      pdf.save(`romaneio_${manifest.destination.replace(/\s+/g, '_')}_${manifest.date}.pdf`);
  };

  return (
    <div className="space-y-6 pb-20 p-4 md:p-8 animate-fadeIn">
        
        {/* --- HEADER --- */}
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
                {(isCreating || viewingManifestId) && (
                    <button 
                        onClick={() => { setIsCreating(false); setViewingManifestId(null); }}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <ArrowLeftIcon className="w-6 h-6" />
                    </button>
                )}
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <TruckIcon className="w-8 h-8 text-slate-600"/> 
                    {isCreating ? 'Novo Romaneio' : viewingManifestId ? 'Detalhes do Romaneio' : 'Gestão de Romaneios'}
                </h2>
            </div>
            {!isCreating && !viewingManifestId && (
                <button 
                    onClick={() => setIsCreating(true)}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-md flex items-center gap-2"
                >
                    <PlusCircleIcon className="w-6 h-6"/> Novo Romaneio
                </button>
            )}
        </div>

        {/* --- MODES --- */}
        {isCreating ? (
            <div className="bg-white rounded-xl shadow-lg border border-blue-200 overflow-hidden">
                {/* Form Creation remains mostly same but better layout */}
                <div className="p-6 border-b border-slate-200 bg-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 mb-1">DATA SAÍDA</label>
                            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full p-2 border border-slate-300 rounded"/>
                        </div>
                        <div className="md:col-span-3">
                            <label className="block text-xs font-bold text-slate-500 mb-1">DESTINO / ROTA PRINCIPAL</label>
                            <input type="text" value={newDestination} onChange={e => setNewDestination(e.target.value)} className="w-full p-2 border border-slate-300 rounded" placeholder="Ex: Belo Horizonte / Centro"/>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">MOTORISTA</label>
                            <input type="text" value={newDriver} onChange={e => setNewDriver(e.target.value)} className="w-full p-2 border border-slate-300 rounded"/>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">VEÍCULO / PLACA</label>
                            <input type="text" value={newVehicle} onChange={e => setNewVehicle(e.target.value)} className="w-full p-2 border border-slate-300 rounded"/>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-slate-600 flex items-center gap-2"><BoxIcon className="w-5 h-5"/> Selecione os Itens</h4>
                        <div className="flex gap-2">
                            <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-bold">{selectedTotals.itemsCount} Itens</span>
                            <span className="text-sm bg-orange-100 text-orange-800 px-3 py-1 rounded-full font-bold">{selectedTotals.volumesCount} Vols</span>
                        </div>
                    </div>
                    {allPendingItems.length === 0 ? (
                        <div className="p-10 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">Fila de espera vazia.</div>
                    ) : (
                        <div className="space-y-4">
                            {Object.entries(itemsByCity).sort().map(([city, items]) => (
                                <div key={city} className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="bg-slate-100 p-3 border-b border-slate-200 flex justify-between items-center">
                                        <span className="font-bold text-slate-700 flex items-center gap-2"><MapPinIcon className="w-4 h-4"/> {city}</span>
                                        <button onClick={() => selectAllInCity(city)} className="text-xs text-blue-600 hover:underline font-semibold">Marcar Tudo</button>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {(items as any[]).map(item => (
                                            <div key={item.id} onClick={() => toggleItemSelection(item.id)} className={`p-3 flex items-center gap-4 cursor-pointer transition-colors ${selectedItemIds.includes(item.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedItemIds.includes(item.id) ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                                                    {selectedItemIds.includes(item.id) && <CheckCircleIcon className="w-4 h-4 text-white"/>}
                                                </div>
                                                <div className="flex-grow">
                                                    <span className="font-bold text-slate-700 block">{item.quantity} {item.unit || 'un'} - {item.description}</span>
                                                    <span className="text-xs text-slate-500">{item.clientName}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button onClick={() => setIsCreating(false)} className="px-6 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold">Cancelar</button>
                    <button onClick={handleCreateManifest} disabled={selectedItemIds.length === 0} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold disabled:opacity-50">Emitir Romaneio</button>
                </div>
            </div>
        ) : viewingManifestId && activeManifest ? (
            // --- DETAIL VIEW (CARD) ---
            <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-fadeIn">
                    <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-start">
                        <div>
                            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase mb-2 inline-block">Emitido</span>
                            <h3 className="text-2xl font-bold text-slate-800">{activeManifest.destination}</h3>
                            <p className="text-slate-500 flex items-center gap-1 mt-1 font-medium">
                                <CalendarIcon className="w-4 h-4"/> {new Date(activeManifest.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                             <span className="text-xs font-bold text-slate-400">ID: #{activeManifest.id.slice(0, 8)}</span>
                             <button onClick={() => generatePDF(activeManifest)} className="bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-900 transition-colors shadow-sm" title="Imprimir PDF">
                                <PrinterIcon className="w-5 h-5" />
                             </button>
                        </div>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Motorista</p>
                                <p className="font-semibold text-slate-700">{activeManifest.driver || '---'}</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Veículo</p>
                                <p className="font-semibold text-slate-700">{activeManifest.vehicle || '---'}</p>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold text-slate-600 mb-3 flex items-center gap-2 border-b pb-2">
                                <BoxIcon className="w-5 h-5"/> Lista de Carga ({activeManifest.items.length} itens)
                            </h4>
                            <div className="space-y-4">
                                {Array.from(new Set(activeManifest.items.map(i => i.clientName))).map(clientName => (
                                    <div key={clientName} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                        <div className="bg-slate-100 p-2 text-xs font-bold text-slate-600">{clientName}</div>
                                        <div className="divide-y divide-slate-50">
                                            {activeManifest.items.filter(i => i.clientName === clientName).map(item => (
                                                <div key={item.id} className="p-3 flex justify-between items-center">
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-blue-50 p-1 rounded text-blue-600 font-bold w-12 h-10 flex flex-col items-center justify-center border border-blue-100 flex-shrink-0">
                                                            <span className="text-sm leading-tight">{item.quantity}</span>
                                                            <span className="text-[9px] leading-tight uppercase">{item.unit || 'un'}</span>
                                                        </div>
                                                        <span className="text-sm text-slate-700 font-medium">{item.description}</span>
                                                    </div>
                                                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                        <button onClick={() => handleDeleteManifest(activeManifest)} className="text-red-500 hover:text-red-700 flex items-center gap-1 text-sm font-bold">
                            <TrashIcon className="w-4 h-4"/> Excluir Romaneio
                        </button>
                        <button onClick={() => setViewingManifestId(null)} className="px-6 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-50">
                            Voltar para Lista
                        </button>
                    </div>
                </div>
            </div>
        ) : (
            // --- MAIN LIST VIEW ---
            <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 p-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider grid grid-cols-12 gap-4">
                    <div className="col-span-5 md:col-span-6">Destino / Rota</div>
                    <div className="col-span-4 md:col-span-3">Data Saída</div>
                    <div className="col-span-3 md:col-span-3 text-right">Status</div>
                </div>
                
                {sortedManifests.length === 0 ? (
                    <div className="p-20 text-center text-slate-400">
                        <TruckIcon className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                        <p>Nenhum romaneio emitido.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {sortedManifests.map(manifest => (
                            <div 
                                key={manifest.id} 
                                onClick={() => setViewingManifestId(manifest.id)}
                                className="p-4 grid grid-cols-12 gap-4 items-center cursor-pointer hover:bg-blue-50/50 transition-colors group"
                            >
                                <div className="col-span-5 md:col-span-6">
                                    <p className="font-bold text-slate-700 group-hover:text-blue-700 truncate">{manifest.destination}</p>
                                    <p className="text-[10px] text-slate-400 font-medium">#{manifest.id.slice(0, 8)} • {manifest.items.length} itens</p>
                                </div>
                                <div className="col-span-4 md:col-span-3 flex items-center gap-2 text-sm text-slate-600">
                                    <CalendarIcon className="w-4 h-4 text-slate-300"/>
                                    {new Date(manifest.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                                </div>
                                <div className="col-span-3 md:col-span-3 flex items-center justify-end gap-3">
                                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Emitido</span>
                                    <ChevronRightIcon className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}
    </div>
  );
};

export default CargoManifestManager;