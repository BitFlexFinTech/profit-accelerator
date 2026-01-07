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
import NotFound from "./pages/NotFound";
import { initializeAppStore } from "@/store/useAppStore";

const queryClient = new QueryClient();

const App = () => {
  // Initialize global store and realtime subscriptions on mount
  useEffect(() => {
    console.log('[App] Initializing app store and realtime subscriptions...');
    const cleanup = initializeAppStore();
    return cleanup;
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/vps-dashboard" element={<VPSDashboard />} />
          <Route path="/cloud-credentials" element={<CloudCredentials />} />
          <Route path="/vps-setup" element={<VPSSetup />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
