
import React, { useState } from 'react';
import { Client, ShippingItem, Assembler } from '../types';
import { generateUUID } from '../App';
import { TruckIcon, PlusCircleIcon, TrashIcon, BoxIcon, UserIcon, RefreshIcon, CheckCircleIcon } from './icons';

interface ShippingManagerProps {
  client: Client;
  assemblers: Assembler[];
  onUpdateClient: (client: Client) => void;
}

const ShippingManager: React.FC<ShippingManagerProps> = ({ client, assemblers, onUpdateClient }) => {
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('un');
  const [assembler, setAssembler] = useState(client.assembler || '');

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !qty) return;

    const newItem: ShippingItem = {
      id: generateUUID(),
      description: desc.trim(),
      quantity: Number(qty),
      unit,
      assembler,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };

    onUpdateClient({
      ...client,
      shippingItems: [...(client.shippingItems || []), newItem]
    });

    setDesc('');
    setQty('');
  };

  const removeItem = (id: string) => {
    if (window.confirm("Remover este item da fila de logística?")) {
      onUpdateClient({
        ...client,
        shippingItems: (client.shippingItems || []).filter(i => i.id !== id)
      });
    }
  };

  const pendingItems = (client.shippingItems || []).filter(i => i.status === 'Pending');
  const shippedItems = (client.shippingItems || []).filter(i => i.status === 'Shipped');

  return (
    <div className="space-y-6 font-montserrat animate-fadeIn">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2 mb-4">
          <BoxIcon className="w-6 h-6 text-blue-600" />
          Cadastrar Volumes para Logística
        </h3>
        
        <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Qtd / Unidade</label>
            <div className="flex gap-2">
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} className="w-16 p-2 border border-slate-200 rounded-lg text-sm font-bold" placeholder="0" required />
              <select value={unit} onChange={e => setUnit(e.target.value)} className="flex-grow p-2 border border-slate-200 rounded-lg text-sm bg-white">
                <option value="un">UN</option>
                <option value="cx">CX</option>
                <option value="vols">VOLS</option>
                <option value="kit">KIT</option>
              </select>
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Descrição do Item</label>
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm" placeholder="Ex: Ferragens / Tampos / Caixas" required />
          </div>
          <div className="md:col-span-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Montador / Resp.</label>
            <select value={assembler} onChange={e => setAssembler(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="">Nenhum</option>
              {assemblers.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>
          <button type="submit" className="bg-blue-600 text-white p-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-md flex items-center justify-center gap-2">
            <PlusCircleIcon className="w-5 h-5"/> Adicionar à Fila
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fila de Espera */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white p-3 text-[10px] font-black uppercase tracking-widest flex justify-between items-center">
            <span>Fila de Espera (Aguardando Romaneio)</span>
            <span className="bg-white/20 px-2 py-0.5 rounded-full">{pendingItems.length}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic text-sm">Nenhum item aguardando envio.</div>
            ) : (
              pendingItems.map(item => (
                <div key={item.id} className="p-4 flex items-center justify-between group hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-50 text-blue-600 font-black p-2 rounded-lg text-sm w-12 text-center border border-blue-100">
                      {item.quantity}<span className="text-[9px] block leading-none">{item.unit}</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-700 text-sm">{item.description}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{item.assembler || 'Sem montador'}</p>
                    </div>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Itens Enviados */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden opacity-80">
          <div className="bg-slate-100 text-slate-600 p-3 text-[10px] font-black uppercase tracking-widest flex justify-between items-center">
            <span>Histórico de Enviados</span>
            <span className="bg-slate-200 px-2 py-0.5 rounded-full">{shippedItems.length}</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
            {shippedItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic text-sm">Histórico vazio.</div>
            ) : (
              shippedItems.map(item => (
                <div key={item.id} className="p-4 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-4">
                    <div className="bg-green-50 text-green-600 font-black p-2 rounded-lg text-sm w-12 text-center border border-green-100">
                      {item.quantity}<span className="text-[9px] block leading-none">{item.unit}</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-500 text-sm line-through">{item.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-black text-green-600 uppercase flex items-center gap-1">
                          <CheckCircleIcon className="w-3 h-3"/> Enviado em {item.shippedDate ? new Date(item.shippedDate).toLocaleDateString('pt-BR') : '---'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShippingManager;
