
import React, { useState, useRef, useEffect } from 'react';
import { ProjectFile, Annotation } from '../types';
import { generateUUID } from '../App';
import { 
    XIcon, 
    ZoomInIcon, 
    ZoomOutIcon, 
    RefreshIcon, 
    ArrowLeftIcon,
    TextIcon,
    PencilIcon,
    TrashIcon
} from './icons';

interface ProjectViewerProps {
    file: ProjectFile;
    onSave: (annotations: Annotation[]) => void;
    onClose: () => void;
}

const getEmbedUrl = (url: string, type: string) => {
    const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
    const match = url.match(driveRegex);
    if (match && match[1]) {
        if (type === 'application/pdf' || url.toLowerCase().includes('.pdf')) {
            return `https://drive.google.com/file/d/${match[1]}/preview`;
        }
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
    return url;
};

const ProjectViewer: React.FC<ProjectViewerProps> = ({ file, onSave, onClose }) => {
    const [zoom, setZoom] = useState(1);
    const [tool, setTool] = useState<'PAN' | 'TEXT' | 'ARROW' | 'CURVED'>('PAN');
    const [annotations, setAnnotations] = useState<Annotation[]>(file.annotations || []);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDraggingMap, setIsDraggingMap] = useState(false);
    const [activeAnnId, setActiveAnnId] = useState<string | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const stateRef = useRef({
        zoom, offset, tool, 
        isPinching: false,
        lastDist: 0,
        initialZoom: 1,
        dragStart: { x: 0, y: 0 },
        hasMovedSignificantly: false,
        startTime: 0,
        startPos: { x: 0, y: 0 },
        isMouseDown: false,
        hitAnnotation: false
    });

    useEffect(() => {
        stateRef.current.zoom = zoom;
        stateRef.current.offset = offset;
        stateRef.current.tool = tool;
    }, [zoom, offset, tool]);

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const displayUrl = getEmbedUrl(file.url, file.type);

    const handleReset = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

    const createItem = (x: number, y: number) => {
        const currentTool = stateRef.current.tool;
        if (currentTool === 'TEXT') {
            const content = window.prompt("Texto da anotação:");
            if (content && content.trim()) {
                setAnnotations(prev => [...prev, { id: generateUUID(), type: 'text', x, y, content, scale: 1, angle: 0, color: '#ef4444' }]);
            }
        } else if (currentTool === 'ARROW' || currentTool === 'CURVED') {
            setAnnotations(prev => [...prev, { id: generateUUID(), type: currentTool === 'ARROW' ? 'arrow' : 'curvedArrow', x, y, angle: 0, scale: 1, color: '#ef4444' }]);
        }
    };

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        // --- GESTOS TOUCH ---
        const onTouchStart = (e: TouchEvent) => {
            stateRef.current.hasMovedSignificantly = false;
            stateRef.current.startTime = Date.now();
            stateRef.current.startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };

            const target = e.target as HTMLElement;
            const isAnnotation = target.closest('.annotation-item');
            stateRef.current.hitAnnotation = !!isAnnotation;

            if (e.touches.length === 2) {
                stateRef.current.isPinching = true;
                setIsDraggingMap(false);
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                stateRef.current.lastDist = Math.sqrt(dx * dx + dy * dy);
                stateRef.current.initialZoom = stateRef.current.zoom;
            } else if (e.touches.length === 1 && !isAnnotation) {
                setIsDraggingMap(true);
                stateRef.current.dragStart = {
                    x: e.touches[0].clientX - stateRef.current.offset.x,
                    y: e.touches[0].clientY - stateRef.current.offset.y
                };
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && stateRef.current.isPinching) {
                if (e.cancelable) e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const scale = dist / stateRef.current.lastDist;
                setZoom(Math.min(Math.max(stateRef.current.initialZoom * scale, 0.4), 5));
                stateRef.current.hasMovedSignificantly = true;
            } else if (e.touches.length === 1) {
                const moveDist = Math.sqrt(Math.pow(e.touches[0].clientX - stateRef.current.startPos.x, 2) + Math.pow(e.touches[0].clientY - stateRef.current.startPos.y, 2));
                if (moveDist > 10) stateRef.current.hasMovedSignificantly = true;

                if (activeAnnId) {
                    if (e.cancelable) e.preventDefault();
                    const contentRect = contentRef.current?.getBoundingClientRect();
                    if (contentRect) {
                        const x = (e.touches[0].clientX - contentRect.left) / stateRef.current.zoom;
                        const y = (e.touches[0].clientY - contentRect.top) / stateRef.current.zoom;
                        setAnnotations(prev => prev.map(ann => ann.id === activeAnnId ? { ...ann, x, y } : ann));
                    }
                } else if (stateRef.current.isMouseDown || stateRef.current.dragStart.x !== 0) {
                    const newX = e.touches[0].clientX - stateRef.current.dragStart.x;
                    const newY = e.touches[0].clientY - stateRef.current.dragStart.y;
                    setOffset({ x: newX, y: newY });
                }
            }
        };

        const onTouchEnd = (e: TouchEvent) => {
            const duration = Date.now() - stateRef.current.startTime;
            if (!stateRef.current.hasMovedSignificantly && duration < 350 && stateRef.current.tool !== 'PAN' && !stateRef.current.hitAnnotation) {
                const contentRect = contentRef.current?.getBoundingClientRect();
                if (contentRect) {
                    const touch = e.changedTouches[0];
                    const x = (touch.clientX - contentRect.left) / stateRef.current.zoom;
                    const y = (touch.clientY - contentRect.top) / stateRef.current.zoom;
                    createItem(x, y);
                }
            }
            stateRef.current.isPinching = false;
            setIsDraggingMap(false);
            stateRef.current.dragStart = { x: 0, y: 0 };
        };

        // --- EVENTOS MOUSE (DESKTOP) ---
        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            stateRef.current.isMouseDown = true;
            stateRef.current.hasMovedSignificantly = false;
            stateRef.current.startTime = Date.now();
            stateRef.current.startPos = { x: e.clientX, y: e.clientY };

            const target = e.target as HTMLElement;
            const isAnnotation = target.closest('.annotation-item');
            stateRef.current.hitAnnotation = !!isAnnotation;
            
            if (!isAnnotation) {
                setIsDraggingMap(true);
                stateRef.current.dragStart = {
                    x: e.clientX - stateRef.current.offset.x,
                    y: e.clientY - stateRef.current.offset.y
                };
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!stateRef.current.isMouseDown) return;

            const moveDist = Math.sqrt(Math.pow(e.clientX - stateRef.current.startPos.x, 2) + Math.pow(e.clientY - stateRef.current.startPos.y, 2));
            if (moveDist > 5) stateRef.current.hasMovedSignificantly = true;

            if (activeAnnId) {
                const contentRect = contentRef.current?.getBoundingClientRect();
                if (contentRect) {
                    const x = (e.clientX - contentRect.left) / stateRef.current.zoom;
                    const y = (e.clientY - contentRect.top) / stateRef.current.zoom;
                    setAnnotations(prev => prev.map(ann => ann.id === activeAnnId ? { ...ann, x, y } : ann));
                }
            } else if (stateRef.current.isMouseDown) {
                const newX = e.clientX - stateRef.current.dragStart.x;
                const newY = e.clientY - stateRef.current.dragStart.y;
                setOffset({ x: newX, y: newY });
            }
        };

        const onMouseUp = (e: MouseEvent) => {
            if (!stateRef.current.isMouseDown) return;

            const duration = Date.now() - stateRef.current.startTime;
            
            // Lógica de inserção: Se não moveu, se o tempo foi curto, se a ferramenta não é PAN e se não clicamos em item existente
            if (!stateRef.current.hasMovedSignificantly && stateRef.current.tool !== 'PAN' && !stateRef.current.hitAnnotation) {
                const contentRect = contentRef.current?.getBoundingClientRect();
                if (contentRect) {
                    const x = (e.clientX - contentRect.left) / stateRef.current.zoom;
                    const y = (e.clientY - contentRect.top) / stateRef.current.zoom;
                    createItem(x, y);
                }
            }

            stateRef.current.isMouseDown = false;
            setIsDraggingMap(false);
            stateRef.current.dragStart = { x: 0, y: 0 };
            setActiveAnnId(null);
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            setZoom(prev => Math.min(Math.max(prev + delta, 0.4), 5));
        };

        el.addEventListener('touchstart', onTouchStart, { passive: false });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd);
        
        el.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        el.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            
            el.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            el.removeEventListener('wheel', onWheel);
        };
    }, [activeAnnId]);

    const rotateAnnotation = (id: string, e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        setAnnotations(annotations.map(a => a.id === id ? { ...a, angle: ((a.angle || 0) + 15) % 360 } : a));
    };

    const scaleAnnotation = (id: string, factor: number, e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        setAnnotations(annotations.map(a => a.id === id ? { ...a, scale: Math.max(0.4, Math.min((a.scale || 1) + factor, 4)) } : a));
    };

    const removeAnnotation = (id: string, e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        setAnnotations(annotations.filter(a => a.id !== id));
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col font-app overflow-hidden touch-none select-none">
            <header className="flex-shrink-0 bg-slate-800 text-white p-3 flex justify-between items-center border-b border-slate-700 shadow-lg z-50">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full transition-colors"><ArrowLeftIcon className="w-5 h-5" /></button>
                    <div className="min-w-0">
                        <h2 className="font-bold text-sm uppercase truncate max-w-[150px]">{file.name}</h2>
                        <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest leading-none">Um dedo/Mouse: Mover | Toque/Clique: Inserir</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => onSave(annotations)} className="bg-blue-600 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-transform">Salvar</button>
                    <button onClick={onClose} className="p-1.5 text-red-400"><XIcon className="w-5 h-5" /></button>
                </div>
            </header>

            <div 
                className="flex-grow relative overflow-hidden bg-slate-200 flex items-center justify-center cursor-crosshair"
                ref={containerRef}
            >
                <div 
                    className="origin-center transition-transform duration-75 ease-out"
                    style={{ 
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                    }}
                >
                    <div ref={contentRef} className="relative bg-white shadow-2xl mx-auto overflow-hidden rounded-md">
                        {isPdf ? (
                            <div className="w-[95vw] h-[75vh] max-w-[1200px] max-h-[1600px] bg-white">
                                <iframe 
                                    src={displayUrl} 
                                    className="w-full h-full border-0"
                                    title="Project"
                                    style={{ pointerEvents: tool === 'PAN' ? 'auto' : 'none' }}
                                />
                            </div>
                        ) : (
                            <img 
                                src={displayUrl} 
                                alt="Project" 
                                className="max-w-[95vw] h-auto block max-h-[80vh]" 
                                draggable={false} 
                                onLoad={handleReset} 
                            />
                        )}

                        <div className="absolute inset-0 z-20 pointer-events-none">
                            {(annotations || []).map(ann => (
                                <div 
                                    key={ann.id}
                                    className="absolute pointer-events-auto group annotation-item"
                                    style={{ 
                                        left: ann.x, top: ann.y, 
                                        transform: `translate(-50%, -50%) scale(${ann.scale || 1})`,
                                        zIndex: activeAnnId === ann.id ? 50 : 20
                                    }}
                                    onMouseDown={(e) => { e.stopPropagation(); setActiveAnnId(ann.id); }}
                                    onTouchStart={(e) => { e.stopPropagation(); setActiveAnnId(ann.id); }}
                                >
                                    <div className="relative">
                                        <div className="text-red-500 drop-shadow-lg transition-transform duration-150" style={{ transform: `rotate(${ann.angle || 0}deg)` }}>
                                            {ann.type === 'text' ? (
                                                <div className="px-2 py-1 rounded bg-white/95 border-2 border-red-500 text-red-600 font-bold text-xs whitespace-nowrap shadow-xl">{ann.content}</div>
                                            ) : (
                                                <svg width="45" height="45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="2" y1="12" x2="22" y2="12" />
                                                    <polyline points="15 5 22 12 15 19" />
                                                </svg>
                                            )}
                                        </div>

                                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-1.5 bg-slate-800/90 p-1.5 rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => scaleAnnotation(ann.id, 0.2, e)} className="w-7 h-7 flex items-center justify-center bg-blue-500 text-white rounded-full text-xs font-black shadow-sm">+</button>
                                            <button onClick={(e) => scaleAnnotation(ann.id, -0.2, e)} className="w-7 h-7 flex items-center justify-center bg-blue-500 text-white rounded-full text-xs font-black shadow-sm">-</button>
                                            <button onClick={(e) => rotateAnnotation(ann.id, e)} className="w-7 h-7 flex items-center justify-center bg-orange-500 text-white rounded-full text-xs shadow-sm">↻</button>
                                            <button onClick={(e) => removeAnnotation(ann.id, e)} className="w-7 h-7 flex items-center justify-center bg-red-600 text-white rounded-full text-xs shadow-sm">×</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <footer className="flex-shrink-0 bg-slate-800 p-3 flex flex-wrap justify-center gap-3 border-t border-slate-700 shadow-2xl z-50">
                <div className="flex bg-slate-700 p-1 rounded-xl shadow-inner border border-slate-600">
                    <button onClick={() => setTool('PAN')} className={`px-4 py-2 rounded-lg flex items-center gap-2 text-[10px] font-black transition-all ${tool === 'PAN' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
                        <RefreshIcon className="w-4 h-4" /> MOVER
                    </button>
                    <button onClick={() => setTool('ARROW')} className={`px-4 py-2 rounded-lg flex items-center gap-2 text-[10px] font-black transition-all ${tool === 'ARROW' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
                        <PencilIcon className="w-4 h-4" /> SETA
                    </button>
                    <button onClick={() => setTool('TEXT')} className={`px-4 py-2 rounded-lg flex items-center gap-2 text-[10px] font-black transition-all ${tool === 'TEXT' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
                        <TextIcon className="w-4 h-4" /> TEXTO
                    </button>
                </div>

                <div className="flex bg-slate-700 p-1 rounded-xl shadow-inner border border-slate-600">
                    <button onClick={() => setZoom(z => Math.max(z - 0.5, 0.4))} className="p-2 text-slate-300 hover:text-white"><ZoomOutIcon className="w-4 h-4" /></button>
                    <button onClick={handleReset} className="px-3 text-[10px] font-black text-slate-200 hover:text-white uppercase">{Math.round(zoom * 100)}%</button>
                    <button onClick={() => setZoom(z => Math.min(z + 0.5, 5))} className="p-2 text-slate-300 hover:text-white"><ZoomInIcon className="w-4 h-4" /></button>
                </div>
            </footer>
        </div>
    );
};

export default ProjectViewer;
