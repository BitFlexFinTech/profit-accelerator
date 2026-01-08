import { useState, useEffect } from 'react';
import { Trophy, Flame, Star, Medal, Calendar, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

const ICON_MAP: Record<string, React.ElementType> = {
  Trophy,
  Flame,
  Star,
  Medal
};

export function Leaderboard() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [bestDays, setBestDays] = useState<BestDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
          // Group by date and calculate daily stats
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

          // Convert to array and sort by PnL
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
    <div className="space-y-6 animate-fade-in">
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

      {/* Best Trading Days */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Best Trading Days
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
