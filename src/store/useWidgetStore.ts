import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WidgetConfig {
  id: string;
  visible: boolean;
  order: number;
  size: 'small' | 'medium' | 'large';
}

interface WidgetStore {
  layouts: Record<string, WidgetConfig[]>;
  getLayout: (dashboardId: string) => WidgetConfig[];
  setWidgetVisibility: (dashboardId: string, widgetId: string, visible: boolean) => void;
  reorderWidgets: (dashboardId: string, newOrder: WidgetConfig[]) => void;
  resizeWidget: (dashboardId: string, widgetId: string, size: 'small' | 'medium' | 'large') => void;
  resetLayout: (dashboardId: string) => void;
}

const DEFAULT_LAYOUTS: Record<string, WidgetConfig[]> = {
  live: [
    { id: 'ticker', visible: true, order: 0, size: 'large' },
    { id: 'mode-progress', visible: true, order: 1, size: 'medium' },
    { id: 'control-bar', visible: true, order: 2, size: 'large' },
    { id: 'metrics', visible: true, order: 3, size: 'large' },
    { id: 'ai-analysis', visible: true, order: 4, size: 'medium' },
    { id: 'trade-terminal', visible: true, order: 5, size: 'medium' },
    { id: 'news', visible: true, order: 6, size: 'medium' },
    { id: 'underwater', visible: true, order: 7, size: 'small' },
    { id: 'ai-health', visible: true, order: 8, size: 'medium' },
  ],
};

export const useWidgetStore = create<WidgetStore>()(
  persist(
    (set, get) => ({
      layouts: DEFAULT_LAYOUTS,

      getLayout: (dashboardId) => {
        const stored = get().layouts[dashboardId];
        if (stored) return stored;
        return DEFAULT_LAYOUTS[dashboardId] || [];
      },

      setWidgetVisibility: (dashboardId, widgetId, visible) => {
        set((state) => {
          const current = state.layouts[dashboardId] || DEFAULT_LAYOUTS[dashboardId] || [];
          return {
            layouts: {
              ...state.layouts,
              [dashboardId]: current.map((w) =>
                w.id === widgetId ? { ...w, visible } : w
              ),
            },
          };
        });
      },

      reorderWidgets: (dashboardId, newOrder) => {
        set((state) => ({
          layouts: { ...state.layouts, [dashboardId]: newOrder },
        }));
      },

      resizeWidget: (dashboardId, widgetId, size) => {
        set((state) => {
          const current = state.layouts[dashboardId] || DEFAULT_LAYOUTS[dashboardId] || [];
          return {
            layouts: {
              ...state.layouts,
              [dashboardId]: current.map((w) =>
                w.id === widgetId ? { ...w, size } : w
              ),
            },
          };
        });
      },

      resetLayout: (dashboardId) => {
        set((state) => ({
          layouts: {
            ...state.layouts,
            [dashboardId]: DEFAULT_LAYOUTS[dashboardId] || [],
          },
        }));
      },
    }),
    { name: 'widget-layouts' }
  )
);
