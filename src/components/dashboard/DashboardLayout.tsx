import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  LineChart, 
  Blocks, 
  FlaskConical, 
  Trophy, 
  Settings,
  Power,
  Menu,
  X,
  Zap,
  ArrowLeftRight,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LiveDashboard } from './tabs/LiveDashboard';
import { PortfolioAnalytics } from './tabs/PortfolioAnalytics';
import { StrategyBuilder } from './tabs/StrategyBuilder';
import { Backtesting } from './tabs/Backtesting';
import { Leaderboard } from './tabs/Leaderboard';
import { SettingsTab } from './tabs/SettingsTab';
import { TradingTab } from './tabs/TradingTab';
import { NotificationCenter } from './NotificationCenter';
import { KillSwitchDialog } from './KillSwitchDialog';
import { SystemHealthBar } from './SystemHealthBar';
import { NotificationDropdown } from './NotificationDropdown';
import { initializeAppStore } from '@/store/useAppStore';
import { supabase } from '@/integrations/supabase/client';

const tabs = [
  { id: 'dashboard', label: 'Live Dashboard', icon: LayoutDashboard },
  { id: 'trading', label: 'Trading', icon: ArrowLeftRight },
  { id: 'analytics', label: 'Analytics', icon: LineChart },
  { id: 'strategy', label: 'Strategy', icon: Blocks },
  { id: 'backtest', label: 'Backtesting', icon: FlaskConical },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type TabId = typeof tabs[number]['id'];

export function DashboardLayout() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [showKillSwitch, setShowKillSwitch] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Initialize SSOT store on mount
  useEffect(() => {
    const cleanup = initializeAppStore();
    return cleanup;
  }, []);

  // Fetch unread notification count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      const { count } = await supabase
        .from('system_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)
        .eq('dismissed', false);
      setUnreadCount(count || 0);
    };

    fetchUnreadCount();

    // Subscribe to notification changes
    const channel = supabase
      .channel('notification-count')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'system_notifications' 
      }, () => fetchUnreadCount())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <LiveDashboard />;
      case 'trading':
        return <TradingTab />;
      case 'analytics':
        return <PortfolioAnalytics />;
      case 'strategy':
        return <StrategyBuilder />;
      case 'backtest':
        return <Backtesting />;
      case 'leaderboard':
        return <Leaderboard />;
      case 'notifications':
        return <NotificationCenter />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <LiveDashboard />;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
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
                'gap-2 transition-all relative',
                activeTab === tab.id
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden lg:inline">{tab.label}</span>
              {tab.id === 'notifications' && unreadCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
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
          <NotificationDropdown />
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

      {/* Main Content - Tab-aware scrolling */}
      <main className={cn(
        "flex-1 p-2",
        activeTab === 'dashboard' ? "overflow-hidden" : "overflow-y-auto scrollbar-thin"
      )}>
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
