import { create } from 'zustand';

export type ViewType = 
  | 'dashboard' 
  | 'employees' 
  | 'attendance' 
  | 'leaves' 
  | 'payroll' 
  | 'salary-slip'
  | 'form16'
  | 'reports'
  | 'settings';

interface PayrollStore {
  activeView: ViewType;
  sidebarOpen: boolean;
  selectedEmployeeId: string | null;
  selectedPayrollRunId: string | null;
  refreshKey: number;
  setActiveView: (view: ViewType) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSelectedEmployeeId: (id: string | null) => void;
  setSelectedPayrollRunId: (id: string | null) => void;
  triggerRefresh: () => void;
}

export const usePayrollStore = create<PayrollStore>((set) => ({
  activeView: 'dashboard',
  sidebarOpen: true,
  selectedEmployeeId: null,
  selectedPayrollRunId: null,
  refreshKey: 0,
  setActiveView: (view) => set({ activeView: view }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSelectedEmployeeId: (id) => set({ selectedEmployeeId: id }),
  setSelectedPayrollRunId: (id) => set({ selectedPayrollRunId: id }),
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));