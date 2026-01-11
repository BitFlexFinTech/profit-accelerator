import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Settings2, GripVertical, RotateCcw } from 'lucide-react';
import { useWidgetStore, WidgetConfig } from '@/store/useWidgetStore';
import { cn } from '@/lib/utils';

const WIDGET_LABELS: Record<string, string> = {
  ticker: 'Price Ticker',
  'mode-progress': 'Mode Progress',
  'control-bar': 'Control Bar',
  metrics: 'Compact Metrics',
  'ai-analysis': 'AI Market Analysis',
  'trade-terminal': 'Trade Activity Terminal',
  news: 'Crypto News',
  underwater: 'Underwater Positions',
  'ai-health': 'AI Provider Health',
};

interface WidgetCustomizerProps {
  dashboardId: string;
}

export function WidgetCustomizer({ dashboardId }: WidgetCustomizerProps) {
  const { getLayout, setWidgetVisibility, reorderWidgets, resizeWidget, resetLayout } =
    useWidgetStore();
  const layout = getLayout(dashboardId);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, widgetId: string) => {
    setDraggedItem(widgetId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetId) return;

    const newLayout = [...layout];
    const dragIdx = newLayout.findIndex((w) => w.id === draggedItem);
    const targetIdx = newLayout.findIndex((w) => w.id === targetId);

    if (dragIdx === -1 || targetIdx === -1) return;

    const [removed] = newLayout.splice(dragIdx, 1);
    newLayout.splice(targetIdx, 0, removed);

    // Update order values
    newLayout.forEach((w, i) => {
      w.order = i;
    });
    reorderWidgets(dashboardId, newLayout);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const sortedLayout = [...layout].sort((a, b) => a.order - b.order);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Customize Widgets">
          <Settings2 className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[320px]">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            Customize Widgets
            <Button
              variant="ghost"
              size="sm"
              onClick={() => resetLayout(dashboardId)}
              className="text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {sortedLayout.map((widget) => (
            <div
              key={widget.id}
              draggable
              onDragStart={(e) => handleDragStart(e, widget.id)}
              onDragOver={(e) => handleDragOver(e, widget.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                'flex items-center gap-2 p-3 rounded-lg border bg-card cursor-move transition-all',
                draggedItem === widget.id && 'opacity-50 border-primary'
              )}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 text-sm truncate">
                {WIDGET_LABELS[widget.id] || widget.id}
              </span>
              <select
                value={widget.size}
                onChange={(e) =>
                  resizeWidget(dashboardId, widget.id, e.target.value as WidgetConfig['size'])
                }
                className="text-xs bg-background border rounded px-2 py-1 w-12"
              >
                <option value="small">S</option>
                <option value="medium">M</option>
                <option value="large">L</option>
              </select>
              <Switch
                checked={widget.visible}
                onCheckedChange={(v) => setWidgetVisibility(dashboardId, widget.id, v)}
              />
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Drag to reorder • Toggle to show/hide • Size affects grid layout
        </p>
      </SheetContent>
    </Sheet>
  );
}
