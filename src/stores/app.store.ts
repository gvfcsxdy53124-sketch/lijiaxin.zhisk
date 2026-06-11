import {create} from 'zustand';

interface AppState {
  sidebarCollapsed: boolean;
  pageTitle: string;
  setPageTitle: (title: string) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  pageTitle: '知识库管理',
  setPageTitle: (pageTitle) => set({pageTitle}),
  toggleSidebar: () => set((state) => ({sidebarCollapsed: !state.sidebarCollapsed})),
}));
