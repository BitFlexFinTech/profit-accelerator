import { useState, useEffect, forwardRef, ComponentPropsWithoutRef } from 'react';
import { Trophy, Flame, Star, Medal, Calendar, Loader2, Brain, Target, TrendingUp, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface Achievement {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  unlocked: boolean | null;
  unlocked_at: string | null;
}

interface BestDay {
  trade_date: string;
  total_pnl: number;
  trade_count: number;
  win_rate: number;
}

interface TradingSession {
  id: string;
  session_type: string;
  total_trades: number;
  winning_trades: number;
  total_pnl: number;
  win_rate: number;
  consistency_score: number;
  started_at: string;
}

interface AIProviderRanking {
  provider: string;
  total_recommendations: number;
  correct_predictions: number;
  accuracy_percent: number;
  avg_profit: number;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Trophy,
  Flame,
  Star,
  Medal
};

const PROVIDER_COLORS: Record<string, string> = {
  groq: 'text-orange-500',
  cerebras: 'text-purple-500',
  mistral: 'text-blue-500',
  openrouter: 'text-green-500',
  together: 'text-cyan-500',
  gemini: 'text-indigo-500',
};

export const Leaderboard = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>((props, ref) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [bestDays, setBestDays] = useState<BestDay[]>([]);
  const [sessions, setSessions] = useState<TradingSession[]>([]);
  const [aiRankings, setAIRankings] = useState<AIProviderRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('days');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch achievements
        const { data: achievementsData } = await supabase
          .from('achievements')
          .select('*')
          .order('unlocked', { ascending: false })
          .order('created_at', { ascending: true });

        if (achievementsData) {
          setAchievements(achievementsData);
        }

        // Fetch best trading days from trading_journal
        const { data: journalData } = await supabase
          .from('trading_journal')
          .select('created_at, pnl')
          .not('pnl', 'is', null);

        if (journalData && journalData.length > 0) {
          const dailyStats = journalData.reduce((acc, trade) => {
            const date = format(new Date(trade.created_at || new Date()), 'yyyy-MM-dd');
            if (!acc[date]) {
              acc[date] = { trades: [], totalPnl: 0, wins: 0 };
            }
            const pnl = parseFloat(trade.pnl?.toString() || '0');
            acc[date].trades.push(pnl);
            acc[date].totalPnl += pnl;
            if (pnl > 0) acc[date].wins++;
            return acc;
          }, {} as Record<string, { trades: number[], totalPnl: number, wins: number }>);

          const sortedDays = Object.entries(dailyStats)
            .map(([date, stats]) => ({
              trade_date: date,
              total_pnl: stats.totalPnl,
              trade_count: stats.trades.length,
              win_rate: stats.trades.length > 0 ? (stats.wins / stats.trades.length) * 100 : 0
            }))
            .sort((a, b) => b.total_pnl - a.total_pnl)
            .slice(0, 5);

          setBestDays(sortedDays);
        }

        // Fetch trading sessions
        const { data: sessionsData } = await supabase
          .from('trading_sessions')
          .select('*')
          .order('total_pnl', { ascending: false })
          .limit(10);

        if (sessionsData) {
          setSessions(sessionsData.map(s => ({
            ...s,
            total_trades: s.total_trades || 0,
            winning_trades: s.winning_trades || 0,
            total_pnl: s.total_pnl || 0,
            win_rate: s.win_rate || 0,
            consistency_score: s.consistency_score || 0,
          })));
        }

        // Fetch AI provider rankings from ai_trade_decisions
        const { data: aiDecisions } = await supabase
          .from('ai_trade_decisions')
          .select('ai_provider, actual_profit, was_executed')
          .not('actual_profit', 'is', null);

        if (aiDecisions && aiDecisions.length > 0) {
          const providerStats = aiDecisions.reduce((acc, d) => {
            const provider = d.ai_provider;
            if (!acc[provider]) {
              acc[provider] = { total: 0, correct: 0, profits: [] };
            }
            acc[provider].total++;
            if ((d.actual_profit || 0) > 0) acc[provider].correct++;
            acc[provider].profits.push(d.actual_profit || 0);
            return acc;
          }, {} as Record<string, { total: number; correct: number; profits: number[] }>);
          
          const rankings = Object.entries(providerStats).map(([provider, stats]) => ({
            provider,
            total_recommendations: stats.total,
            correct_predictions: stats.correct,
            accuracy_percent: Math.round((stats.correct / stats.total) * 100),
            avg_profit: stats.profits.reduce((a, b) => a + b, 0) / stats.profits.length
          })).sort((a, b) => b.accuracy_percent - a.accuracy_percent);
          
          setAIRankings(rankings);
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const getIcon = (iconName: string | null) => {
    const IconComponent = iconName ? ICON_MAP[iconName] || Trophy : Trophy;
    return IconComponent;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div ref={ref} {...props} className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Leaderboard & Achievements</h2>
      </div>

      {/* Achievements Section */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          {achievements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No achievements yet</p>
              <p className="text-xs mt-1">Complete trading milestones to unlock achievements</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {achievements.map((achievement) => {
                const IconComponent = getIcon(achievement.icon);
                return (
                  <div
                    key={achievement.id}
                    className={`p-4 rounded-lg border transition-all ${
                      achievement.unlocked
                        ? 'bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/30'
                        : 'bg-muted/30 border-border opacity-50 grayscale'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        achievement.unlocked ? 'bg-yellow-500/20' : 'bg-secondary'
                      }`}>
                        <IconComponent 
                          className={`w-5 h-5 ${
                            achievement.unlocked ? 'text-yellow-500' : 'text-muted-foreground'
                          }`} 
                        />
                      </div>
                      <div>
                        <p className="font-medium">{achievement.name}</p>
                        {achievement.unlocked && (
                          <span className="text-xs text-yellow-500">Unlocked!</span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {achievement.description}
                    </p>
                    {achievement.unlocked && achievement.unlocked_at && (
                      <p className="text-xs text-yellow-600 mt-2">
                        {format(new Date(achievement.unlocked_at), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabbed Leaderboards */}
      <Card className="glass-card">
        <CardHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="days" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Best Days
              </TabsTrigger>
              <TabsTrigger value="sessions" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Sessions
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                AI Accuracy
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {/* Best Days Tab */}
          {activeTab === 'days' && (
            <>
              {bestDays.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No trading history yet</p>
                  <p className="text-xs mt-1">Complete trades to see your best performing days</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bestDays.map((day, index) => (
                      <TableRow key={day.trade_date}>
                        <TableCell>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                            index === 1 ? 'bg-muted text-foreground' :
                            index === 2 ? 'bg-orange-500/20 text-orange-400' :
                            'bg-secondary text-muted-foreground'
                          }`}>
                            {index + 1}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {format(new Date(day.trade_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${day.total_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {day.total_pnl >= 0 ? '+' : ''}${day.total_pnl.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">{day.trade_count}</TableCell>
                        <TableCell className="text-right">
                          <span className="px-2 py-1 rounded bg-success/20 text-success text-sm">
                            {day.win_rate.toFixed(1)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {/* Sessions Tab */}
          {activeTab === 'sessions' && (
            <>
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No trading sessions yet</p>
                  <p className="text-xs mt-1">Complete trading sessions to see rankings</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Consistency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session, index) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                            index === 1 ? 'bg-muted text-foreground' :
                            index === 2 ? 'bg-orange-500/20 text-orange-400' :
                            'bg-secondary text-muted-foreground'
                          }`}>
                            {index + 1}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            session.session_type === 'live' ? 'destructive' :
                            session.session_type === 'paper' ? 'default' : 'secondary'
                          }>
                            {session.session_type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-bold ${session.total_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {session.total_pnl >= 0 ? '+' : ''}${session.total_pnl.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">{session.total_trades}</TableCell>
                        <TableCell className="text-right">
                          <span className="px-2 py-1 rounded bg-success/20 text-success text-sm">
                            {session.win_rate.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <Progress value={session.consistency_score} className="w-16 h-2" />
                            <span className="text-xs text-muted-foreground">{session.consistency_score}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {/* AI Accuracy Tab */}
          {activeTab === 'ai' && (
            <>
              {aiRankings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No AI decision data yet</p>
                  <p className="text-xs mt-1">AI providers will be ranked based on prediction accuracy</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {aiRankings.map((ranking, index) => (
                    <div 
                      key={ranking.provider}
                      className={`p-4 rounded-lg border ${
                        index === 0 ? 'bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/30' : 'bg-secondary/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                            index === 1 ? 'bg-muted text-foreground' :
                            'bg-secondary text-muted-foreground'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <p className={`font-bold capitalize ${PROVIDER_COLORS[ranking.provider] || 'text-foreground'}`}>
                              {ranking.provider}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {ranking.total_recommendations} recommendations
                            </p>
                          </div>
                          {index === 0 && (
                            <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                              <Zap className="w-3 h-3 mr-1" />
                              Most Accurate
                            </Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{ranking.accuracy_percent}%</p>
                          <p className="text-xs text-muted-foreground">accuracy</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Correct</p>
                          <p className="font-mono text-success">{ranking.correct_predictions}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total</p>
                          <p className="font-mono">{ranking.total_recommendations}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Avg Profit</p>
                          <p className={`font-mono ${ranking.avg_profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                            ${ranking.avg_profit.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <Progress value={ranking.accuracy_percent} className="mt-3 h-2" />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

Leaderboard.displayName = "Leaderboard";
