import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AIMarketUpdatesPanel } from './panels/AIMarketUpdatesPanel';
import { TradeActivityTerminal } from './panels/TradeActivityTerminal';
import { NewsPanel } from './panels/NewsPanel';
import { CompactMetricsBar } from './panels/CompactMetricsBar';
import { cn } from '@/lib/utils';

const PANELS = [
  { id: 'ai', title: 'AI Analysis', Component: AIMarketUpdatesPanel },
  { id: 'trades', title: 'Trade Activity', Component: TradeActivityTerminal },
  { id: 'news', title: 'Crypto News', Component: NewsPanel },
];

export function MobileDashboard() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi, onSelect]);

  return (
    <div className="h-full flex flex-col">
      {/* Compact Metrics */}
      <CompactMetricsBar />
      
      {/* Panel Indicators */}
      <div className="flex items-center justify-center gap-2 py-2 px-4 flex-shrink-0">
        {PANELS.map((panel, idx) => (
          <button
            key={panel.id}
            onClick={() => emblaApi?.scrollTo(idx)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-300",
              selectedIndex === idx 
                ? "bg-primary text-primary-foreground shadow-lg" 
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {panel.title}
          </button>
        ))}
      </div>
      
      {/* Swipeable Panels */}
      <div className="flex-1 overflow-hidden min-h-0" ref={emblaRef}>
        <div className="flex h-full">
          {PANELS.map(({ id, Component }) => (
            <div key={id} className="flex-[0_0_100%] min-w-0 h-full px-2 pb-2">
              <Component fullHeight expanded />
            </div>
          ))}
        </div>
      </div>
      
      {/* Navigation Arrows */}
      <div className="flex justify-between items-center px-4 py-2 flex-shrink-0 border-t border-border/50">
        <button
          onClick={() => emblaApi?.scrollPrev()}
          disabled={!canScrollPrev}
          className={cn(
            "p-2 rounded-full transition-all duration-200",
            canScrollPrev 
              ? "bg-primary/20 text-primary hover:bg-primary/30" 
              : "bg-muted/30 text-muted-foreground/30"
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        
        {/* Dot indicators */}
        <div className="flex items-center gap-1.5">
          {PANELS.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                selectedIndex === idx 
                  ? "bg-primary w-4" 
                  : "bg-muted-foreground/30"
              )}
            />
          ))}
        </div>
        
        <button
          onClick={() => emblaApi?.scrollNext()}
          disabled={!canScrollNext}
          className={cn(
            "p-2 rounded-full transition-all duration-200",
            canScrollNext 
              ? "bg-primary/20 text-primary hover:bg-primary/30" 
              : "bg-muted/30 text-muted-foreground/30"
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
