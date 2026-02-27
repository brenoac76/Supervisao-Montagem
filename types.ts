
export enum ChecklistStatus {
  Completed = 'Concluído',
  Pending = 'Falta',
  Defective = 'ASTECA'
}

export interface Media {
  id: string;
  type: 'image' | 'video';
  url: string; // Data URL
  name: string;
  observation?: string; 
}

export interface Annotation {
  id: string;
  type: 'text' | 'arrow' | 'curvedArrow';
  x: number;
  y: number;
  content?: string;
  angle?: number;
  scale?: number;
  color: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  url: string;
  type: string;
  annotations: Annotation[];
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  description: string;
  status: ChecklistStatus;
  media: Media[];
  defectObservation?: string; 
  observations?: string; 
  completionDate?: string; 
  defectDate?: string; 
  progress?: number;
  assemblerId?: string; 
  scheduledStart?: string; 
  scheduledEnd?: string; 
  isDelivery?: boolean; 
  // Campos ASTECA
  astecaOC?: string;
  astecaNumber?: string;
  astecaDate?: string;
  astecaReason?: string;
  astecaMedia?: Media[];
}

export interface AgendaItem {
  id: string;
  userId: string; // Vínculo obrigatório com o usuário para privacidade
  title: string;
  description: string;
  createdAt: string; // ISO String
  dueDate: string;   // ISO String (Data/Hora do Lembrete)
  status: 'Pending' | 'Done';
  notified: boolean; // Controle para o alerta sonoro não repetir
  lastEmailDate?: string; // Data do último e-mail de alerta enviado
}

export interface AgendaIssue {
  id: string;
  userId: string;
  date: string;
  clientName: string;
  description: string;
  media: Media[];
  status: 'Pending' | 'Resolved';
  createdAt: string;
}

export interface Vehicle {
    id: string;
    name: string;
    plate: string;
}

export interface VehicleUsageLog {
    id: string;
    date: string;
    time: string; // Hora de Saída
    returnDate?: string; // Data de Entrega (Baixa)
    returnTime?: string; // Hora de Entrega (Baixa)
    vehicleId: string;
    vehicleName: string;
    plate: string;
    driverName: string;
    createdAt: string;
}

export interface TodeschiniChecklist {
  items: Record<string, 'C' | 'NC' | null>;
  problems?: string;
  conclusion: Record<string, 'C' | 'NC' | null>;
  responsibility: 'Fabrica' | 'Servico' | 'Cliente' | null;
  supervisorOpinion?: string;
  clientComments?: string;
  acknowledgementDate?: string;
  clientName?: string;
  signatureBase64?: string;
  supervisorArrival?: string;
}

export interface WorkReleaseChecklist {
    clientName: string;
    date: string;
    time: string;
    location: string;
    items: {
        power: 'SIM' | 'NÃO' | null;
        lighting: 'SIM' | 'NÃO' | null;
        cleanEnvironment: 'SIM' | 'NÃO' | null;
        stonesForCutting: 'SIM' | 'NÃO' | null;
        thirdPartiesWorking: 'SIM' | 'NÃO' | null;
        hydraulicElectricProjects: 'SIM' | 'NÃO' | null;
        finalPaint: 'SIM' | 'NÃO' | null;
        windowsInstalled: 'SIM' | 'NÃO' | null;
    };
    cuttingDate?: string;
    missingWindowsDetails?: string;
    media?: Media[];
    observations?: string;
    signatureBase64?: string;
}

export interface SupervisionReport {
  id: string;
  date: string;
  assemblerId: string;
  assemblerName: string;
  items: Record<string, 'C' | 'NC' | null>;
  observations: string;
  media: Media[];
}

export interface PreAssemblyChecklist {
    clientName?: string;
    contract: string;
    phone: string;
    neighborhood: string;
    zipCode: string;
    city: string;
    deliveryCompletionDate?: string;
    assemblyStartDate?: string;
    assemblyEndDate?: string;
    selectedEnvironmentIds: string[];
    checklistValues: Record<string, 'SIM' | 'NÃO' | null>;
    signatureBase64?: string;
}

