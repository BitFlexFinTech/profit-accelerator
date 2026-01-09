import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Setup from "./pages/Setup";
import VPSDashboard from "./pages/VPSDashboard";
import CloudCredentials from "./pages/CloudCredentials";
import VPSSetup from "./pages/VPSSetup";
import UserSettings from "./pages/UserSettings";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initializeAppStore, useAppStore } from "@/store/useAppStore";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";

const queryClient = new QueryClient();

function AppContent() {
  // Cross-tab sync only - realtime handled by initializeAppStore (SSOT)
  useCrossTabSync();
  
  // Apply saved theme on mount
  const theme = useAppStore((s) => s.theme);
  
  useEffect(() => {
    // Remove all theme classes first
    document.documentElement.classList.remove('theme-bw', 'theme-light');
    // Add the appropriate theme class
    if (theme === 'bw') {
      document.documentElement.classList.add('theme-bw');
    } else if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
    }
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/vps-dashboard" element={<VPSDashboard />} />
        <Route path="/cloud-credentials" element={<CloudCredentials />} />
        <Route path="/vps-setup" element={<VPSSetup />} />
        <Route path="/settings" element={<UserSettings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

const App = () => {
  // Initialize global store and realtime subscriptions on mount
  useEffect(() => {
    console.log('[App] Initializing app store and realtime subscriptions...');
    const cleanup = initializeAppStore();
    return cleanup;
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppContent />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
