import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Shield, 
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { useAPIDiagnostics } from '@/hooks/useAPIDiagnostics';
import { formatDistanceToNow } from 'date-fns';

export function APIDiagnosticsPanel() {
  const { diagnostics, loading, healthScore, testConnection, refetch } = useAPIDiagnostics();

  const getLatencyColor = (latency: number | null) => {
    if (!latency) return 'text-muted-foreground';
    if (latency < 100) return 'text-green-500';
    if (latency < 200) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  const formatLastRequest = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">API Diagnostics</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${getHealthScoreColor(healthScore)}`}>
              {healthScore}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : diagnostics.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-4">
            No exchanges configured
          </div>
        ) : (
          diagnostics.map((exchange) => (
            <div 
              key={exchange.id}
              className="p-3 rounded-lg bg-background/50 border border-border/30 space-y-2"
            >
              {/* Header Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {exchange.is_connected ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="font-medium text-sm capitalize">
                    {exchange.exchange_name}
                  </span>
                </div>
                
                <div className="flex items-center gap-3 text-xs">
                  {/* Latency */}
                  <span className={getLatencyColor(exchange.latency_ms)}>
                    {exchange.latency_ms ? `${exchange.latency_ms}ms` : '—'}
                  </span>
                  
                  {/* Last Request */}
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatLastRequest(exchange.last_successful_request)}
                  </span>
                </div>
              </div>
              
              {/* Status Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* IP Whitelist Badge */}
                  {exchange.ip_whitelisted ? (
                    <Badge variant="outline" className="text-xs h-5 gap-1 text-green-500 border-green-500/30">
                      <Shield className="h-3 w-3" />
                      IP Whitelisted
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs h-5 gap-1 text-yellow-500 border-yellow-500/30">
                      <AlertTriangle className="h-3 w-3" />
                      No IP Restriction
                    </Badge>
                  )}
                  
                  {/* Error Count */}
                  {exchange.error_count > 0 && (
                    <Badge variant="destructive" className="text-xs h-5">
                      {exchange.error_count} errors
                    </Badge>
                  )}
                </div>
                
                {/* Test Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection(exchange.exchange_name)}
                  className="h-6 text-xs px-2"
                >
                  Test
                </Button>
              </div>
              
              {/* Error Message */}
              {exchange.last_error && (
                <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 truncate">
                  {exchange.last_error}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
