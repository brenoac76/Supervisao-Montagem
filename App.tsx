
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Client, User, UserRole, Assembler, CargoManifest, AgendaItem, Vehicle, VehicleUsageLog, AgendaIssue, FurnitureOrder } from './types';
import ClientCard from './components/ClientCard';
import HomeScreen from './components/HomeScreen';
import EnvironmentCard from './components/EnvironmentCard';
import AuthScreen from './components/AuthScreen';
import UserManagement from './components/UserManagement';
import TeamManagement from './components/TeamManagement'; 
import CargoManifestManager from './components/CargoManifestManager';
import FleetManagement from './components/FleetManagement';
import PersonalAgenda from './components/PersonalAgenda';
import ChangePasswordModal from './components/ChangePasswordModal';
import PendingIssuesReport from './components/PendingIssuesReport';
import CompletionForecastReport from './components/CompletionForecastReport';
import AstecaReport from './components/AstecaReport';
import FurnitureOrderManager from './components/FurnitureOrderManager';
import Modal from './components/Modal';
import { 
    ArrowLeftIcon, 
    LogoutIcon, 
    UserGroupIcon, 
    UserIcon, 
    KeyIcon, 
    DownloadIcon, 
    ShareIcon, 
    RefreshIcon, 
    ClipboardListIcon, 
    HomeIcon, 
    UsersIcon, 
    ChartBarIcon, 
    CalendarIcon, 
    PrinterIcon, 
    TruckIcon, 
    DocumentTextIcon, 
    ExclamationCircleIcon,
    MenuIcon,
    XIcon,
    ChevronRightIcon,
    BellIcon,
    ShieldCheckIcon,
    ShoppingCartIcon
} from './components/icons';
import { SCRIPT_URL, fetchWithRetry, generateUUID } from './utils/api';
import { APP_VERSION } from './utils/version';

export { SCRIPT_URL, generateUUID };

export type TabType = 'overview' | 'environments' | 'visits' | 'punchlist' | 'reports' | 'assistance' | 'logistics' | 'team_in_site'; 

