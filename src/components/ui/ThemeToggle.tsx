import { Moon, Sun, Monitor } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';

type ThemeMode = 'colorful' | 'light' | 'bw' | 'system';

export function ThemeToggle() {
  const { theme, setTheme } = useAppStore();
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>('dark');
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme-mode') as ThemeMode) || 'colorful';
    }
    return 'colorful';
  });

  // Detect system preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    setSystemPreference(mediaQuery.matches ? 'light' : 'dark');

    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'light' : 'dark');
      if (mode === 'system') {
        setTheme(e.matches ? 'light' : 'colorful');
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [mode, setTheme]);

  // Apply theme based on mode on mount
  useEffect(() => {
    if (mode === 'system') {
      setTheme(systemPreference === 'light' ? 'light' : 'colorful');
    }
  }, []);

  const handleModeChange = (newMode: ThemeMode) => {
    // Add transition class
    document.documentElement.classList.add('theme-switching');
    
    setMode(newMode);
    localStorage.setItem('theme-mode', newMode);

    if (newMode === 'system') {
      setTheme(systemPreference === 'light' ? 'light' : 'colorful');
    } else if (newMode === 'light') {
      setTheme('light');
    } else if (newMode === 'bw') {
      setTheme('bw');
    } else {
      setTheme('colorful');
    }

    // Remove transition class after animation
    setTimeout(() => {
      document.documentElement.classList.remove('theme-switching');
    }, 300);
  };

  const CurrentIcon = mode === 'light' ? Sun : mode === 'system' ? Monitor : Moon;
  const iconOpacity = mode === 'bw' ? 'opacity-50' : '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <CurrentIcon className={`h-4 w-4 ${iconOpacity}`} />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuItem
          onClick={() => handleModeChange('colorful')}
          className={mode === 'colorful' ? 'bg-primary/20' : ''}
        >
          <Moon className="mr-2 h-4 w-4" />
          Dark (Colorful)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleModeChange('bw')}
          className={mode === 'bw' ? 'bg-primary/20' : ''}
        >
          <Moon className="mr-2 h-4 w-4 opacity-50" />
          Dark (Noir)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleModeChange('light')}
          className={mode === 'light' ? 'bg-primary/20' : ''}
        >
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleModeChange('system')}
          className={mode === 'system' ? 'bg-primary/20' : ''}
        >
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
