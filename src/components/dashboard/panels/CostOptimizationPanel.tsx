import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCloudInfrastructure, PROVIDER_ICONS } from '@/hooks/useCloudInfrastructure';
import { 
  DollarSign, 
  TrendingDown, 
  ArrowRight, 
  CheckCircle2, 
  RefreshCw,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function CostOptimizationPanel() {
  const { 
    totalMonthlyCost, 
    costOptimizationSuggestions, 
    providers,
    switchPrimary,
    runCostOptimization,
    refresh 
  } = useCloudInfrastructure();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());
  const [loadingApply, setLoadingApply] = useState<string | null>(null);

  const runningProviders = providers.filter(
    p => p.status === 'running' || p.status === 'idle'
  );
  const paidRunning = runningProviders.filter(p => !p.is_free_tier);
  const freeRunning = runningProviders.filter(p => p.is_free_tier);

  const potentialSavings = costOptimizationSuggestions.reduce(
    (sum, s) => sum + s.savings_monthly, 
    0
  );

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    const result = await runCostOptimization();
    if (result.success) {
      toast.success('Cost analysis complete');
      refresh();
    } else {
      toast.error('Failed to analyze costs');
    }
    setIsAnalyzing(false);
  };

  const handleApplySuggestion = async (suggestion: typeof costOptimizationSuggestions[0]) => {
    const key = `${suggestion.current_provider}-${suggestion.recommended_provider}`;
    setLoadingApply(key);
    
    const result = await switchPrimary(suggestion.recommended_provider);
    if (result.success) {
      toast.success(`Switched to ${suggestion.recommended_provider} - saving $${suggestion.savings_monthly.toFixed(2)}/mo`);
      setAppliedSuggestions(prev => new Set(prev).add(key));
    } else {
      toast.error('Failed to apply optimization');
    }
    setLoadingApply(null);
  };

  return (
    <Card className="p-6 bg-card/50 border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-success" />
          <h3 className="font-semibold">Cost Optimization</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Analyze
        </Button>
      </div>

      {/* Current Spend Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Monthly Spend</p>
          <p className="text-lg font-bold font-mono text-warning">
            ${totalMonthlyCost.toFixed(2)}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Paid Nodes</p>
          <p className="text-lg font-bold">{paidRunning.length}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Free Nodes</p>
          <p className="text-lg font-bold text-success">{freeRunning.length}</p>
        </div>
      </div>

      {/* Potential Savings Banner */}
      {potentialSavings > 0 && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/30 mb-4 flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-success" />
          <div className="flex-1">
            <p className="font-medium text-success">
              Potential savings: ${potentialSavings.toFixed(2)}/month
            </p>
            <p className="text-xs text-muted-foreground">
              {costOptimizationSuggestions.length} optimization{costOptimizationSuggestions.length !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>
      )}

      {/* Suggestions List */}
      <ScrollArea className="h-[200px]">
        {costOptimizationSuggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2 text-success" />
            <p className="text-sm">Your infrastructure is cost-optimized!</p>
            <p className="text-xs mt-1">No recommendations at this time</p>
          </div>
        ) : (
          <div className="space-y-3">
            {costOptimizationSuggestions.map((suggestion, idx) => {
              const key = `${suggestion.current_provider}-${suggestion.recommended_provider}`;
              const isApplied = appliedSuggestions.has(key);
              const isLoading = loadingApply === key;
              
              return (
                <div
                  key={idx}
                  className={cn(
                    "p-3 rounded-lg border transition-all",
                    isApplied 
                      ? "bg-success/10 border-success/30" 
                      : "bg-secondary/30 border-border/30"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* From Provider */}
                    <div className="flex items-center gap-1">
                      <span className="text-lg">{PROVIDER_ICONS[suggestion.current_provider]}</span>
                      <span className="text-sm font-medium capitalize">{suggestion.current_provider}</span>
                    </div>
                    
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    
                    {/* To Provider */}
                    <div className="flex items-center gap-1">
                      <span className="text-lg">{PROVIDER_ICONS[suggestion.recommended_provider]}</span>
                      <span className="text-sm font-medium capitalize">{suggestion.recommended_provider}</span>
                      <Badge className="bg-success/20 text-success text-xs">FREE</Badge>
                    </div>
                    
                    <div className="flex-1" />
                    
                    {/* Savings */}
                    <Badge className="bg-success/20 text-success">
                      Save ${suggestion.savings_monthly.toFixed(2)}/mo
                    </Badge>
                    
                    {/* Apply Button */}
                    {isApplied ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={isLoading}
                        onClick={() => handleApplySuggestion(suggestion)}
                      >
                        {isLoading ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          'Apply'
                        )}
                      </Button>
                    )}
                  </div>
                  
                  {/* Reason */}
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    {suggestion.latency_difference_ms <= 0 ? (
                      <CheckCircle2 className="h-3 w-3 text-success" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-warning" />
                    )}
                    {suggestion.reason}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="text-xs text-muted-foreground pt-3 mt-4 border-t border-border/50">
        Recommendations based on latency + cost analysis. Free tier providers: GCP, Oracle, Azure, AWS (750h/mo).
      </div>
    </Card>
  );
}
