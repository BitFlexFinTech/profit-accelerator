import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  LineChart, 
  Blocks, 
  FlaskConical, 
  Trophy, 
  Settings,
  Bell,
  Power,
  Menu,
  X,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LiveDashboard } from './tabs/LiveDashboard';
import { PortfolioAnalytics } from './tabs/PortfolioAnalytics';
import { StrategyBuilder } from './tabs/StrategyBuilder';
import { Backtesting } from './tabs/Backtesting';
import { Leaderboard } from './tabs/Leaderboard';
import { SettingsTab } from './tabs/SettingsTab';
import { KillSwitchDialog } from './KillSwitchDialog';
import { SystemHealthBar } from './SystemHealthBar';
import { initializeAppStore } from '@/store/useAppStore';

const tabs = [
  { id: 'dashboard', label: 'Live Dashboard', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: LineChart },
  { id: 'strategy', label: 'Strategy', icon: Blocks },
  { id: 'backtest', label: 'Backtesting', icon: FlaskConical },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type TabId = typeof tabs[number]['id'];

export function DashboardLayout() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [showKillSwitch, setShowKillSwitch] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Initialize SSOT store on mount
  useEffect(() => {
    const cleanup = initializeAppStore();
    return cleanup;
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <LiveDashboard />;
      case 'analytics':
        return <PortfolioAnalytics />;
      case 'strategy':
        return <StrategyBuilder />;
      case 'backtest':
        return <Backtesting />;
      case 'leaderboard':
        return <Leaderboard />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <LiveDashboard />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navigation Bar */}
      <header className="glass-card rounded-none border-x-0 border-t-0 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>

          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg hidden sm:inline gradient-text">
              Tokyo HFT
            </span>
          </div>

          {/* System Health Bar */}
          <div className="hidden md:flex">
            <SystemHealthBar onNavigateToSettings={() => setActiveTab('settings')} />
          </div>
        </div>

        {/* Desktop Tab Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'gap-2 transition-all',
                activeTab === tab.id
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden lg:inline">{tab.label}</span>
            </Button>
            ))}
          
          {/* Setup Link */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/setup')}
            className="gap-2 text-accent hover:text-accent hover:bg-accent/20 border border-accent/30"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden lg:inline">Setup</span>
          </Button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20"
            onClick={() => setShowKillSwitch(true)}
          >
            <Power className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Mobile Navigation Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <nav className="absolute top-16 left-0 right-0 glass-card rounded-none border-x-0 p-4 space-y-2">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant="ghost"
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  'w-full justify-start gap-3',
                  activeTab === tab.id
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </Button>
            ))}
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 overflow-auto">
        {renderTabContent()}
      </main>

      {/* Kill Switch Dialog */}
      <KillSwitchDialog 
        open={showKillSwitch} 
        onOpenChange={setShowKillSwitch} 
      />
    </div>
  );
}
