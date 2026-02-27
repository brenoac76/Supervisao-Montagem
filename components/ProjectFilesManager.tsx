
import React, { useState, useRef } from 'react';
import { Environment, ProjectFile, Annotation } from '../types';
import { generateUUID, SCRIPT_URL } from '../App';
import { fetchWithRetry } from '../utils/api';
import { 
    FolderIcon, 
    ArrowUpIcon, 
    TrashIcon, 
    DocumentTextIcon, 
    RefreshIcon, 
    PlusCircleIcon,
    AnnotationIcon,
    XIcon
} from './icons';
import ProjectViewer from './ProjectViewer';

interface ProjectFilesManagerProps {
    environment: Environment;
    onUpdateEnvironment: (updatedEnv: Environment) => void;
}

const getFileIdFromUrl = (url: string): string | null => {
    const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
    const match = url.match(driveRegex);
    return match ? match[1] : null;
};

const ProjectFilesManager: React.FC<ProjectFilesManagerProps> = ({ environment, onUpdateEnvironment }) => {
    const [uploading, setUploading] = useState(false);
    const [viewingFile, setViewingFile] = useState<ProjectFile | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const readFileAsBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
        });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const base64Data = await readFileAsBase64(file);
            
            // Timeout estendido para 60s para projetos (PDFs podem ser pesados)
            const response = await fetchWithRetry(SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'UPLOAD_FILE',
                    data: {
                        base64Data,
                        fileName: file.name,
                        mimeType: file.type
                    }
                }),
                timeout: 60000 
            });

            const result = await response.json();
            
            if (result.success && result.url) {
                const newProjectFile: ProjectFile = {
                    id: generateUUID(),
                    name: file.name,
                    url: result.url,
                    type: file.type,
                    annotations: [],
                    createdAt: new Date().toISOString()
                };

                const updatedFiles = [...(environment.projectFiles || []), newProjectFile];
                
                onUpdateEnvironment({
                    ...environment,
                    projectFiles: updatedFiles
                });
            } else {
                throw new Error(result.message || "Erro no servidor ao salvar arquivo.");
            }
        } catch (err: any) {
            console.error("Erro no upload:", err);
            alert(`Falha no upload: ${err.message || "Verifique sua conexão ou o tamanho do arquivo."}`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const removeFile = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const fileToRemove = environment.projectFiles?.find(f => f.id === id);
        if (!fileToRemove) return;

        if (window.confirm(`Deseja excluir permanentemente o arquivo "${fileToRemove.name}" da nuvem?`)) {
            const fileId = getFileIdFromUrl(fileToRemove.url);
            
            if (fileId) {
                try {
                    // Chamada para o backend para deletar o arquivo fisicamente do Drive
                    await fetchWithRetry(SCRIPT_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'DELETE_FILE',
                            data: { fileId }
                        }),
                    });
                } catch (err) {
                    console.error("Erro ao excluir arquivo no Drive:", err);
                    // Opcional: avisar que a exclusão física falhou mas removeremos da lista
                }
            }

            onUpdateEnvironment({
                ...environment,
                projectFiles: (environment.projectFiles || []).filter(f => f.id !== id)
            });
        }
    };

    const handleSaveAnnotations = (fileId: string, annotations: Annotation[]) => {
        const updatedFiles = (environment.projectFiles || []).map(f => 
            f.id === fileId ? { ...f, annotations } : f
        );
        onUpdateEnvironment({
            ...environment,
            projectFiles: updatedFiles
        });
    };

    return (
        <div className="space-y-4 animate-fadeIn">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <FolderIcon className="w-6 h-6 text-blue-600" />
                        Arquivos do Projeto
                    </h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">PDFS E IMAGENS DE REFERÊNCIA</p>
                </div>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest shadow-md hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                    {uploading ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <PlusCircleIcon className="w-5 h-5" />}
                    {uploading ? 'ENVIANDO...' : 'UPLOAD ARQUIVO'}
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(!environment.projectFiles || environment.projectFiles.length === 0) ? (
                    <div className="col-span-full py-16 text-center bg-white rounded-xl border-2 border-dashed border-slate-200">
                        <DocumentTextIcon className="w-12 h-12 text-slate-200 mx-auto mb-2" />
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">NENHUM ARQUIVO ANEXADO</p>
                    </div>
                ) : (
                    environment.projectFiles.map(file => (
                        <div 
                            key={file.id}
                            onClick={() => setViewingFile(file)}
                            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group flex flex-col gap-3"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                                        <DocumentTextIcon className="w-6 h-6" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-slate-800 text-sm truncate uppercase tracking-tight">{file.name}</h4>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Anexado em {new Date(file.createdAt).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={(e) => removeFile(file.id, e)}
                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                            
                            <div className="flex justify-between items-center mt-auto pt-3 border-t border-slate-100">
                                <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 uppercase tracking-widest">
                                    <AnnotationIcon className="w-3.5 h-3.5" />
                                    {(file.annotations || []).length} Marcas
                                </div>
                                <span className="text-[9px] font-bold text-slate-300 group-hover:text-blue-500 transition-colors uppercase tracking-widest">Abrir Viewer →</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {viewingFile && (
                <ProjectViewer 
                    file={viewingFile}
                    onClose={() => setViewingFile(null)}
                    onSave={(anns) => handleSaveAnnotations(viewingFile.id, anns)}
                />
            )}
        </div>
    );
};

export default ProjectFilesManager;