export interface Environment {
  id:string;
  name: string;
  initials?: string;
  checklist: ChecklistItem[];
  projectFiles?: ProjectFile[];
  observations?: string;
  assembler?: string;
  assemblerId?: string;
  assembler2?: string;
  assembler2Id?: string;
  assembler1Percentage?: number;
  assembler2Percentage?: number;
  helperId?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  completionDate?: string;
  manualProgress?: number;
  paidPercentage?: number; // Percentual já pago anteriormente
  paidMonth?: string; // Mês do pagamento anterior (ex: "2024-01")
  paymentLimit?: number; // NOVO: Limite de pagamento/Parcial para um mês específico
  limitMonth?: string; // NOVO: Mês em que o limite se aplica (ex: "2024-02")
  weight?: number; // 1, 2 ou 3
  todeschiniChecklist?: TodeschiniChecklist;
  isAssistance?: boolean;
  purchaseOrder?: string;
  portalValue?: number;
}

export enum UnitType {
  House = 'Casa',
  Apartment = 'Apartamento'
}

export interface VisitLog {
  id: string;
  date: string;
  notes: string;
  responsible?: string;
  media: Media[];
  requests?: string;
}

export interface PunchListIssue {
  id: string;
  description: string;
  status: 'Pending' | 'Completed';
  media: Media[];
  observations?: string;
  creationDate: string; 
  completionDate?: string;
  scheduledExecutionDate?: string;
  assignedAssemblerId?: string;
  category?: 'Falta' | 'Peça Batida' | 'Geral';
}

export interface PunchListItem {
  id: string;
  description: string;
  media: Media[];
  issues: PunchListIssue[]; 
  status?: 'Pending' | 'Completed'; 
  observations?: string;
  creationDate?: string;
  completionDate?: string;
}

export interface PunchList {
  id: string;
  title: string;
  startDate?: string;
  assembler?: string;
  items: PunchListItem[];
}

export interface MaterialOrderItem {
  id: string;
  quantity: number;
  description: string;
  media?: Media;
}

export interface MaterialOrder {
  id: string;
  creationDate: string;
  purchaseOrderNumber: string;
  assembler?: string;
  items: MaterialOrderItem[];
  observations?: string;
}

export interface ShippingItem {
  id: string;
  description: string;
  quantity: number;
  unit?: string;
  assembler?: string;
  status: 'Pending' | 'Shipped';
  manifestId?: string;
  shippedDate?: string;
  createdAt: string;
}

export interface CargoManifest {
  id: string;
  date: string;
  destination: string;
  driver?: string;
  vehicle?: string;
  observations?: string;
  items: Array<ShippingItem & { clientId: string, clientName: string, clientAddress: string }>;
  status: 'Open' | 'Closed';
  createdAt: string;
}

export interface FurnitureOrderItem {
  id: string;
  quantity: number;
  unit: string;
  description: string;
  media?: Media;
}

export interface FurnitureOrder {
  id: string;
  date: string;
  clientName: string;
  assemblerName: string;
  items: FurnitureOrderItem[];
  status: 'Pending' | 'Completed';
  batchId?: string; // NOVO: Agrupamento em códigos de envio
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  address: string;
  unitType: UnitType;
  assembler?: string;
  environments: Environment[];
  observations?: string;
  startDate?: string;
  visitLogs: VisitLog[];
  punchList?: PunchList;
  punchLists?: PunchList[];
  todeschiniChecklist?: TodeschiniChecklist;
  preAssemblyChecklist?: PreAssemblyChecklist;
  workReleaseChecklist?: WorkReleaseChecklist;
  supervisionReports?: SupervisionReport[];
  materialOrders?: MaterialOrder[];
  shippingItems?: ShippingItem[];
}

export interface Assembler {
  id: string;
  name: string;
  role: string;
}

export enum UserRole {
  MASTER = 'Master',
  OPERATIONAL = 'Operacional'
}

export interface User {
  id: string;
  username: string;
  password: string;
  role: UserRole;
}

export interface AssemblerScore {
  id: string;
  assemblerId: string;
  assemblerName: string;
  clientName: string;
  date: string;
  punctuality: 'Excelente' | 'Bom' | 'Regular';
  organization: 'Excelente' | 'Bom' | 'Regular';
  posture: 'Excelente' | 'Bom' | 'Regular';
  finish: 'Excelente' | 'Bom' | 'Regular';
  cleaning: 'Excelente' | 'Bom' | 'Regular';
  uniform: 'Excelente' | 'Bom' | 'Regular';
  observation?: string;
}