type AppStatus = 'LOADING' | 'READY' | 'ERROR';
type MainTab = 'SUPERVISION' | 'TEAM' | 'LOGISTICS' | 'REPORTS' | 'AGENDA' | 'ORDERS';
export type TeamViewType = 'STATUS' | 'CALENDAR' | 'MEMBERS' | 'REPORT' | 'PRODUCTION' | 'EVALUATION';
export type LogisticsViewType = 'MANIFESTS' | 'FLEET';
export type ReportViewType = 'PENDING_BY_CLIENT' | 'PENDING_GENERAL' | 'PENDING_BY_CATEGORY' | 'COMPLETION_FORECAST' | 'ASTECA_REPORT';
export type AgendaViewType = 'REMINDERS' | 'LIST';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>('SUPERVISION');
  const [teamView, setTeamView] = useState<TeamViewType>('STATUS'); 
  const [logisticsView, setLogisticsView] = useState<LogisticsViewType>('MANIFESTS');
  const [reportView, setReportView] = useState<ReportViewType>('PENDING_BY_CLIENT');
  const [agendaView, setAgendaView] = useState<AgendaViewType>('REMINDERS');

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
      TEAM: false,
      LOGISTICS: false,
      REPORTS: false,
      AGENDA: false
  });

  const [clients, setClients] = useState<Client[]>([]);
  const [assemblers, setAssemblers] = useState<Assembler[]>([]); 
  const [manifests, setManifests] = useState<CargoManifest[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [agendaIssues, setAgendaIssues] = useState<AgendaIssue[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleetLogs, setFleetLogs] = useState<VehicleUsageLog[]>([]);
  const [furnitureOrders, setFurnitureOrders] = useState<FurnitureOrder[]>([]);
  
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);
  
  const [activeClientTab, setActiveClientTab] = useState<TabType>('overview');
  const [selectedAssemblerIdForView, setSelectedAssemblerIdForView] = useState<string | null>(null);

  const [status, setStatus] = useState<AppStatus>('LOADING');
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const saveTimeoutRef = useRef<any>(null);
  const pendingSaveClientsRef = useRef<Map<string, Client>>(new Map());

  // --- CAMADA DE PROTEÇÃO: Payload Slim & Filtragem de Atributos ---
  const sanitizeObjectForSync = (obj: any): any => {
    if (!obj) return obj;
    const cleaned = JSON.parse(JSON.stringify(obj));
    
    const traverseAndClean = (item: any) => {
        if (!item || typeof item !== 'object') return;
        
        for (const key in item) {
            if (typeof item[key] === 'string') {
                if (item[key].startsWith('data:') || item[key].startsWith('blob:')) {
                    if (key !== 'signatureBase64') {
                        item[key] = ""; 
                    }
                }
            } 
            else if (key.startsWith('_') || key === 'isEditing' || key === 'tempId') {
                delete item[key];
            }
            else if (typeof item[key] === 'object') {
                traverseAndClean(item[key]);
            }
        }
    };
    
    traverseAndClean(cleaned);
    return cleaned;
  };

  const playNotificationSound = () => {
      try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
          gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
          oscillator.start();
          oscillator.stop(audioCtx.currentTime + 0.3);
      } catch (e) {
          console.error("Audio blocked", e);
      }
  };

  useEffect(() => {
    if (!currentUser || isSaving) return;
    const interval = setInterval(() => {
        const now = new Date();
        let updated = false;
        const newAgenda = agendaItems.map(item => {
            if (item.status === 'Pending' && !item.notified && new Date(item.dueDate) <= now) {
                playNotificationSound();
                updated = true;
                return { ...item, notified: true };
            }
            return item;
        });
        if (updated) handleSaveAgenda(newAgenda);
    }, 30000); // Aumentado para 30s para evitar colisões
    return () => clearInterval(interval);
  }, [agendaItems, currentUser, isSaving]);

  const loadLogo = useCallback(async () => {
      try {
          const response = await fetchWithRetry(`${SCRIPT_URL}?action=GET_LOGO`);
          const res = await response.json();
          if (res.success && res.url) {
              const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]{25,})/;
              const match = res.url.match(driveRegex);
              if (match && match[1]) {
                  setLogoUrl(`https://lh3.googleusercontent.com/d/${match[1]}`);
              } else {
                  setLogoUrl(res.url);
              }
          }
      } catch (e) {
          console.error("Erro ao carregar logo:", e);
      }
  }, []);

  useEffect(() => {
    loadLogo();
    loadUsers();
    const sessionUser = localStorage.getItem('app_current_user');
    if (sessionUser) {
        try {
            const user = JSON.parse(sessionUser);
            if (user && typeof user.username === 'string') setCurrentUser(user);
        } catch (e) {}
    }
  }, [loadLogo]);

  const loadUsers = async () => {
    setAuthLoading(true);
    try {
        const response = await fetchWithRetry(`${SCRIPT_URL}?action=GET_USERS`);
        const result = await response.json();
        let loadedUsers: User[] = [];
        if (result.success && Array.isArray(result.data)) {
            loadedUsers = result.data.reduce((acc: User[], u: any) => {
                if (!u || !u.username) return acc;
                acc.push({
                    ...u,
                    username: String(u.username).trim().toLowerCase(),
                    password: String(u.password || '')
                });
                return acc;
            }, []);
        }
        
        const adminUser = loadedUsers.find(u => u.username === 'admin');
        if (!adminUser) {
            loadedUsers = [{ id: 'default-admin-id', username: 'admin', password: 'Bplu1808#', role: UserRole.MASTER }, ...loadedUsers];
        }
        setUsers(loadedUsers);
    } catch (e) {
        console.error("Erro ao carregar usuários:", e);
        setUsers([{ id: 'default-admin-id', username: 'admin', password: 'Bplu1808#', role: UserRole.MASTER }]);
    } finally {
        setAuthLoading(false);
    }
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('app_current_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setAgendaItems([]);
    setAgendaIssues([]);
    localStorage.removeItem('app_current_user');
    setSelectedClientId(null);
    setSelectedEnvironmentId(null);
    setIsSidebarOpen(false);
  };

  const syncUsers = async (usersList: User[]) => {
    setIsSaving(true);
    try {
      const response = await fetchWithRetry(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'SAVE_USERS', data: sanitizeObjectForSync(usersList) }),
      });
      const result = await response.json();
      if (!result.success) alert(`Falha ao salvar usuários na nuvem: ${result.message}`);
    } catch (e: any) {
      console.error(`Erro de conexão: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddUser = (newUser: User) => {
    const sanitizedUser = { ...newUser, username: newUser.username.trim().toLowerCase() };
    const updatedUsers = [...users, sanitizedUser];
    setUsers(updatedUsers);
    syncUsers(updatedUsers);
  };

  const handleUpdateUser = (updatedUser: User) => {
    const sanitizedUser = { ...updatedUser, username: updatedUser.username.trim().toLowerCase() };
    const updatedUsers = users.map(u => u.id === sanitizedUser.id ? sanitizedUser : u);
    setUsers(updatedUsers);
    syncUsers(updatedUsers);
    if (currentUser && currentUser.id === sanitizedUser.id) {
        setCurrentUser(sanitizedUser);
        localStorage.setItem('app_current_user', JSON.stringify(sanitizedUser));
    }
  };

  const handleDeleteUser = (userId: string) => {
    const updatedUsers = users.filter(u => u.id !== userId);
    setUsers(updatedUsers);
    syncUsers(updatedUsers);
  };

  const handleChangePassword = (oldPass: string, newPass: string) => {
      if (!currentUser) return;
      if (currentUser.password !== oldPass) {
          alert("A senha atual informada está incorreta.");
          return;
      }
      const updatedUser = { ...currentUser, password: newPass };
      setCurrentUser(updatedUser);
      localStorage.setItem('app_current_user', JSON.stringify(updatedUser));
      const updatedUsers = users.map(u => u.id === currentUser.id ? updatedUser : u);
      setUsers(updatedUsers);
      syncUsers(updatedUsers);
      setShowChangePassword(false);
      alert("Senha alterada com sucesso!");
  };

  const loadData = useCallback(async (isBackground = false) => {
    if (!currentUser) return; 
    if (!isBackground) setStatus('LOADING');
    else setIsRefreshing(true);
    setError(null);
    try {
      const clientsPromise = fetchWithRetry(`${SCRIPT_URL}?action=GET_CLIENTS`, { timeout: 20000 });
      const assemblersPromise = fetchWithRetry(`${SCRIPT_URL}?action=GET_ASSEMBLERS`).catch(() => null);
      const manifestsPromise = fetchWithRetry(`${SCRIPT_URL}?action=GET_MANIFESTS`).catch(() => null);
      const agendaPromise = fetchWithRetry(`${SCRIPT_URL}?action=GET_AGENDA&userId=${currentUser.id}`).catch(() => null);
      const agendaIssuesPromise = fetchWithRetry(`${SCRIPT_URL}?action=GET_AGENDA_ISSUES&userId=${currentUser.id}`).catch(() => null);
      const fleetPromise = fetchWithRetry(`${SCRIPT_URL}?action=GET_FLEET`).catch(() => null);
      const ordersPromise = fetchWithRetry(`${SCRIPT_URL}?action=GET_FURNITURE_ORDERS`).catch(() => null);
      
      const [clientsResponse, assemblersResponse, manifestsResponse, agendaResponse, agendaIssuesResponse, fleetResponse, ordersResponse] = await Promise.all([
          clientsPromise, assemblersPromise, manifestsPromise, agendaPromise, agendaIssuesPromise, fleetPromise, ordersPromise
      ]);
      
      const clientsResult = await clientsResponse.json();
      if (!clientsResult.success) throw new Error(clientsResult.message || 'Erro no script.');
      setClients(Array.isArray(clientsResult.data) ? clientsResult.data.filter((c: any) => c && c.name) : []);
      
      if (assemblersResponse) {
          const assemblersResult = await assemblersResponse.json();
          if (assemblersResult.success && Array.isArray(assemblersResult.data)) setAssemblers(assemblersResult.data);
      }
      if (manifestsResponse) {
          const manifestsResult = await manifestsResponse.json();
          if (manifestsResult.success && Array.isArray(manifestsResult.data)) setManifests(manifestsResult.data);
      }
      if (agendaResponse) {
          const agendaResult = await agendaResponse.json();
          if (agendaResult.success && Array.isArray(agendaResult.data)) setAgendaItems(agendaResult.data);
      }
      if (agendaIssuesPromise) {
          const agendaIssuesResult = await agendaIssuesResponse.json();
          if (agendaIssuesResult.success && Array.isArray(agendaIssuesResult.data)) setAgendaIssues(agendaIssuesResult.data);
      }
      if (fleetResponse) {
          const fleetResult = await fleetResponse.json();
          if (fleetResult.success) {
              setVehicles(fleetResult.vehicles || []);
              setFleetLogs(fleetResult.logs || []);
          }
      }
      if (ordersResponse) {
          const ordersResult = await ordersResponse.json();
          if (ordersResult.success && Array.isArray(ordersResult.data)) setFurnitureOrders(ordersResult.data);
      }
      
      if (!isBackground) setStatus('READY');
    } catch (e: any) {
      if (!isBackground) { setError(`Falha ao carregar: ${e.message}`); setStatus('ERROR'); }
    } finally { setIsRefreshing(false); }
  }, [currentUser]);

  useEffect(() => { if (currentUser) loadData(); }, [currentUser, loadData]);

  const processPendingSaves = useCallback(async () => {
    if (pendingSaveClientsRef.current.size === 0) return;
    setIsSaving(true);
    const clientsToSave = Array.from(pendingSaveClientsRef.current.values());
    pendingSaveClientsRef.current.clear();
    try {
      for (const client of clientsToSave) {
        const slimClient = sanitizeObjectForSync(client);
        const res = await fetchWithRetry(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'UPDATE_CLIENT', data: slimClient }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message);
      }
    } catch (e: any) {
      console.error(`Erro ao sincronizar dados: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const handleUpdateClient = (updatedClient: Client) => {
    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    pendingSaveClientsRef.current.set(updatedClient.id, updatedClient);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(processPendingSaves, 2000);
  };

  const handleAddClient = async (newClientData: Omit<Client, 'id' | 'environments' | 'visitLogs'>) => {
    setIsSaving(true);
    const newClient: Client = {
      ...newClientData,
      id: generateUUID(),
      environments: [],
      visitLogs: []
    };
    try {
      const response = await fetchWithRetry(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'UPDATE_CLIENT', data: sanitizeObjectForSync(newClient) }),
      });
      const result = await response.json();
      if (result.success) setClients([newClient, ...clients]);
      else alert("Falha ao salvar cliente no banco.");
    } catch (e: any) {
      alert(`Erro de conexão: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir esta obra permanentemente?")) return;
    setIsSaving(true);
    try {
      const response = await fetchWithRetry(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'DELETE_CLIENT', data: { id: clientId } }),
      });
      const result = await response.json();
      if (result.success) {
        setClients(clients.filter(c => c.id !== clientId));
        if (selectedClientId === clientId) setSelectedClientId(null);
      } else alert("Erro ao excluir cliente.");
    } catch (e: any) {
      alert(`Erro de conexão: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAssemblers = async (list: Assembler[]) => {
      setIsSaving(true);
      try {
          const res = await fetchWithRetry(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'SAVE_ASSEMBLERS', data: sanitizeObjectForSync(list) }),
          });
          const result = await res.json();
          if (result.success) setAssemblers(list);
          else alert("Erro ao salvar montadores.");
      } catch (e: any) {
          console.error(`Erro: ${e.message}`);
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveManifests = async (list: CargoManifest[]) => {
      setIsSaving(true);
      try {
          const res = await fetchWithRetry(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'SAVE_MANIFESTS', data: sanitizeObjectForSync(list) }),
          });
          const result = await res.json();
          if (result.success) setManifests(list);
          else alert("Erro ao salvar romaneios.");
      } catch (e: any) {
          console.error(`Erro: ${e.message}`);
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveFleet = async (v: Vehicle[], l: VehicleUsageLog[]) => {
      setIsSaving(true);
      try {
          const res = await fetchWithRetry(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ 
                  action: 'SAVE_FLEET', 
                  data: { vehicles: sanitizeObjectForSync(v), logs: sanitizeObjectForSync(l) } 
              }),
          });
          const result = await res.json();
          if (result.success) {
              setVehicles(v);
              setFleetLogs(l);
          } else alert("Erro ao salvar dados de frota.");
      } catch (e: any) {
          console.error(`Erro: ${e.message}`);
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveAgenda = async (list: AgendaItem[]) => {
      if (!currentUser) return;
      setAgendaItems(list);
      setIsSaving(true);
      try {
          const res = await fetchWithRetry(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'SAVE_AGENDA', data: { userId: currentUser.id, list: sanitizeObjectForSync(list) } }),
          });
      } catch (e: any) {
          console.error(e);
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveAgendaIssues = async (list: AgendaIssue[]) => {
      if (!currentUser) return;
      setAgendaIssues(list);
      setIsSaving(true);
      try {
          await fetchWithRetry(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'SAVE_AGENDA_ISSUES', data: { userId: currentUser.id, list: sanitizeObjectForSync(list) } }),
          });
      } catch (e: any) {
          console.error(e);
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveFurnitureOrders = async (list: FurnitureOrder[]) => {
      setIsSaving(true);
      try {
          const res = await fetchWithRetry(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'SAVE_FURNITURE_ORDERS', data: sanitizeObjectForSync(list) }),
          });
          const result = await res.json();
          if (result.success) setFurnitureOrders(list);
          else alert("Erro ao salvar pedidos.");
      } catch (e: any) {
          console.error(`Erro: ${e.message}`);
      } finally {
          setIsSaving(false);
      }
  };

  const handleUpdateClientsBulk = async (updatedClients: Client[]) => {
      setIsSaving(true);
      try {
          for (const client of updatedClients) {
              await fetchWithRetry(SCRIPT_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({ action: 'UPDATE_CLIENT', data: sanitizeObjectForSync(client) }),
              });
          }
          const ids = updatedClients.map(c => c.id);
          setClients(prev => prev.map(c => ids.includes(c.id) ? (updatedClients.find(u => u.id === c.id) || c) : c));
      } catch (e: any) {
          console.error(`Erro na atualização em lote: ${e.message}`);
      } finally {
          setIsSaving(false);
      }
  };

  const toggleMenu = (menu: string) => {
      const newOpenMenus = { TEAM: false, LOGISTICS: false, REPORTS: false, AGENDA: false };
      newOpenMenus[menu as keyof typeof openMenus] = !openMenus[menu as keyof typeof openMenus];
      setOpenMenus(newOpenMenus);
  };

  if (authLoading) return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <div className="bg-white p-8 rounded-2xl shadow-2xl border border-slate-200 flex flex-col items-center gap-4">
        <RefreshIcon className="w-12 h-12 text-slate-400 animate-spin" />
        <p className="text-slate-700 font-light uppercase tracking-[0.3em] text-xs">Validando Acesso...</p>
      </div>
    </div>
  );

  if (!currentUser) return <AuthScreen users={users} onLogin={handleLogin} logoUrl={logoUrl} />;

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const selectedEnvironment = selectedClient?.environments.find(e => e.id === selectedEnvironmentId);
  const overdueAgendaCount = agendaItems.filter(i => i.status === 'Pending' && new Date(i.dueDate) < new Date()).length;

  const NavItem = ({ 
    tab, 
    label, 
    icon: Icon, 
    hasDropdown = false, 
    menuKey = '', 
    onClick,
    badge
  }: { 
    tab?: MainTab, 
    label: string, 
    icon: any, 
    hasDropdown?: boolean, 
    menuKey?: string,
    onClick?: () => void,
    badge?: number
  }) => {
    const isActive = tab && activeTab === tab;
    const isOpen = menuKey && openMenus[menuKey];
    
    return (
        <div 
            className="relative group"
            onMouseEnter={() => {
                if (window.innerWidth >= 1024 && hasDropdown && menuKey) {
                    // Close other menus when opening one
                    setOpenMenus(prev => {
                        const newState = { TEAM: false, LOGISTICS: false, REPORTS: false, AGENDA: false };
                        newState[menuKey] = true;
                        return newState;
                    });
                }
            }}
            onMouseLeave={() => {
                if (window.innerWidth >= 1024 && hasDropdown && menuKey) {
                    setOpenMenus(prev => ({ ...prev, [menuKey]: false }));
                }
            }}
        >
            <button
                onClick={() => {
                    if (hasDropdown && menuKey) {
                        toggleMenu(menuKey);
                    } else if (tab) {
                        setActiveTab(tab); 
                        setSelectedClientId(null); 
                        setSelectedEnvironmentId(null); 
                        setIsSidebarOpen(false);
                        setOpenMenus({ TEAM: false, LOGISTICS: false, REPORTS: false, AGENDA: false });
                    }
                    if (onClick) onClick();
                }}
                className={`w-full flex items-center justify-between px-4 py-3 transition-all duration-300 border-l-4 ${isActive ? 'bg-white/10 text-white border-white' : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent'}`}
            >
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Icon className={`w-5 h-5 ${isActive ? 'opacity-100' : 'opacity-60'}`} />
                        {badge !== undefined && badge > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-slate-900 animate-pulse">
                                {badge}
                            </span>
                        )}
                    </div>
                    <span className="text-[13px] font-light tracking-wide">{label}</span>
                </div>
                {hasDropdown && (
                    <ChevronRightIcon className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-90 lg:rotate-0' : ''}`} />
                )}
            </button>
            
            <div className={`lg:absolute lg:left-full lg:top-0 lg:ml-0 lg:z-[100] overflow-hidden transition-all duration-200 lg:duration-700 ease-in-out ${isOpen ? 'max-h-96 opacity-100 lg:w-48' : 'max-h-0 opacity-0 lg:w-0 lg:opacity-0 lg:max-h-96 pointer-events-none'}`}>
                <div className="bg-slate-800 lg:shadow-2xl lg:rounded-xl lg:border lg:border-slate-700 p-2 flex flex-col space-y-1 mt-1 lg:mt-0 w-full lg:w-48">
                    {menuKey === 'TEAM' && (
                        <>
                            <button onClick={() => { setActiveTab('TEAM'); setTeamView('STATUS'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'TEAM' && teamView === 'STATUS' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Painel Status</button>
                            <button onClick={() => { setActiveTab('TEAM'); setTeamView('CALENDAR'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'TEAM' && teamView === 'CALENDAR' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Agenda Mensal</button>
                            <button onClick={() => { setActiveTab('TEAM'); setTeamView('MEMBERS'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'TEAM' && teamView === 'MEMBERS' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Equipe Membros</button>
                            <button onClick={() => { setActiveTab('TEAM'); setTeamView('PRODUCTION'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'TEAM' && teamView === 'PRODUCTION' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Relatório Produção</button>
                            <button onClick={() => { setActiveTab('TEAM'); setTeamView('EVALUATION'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'TEAM' && teamView === 'EVALUATION' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Pontuação</button>
                            <button onClick={() => { setActiveTab('TEAM'); setTeamView('REPORT'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'TEAM' && teamView === 'REPORT' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Gerar PDF Equipe</button>
                        </>
                    )}
                    {menuKey === 'LOGISTICS' && (
                        <>
                            <button onClick={() => { setActiveTab('LOGISTICS'); setLogisticsView('MANIFESTS'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'LOGISTICS' && logisticsView === 'MANIFESTS' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Romaneios de Carga</button>
                            <button onClick={() => { setActiveTab('LOGISTICS'); setLogisticsView('FLEET'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'LOGISTICS' && logisticsView === 'FLEET' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Gestão de Frota</button>
                        </>
                    )}
                    {menuKey === 'REPORTS' && (
                        <>
                            <button onClick={() => { setActiveTab('REPORTS'); setReportView('ASTECA_REPORT'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'REPORTS' && reportView === 'ASTECA_REPORT' ? 'text-white bg-white/10 font-bold' : 'text-slate-400 hover:text-slate-200'}`}>• Relatório de ASTECAS</button>
                            <button onClick={() => { setActiveTab('REPORTS'); setReportView('PENDING_BY_CLIENT'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'REPORTS' && reportView === 'PENDING_BY_CLIENT' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Pendências Por Cliente</button>
                            <button onClick={() => { setActiveTab('REPORTS'); setReportView('PENDING_GENERAL'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'REPORTS' && reportView === 'PENDING_GENERAL' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Pendências Geral</button>
                            <button onClick={() => { setActiveTab('REPORTS'); setReportView('COMPLETION_FORECAST'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'REPORTS' && reportView === 'COMPLETION_FORECAST' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Previsões por Montador</button>
                            <button onClick={() => { setActiveTab('REPORTS'); setReportView('PENDING_BY_CATEGORY'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'REPORTS' && reportView === 'PENDING_BY_CATEGORY' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Relação por Tipo</button>
                        </>
                    )}
                    {menuKey === 'AGENDA' && (
                        <>
                            <button onClick={() => { setActiveTab('AGENDA'); setAgendaView('REMINDERS'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'AGENDA' && agendaView === 'REMINDERS' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Lembretes</button>
                            <button onClick={() => { setActiveTab('AGENDA'); setAgendaView('LIST'); setSelectedClientId(null); setSelectedEnvironmentId(null); setIsSidebarOpen(false); setOpenMenus({TEAM:false, LOGISTICS: false, REPORTS:false, AGENDA: false}); }} className={`w-full text-left pl-8 lg:px-4 py-2 text-[10px] font-normal uppercase tracking-widest rounded-md transition-all hover:bg-slate-700 ${activeTab === 'AGENDA' && agendaView === 'LIST' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200'}`}>• Lista Pendências</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-100 font-app overflow-hidden">
      {isSidebarOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[45] lg:hidden transition-opacity duration-300" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 shadow-2xl transition-transform duration-300 lg:translate-x-0 font-app ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full relative">
          <div className="flex flex-col items-center pt-10 pb-8 border-b border-slate-800 relative bg-slate-950/30">
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden absolute top-4 right-4 text-slate-500 hover:text-white">
                <XIcon className="w-6 h-6" />
            </button>
            {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-14 w-auto object-contain filter brightness-0 invert transition-all duration-700" />
            ) : (
                <div className="h-12 w-12 bg-white/10 rounded-lg flex items-center justify-center text-white font-light text-2xl border border-white/20">T</div>
            )}
            <div className="-mt-3 text-center">
                <span className="block text-white text-[10px] font-light uppercase tracking-[0.6em] opacity-80 font-tracker-branding">Tracker</span>
            </div>
          </div>

          <nav className="flex-grow p-0 space-y-0.5 mt-4 overflow-y-auto lg:overflow-visible">
            <NavItem tab="SUPERVISION" label="Supervisão" icon={HomeIcon} />
            <NavItem label="Gestão de Equipe" icon={UserGroupIcon} hasDropdown={true} menuKey="TEAM" />
            <NavItem label="Logística" icon={TruckIcon} hasDropdown={true} menuKey="LOGISTICS" />
            <NavItem tab="ORDERS" label="Pedidos" icon={ShoppingCartIcon} />
            <NavItem label="Relatórios Gerais" icon={ClipboardListIcon} hasDropdown={true} menuKey="REPORTS" />
            <NavItem label="Minha Agenda" icon={BellIcon} badge={overdueAgendaCount} hasDropdown={true} menuKey="AGENDA" />
            
            <div className="pt-10 pb-2">
                <p className="px-6 text-[9px] font-normal text-slate-500 uppercase tracking-[0.2em] mb-3 opacity-60">Administração</p>
                <div className="space-y-0.5">
                    {currentUser.role === UserRole.MASTER && (
                        <button onClick={() => { setShowUserManagement(true); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 px-6 py-2.5 text-slate-400 hover:text-white hover:bg-white/5 text-xs transition-all duration-300 font-light border-l-4 border-transparent">
                            <UsersIcon className="w-4 h-4 opacity-50" /> Usuários
                        </button>
                    )}
                    <button onClick={() => { setShowChangePassword(true); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 px-6 py-2.5 text-slate-400 hover:text-white hover:bg-white/5 text-xs transition-all duration-300 font-light border-l-4 border-transparent">
                        <KeyIcon className="w-4 h-4 opacity-50" /> Alterar Senha
                    </button>
                </div>
            </div>
          </nav>

          <div className="p-6 border-t border-slate-800 bg-slate-950/40">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white font-light text-sm">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-grow min-w-0">
                <p className="text-white text-xs font-normal truncate uppercase tracking-wide">{currentUser.username}</p>
                <p className="text-slate-500 text-[8px] font-normal uppercase tracking-[0.15em] opacity-70">{currentUser.role}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-2 text-slate-400 hover:text-red-400 hover:bg-red-500/5 rounded-lg text-[10px] font-normal uppercase tracking-widest transition-all duration-300 border border-white/5 hover:border-red-500/20">
              <LogoutIcon className="w-3.5 h-3.5" /> Sair do Sistema
            </button>
            <div className="mt-6 text-center">
                <p className="text-[8px] font-normal text-slate-600 uppercase tracking-[0.4em]">Versão {APP_VERSION}</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-grow lg:pl-64 flex flex-col h-full overflow-hidden">
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-40">
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
                    <MenuIcon className="w-6 h-6" />
                </button>
                <h1 className="text-lg font-bold text-slate-800 truncate">
                    {selectedClient ? (selectedEnvironment ? `${selectedClient.name} > ${selectedEnvironment.name}` : selectedClient.name) : activeTab === 'AGENDA' ? (agendaView === 'LIST' ? 'Agenda > Lista Pendências' : 'Minha Agenda') : activeTab === 'LOGISTICS' ? (logisticsView === 'FLEET' ? 'Gestão de Frota' : 'Romaneios de Carga') : activeTab === 'ORDERS' ? 'Gestão de Pedidos' : 'Painel de Supervisão'}
                </h1>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
                {isSaving && (
                    <div className="flex items-center gap-2 bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-bold border border-slate-200 animate-pulse uppercase tracking-widest">
                        <RefreshIcon className="w-3 h-3 animate-spin" /> <span className="hidden sm:inline">Sincronizando...</span>
                    </div>
                )}
            </div>
        </header>

        <div className="flex-grow flex flex-col min-h-0 overflow-y-auto" onClick={() => setOpenMenus({TEAM: false, LOGISTICS: false, REPORTS: false, AGENDA: false})}>
            {selectedClientId ? (
                selectedEnvironmentId ? (
                   <div className="p-3 md:p-6 lg:p-8">
                        <div className="max-w-5xl mx-auto space-y-6">
                            <button onClick={() => setSelectedEnvironmentId(null)} className="flex items-center gap-2 text-blue-600 font-bold hover:underline mb-4 uppercase tracking-widest text-xs">
                                <ArrowLeftIcon className="w-4 h-4"/> Voltar para Obra
                            </button>
                            {selectedEnvironment && (
                                <EnvironmentCard client={selectedClient!} clients={clients} environment={selectedEnvironment} assemblers={assemblers} onUpdateClient={handleUpdateClient} />
                            )}
                        </div>
                   </div>
                ) : (
                    <div className="p-3 md:p-6 lg:p-8">
                        <div className="max-w-6xl mx-auto space-y-6">
                            <button onClick={() => setSelectedClientId(null)} className="flex items-center gap-2 text-blue-600 font-bold hover:underline mb-4 uppercase tracking-widest text-xs">
                                <ArrowLeftIcon className="w-4 h-4"/> Ver Todas as Obras
                            </button>
                            <ClientCard client={selectedClient!} clients={clients} assemblers={assemblers} manifests={manifests} onUpdateClient={handleUpdateClient} onDeleteClient={handleDeleteClient} onSelectEnvironment={(id) => setSelectedEnvironmentId(id)} onRefresh={() => loadData(true)} isRefreshing={isRefreshing} activeTab={activeClientTab} onTabChange={setActiveClientTab} selectedAssemblerIdForView={selectedAssemblerIdForView} onSelectedAssemblerChange={setSelectedAssemblerIdForView} />
                        </div>
                    </div>
                )
            ) : (
                <div className="flex-grow flex flex-col min-h-0">
                    {activeTab === 'SUPERVISION' && (
                        <HomeScreen clients={clients} assemblers={assemblers} onSelectClient={(id) => setSelectedClientId(id)} onAddClient={handleAddClient} onRefresh={() => loadData(true)} isRefreshing={isRefreshing} />
                    )}
                    {activeTab === 'TEAM' && (
                        <div className="p-3 md:p-6 lg:p-8">
                            <TeamManagement assemblers={assemblers} clients={clients} onUpdateAssemblers={handleSaveAssemblers} onUpdateClient={handleUpdateClient} activeView={teamView} onViewChange={setTeamView} />
                        </div>
                    )}
                    {activeTab === 'LOGISTICS' && (
                        <div className="p-3 md:p-6 lg:p-8">
                            {logisticsView === 'MANIFESTS' ? (
                                <CargoManifestManager clients={clients} manifests={manifests} onUpdateClient={handleUpdateClient} onUpdateClientsBulk={handleUpdateClientsBulk} onSaveManifests={handleSaveManifests} />
                            ) : (
                                <FleetManagement vehicles={vehicles} logs={fleetLogs} onUpdateFleet={handleSaveFleet} />
                            )}
                        </div>
                    )}
                    {activeTab === 'ORDERS' && (
                        <div className="p-3 md:p-6 lg:p-8">
                            <FurnitureOrderManager orders={furnitureOrders} assemblers={assemblers} clients={clients} onUpdateOrders={handleSaveFurnitureOrders} />
                        </div>
                    )}
                    {activeTab === 'REPORTS' && (
                        <div className="p-3 md:p-6 lg:p-8">
                            <div className="space-y-8 animate-fadeIn max-w-7xl mx-auto">
                                {reportView === 'COMPLETION_FORECAST' ? (
                                    <CompletionForecastReport clients={clients} assemblers={assemblers} />
                                ) : reportView === 'ASTECA_REPORT' ? (
                                    <AstecaReport 
                                        clients={clients} 
                                        onNavigate={(clientId, envId) => {
                                            setSelectedClientId(clientId);
                                            setSelectedEnvironmentId(envId);
                                        }}
                                    />
                                ) : (
                                    <PendingIssuesReport clients={clients} assemblers={assemblers} viewMode={reportView === 'PENDING_BY_CLIENT' ? 'BY_CLIENT' : reportView === 'PENDING_GENERAL' ? 'GENERAL' : 'BY_CATEGORY'} onSelectClient={(id) => { setSelectedClientId(id); setActiveClientTab('punchlist'); }} />
                                )}
                            </div>
                        </div>
                    )}
                    {activeTab === 'AGENDA' && currentUser && (
                        <div className="p-3 md:p-6 lg:p-8">
                            <PersonalAgenda user={currentUser} agenda={agendaItems} agendaIssues={agendaIssues} onUpdateAgenda={handleSaveAgenda} onUpdateAgendaIssues={handleSaveAgendaIssues} viewMode={agendaView} />
                        </div>
                    )}
                </div>
            )}
        </div>
      </main>

      {showUserManagement && (
        <UserManagement currentUser={currentUser} users={users} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} onClose={() => setShowUserManagement(false)} />
      )}
      {showChangePassword && (
          <ChangePasswordModal onClose={() => setShowChangePassword(false)} onChangePassword={handleChangePassword} />
      )}

      {status === 'LOADING' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-2xl shadow-2xl border border-slate-200 flex flex-col items-center gap-4">
            <RefreshIcon className="w-12 h-12 text-slate-400 animate-spin" />
            <p className="text-slate-700 font-light uppercase tracking-[0.3em] text-xs">Carregando...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
