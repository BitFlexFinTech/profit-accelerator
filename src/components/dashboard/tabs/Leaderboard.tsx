import { Trophy, Medal, Star, Flame } from 'lucide-react';

const achievements = [
  { icon: Trophy, title: 'First Profit', description: 'Complete your first profitable trade', unlocked: true },
  { icon: Flame, title: 'Hot Streak', description: '10 winning trades in a row', unlocked: true },
  { icon: Star, title: 'Daily Goal', description: 'Hit $100 profit in a single day', unlocked: true },
  { icon: Medal, title: 'Marathon Trader', description: '1000 total trades executed', unlocked: false },
];

const bestDays = [
  { date: '2024-12-28', pnl: 847.23, trades: 34, winRate: 82 },
  { date: '2024-12-15', pnl: 623.11, trades: 28, winRate: 75 },
  { date: '2024-12-03', pnl: 512.45, trades: 22, winRate: 77 },
  { date: '2024-11-29', pnl: 489.00, trades: 31, winRate: 71 },
  { date: '2024-11-18', pnl: 445.67, trades: 19, winRate: 84 },
];

export function Leaderboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Leaderboard & Achievements</h2>
      </div>

      {/* Achievements */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-warning" />
          Achievements
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {achievements.map((achievement) => (
            <div
              key={achievement.title}
              className={`p-4 rounded-lg border transition-all ${
                achievement.unlocked
                  ? 'bg-warning/10 border-warning/30'
                  : 'bg-secondary/30 border-border opacity-50'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  achievement.unlocked ? 'bg-warning/20' : 'bg-secondary'
                }`}>
                  <achievement.icon className={`w-5 h-5 ${
                    achievement.unlocked ? 'text-warning' : 'text-muted-foreground'
                  }`} />
                </div>
                <div>
                  <p className="font-medium">{achievement.title}</p>
                  {achievement.unlocked && (
                    <span className="text-xs text-warning">Unlocked!</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{achievement.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Best Trading Days */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Star className="w-5 h-5 text-accent" />
          Best Trading Days
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-muted-foreground border-b border-border">
                <th className="pb-3 font-medium">Rank</th>
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">P&L</th>
                <th className="pb-3 font-medium">Trades</th>
                <th className="pb-3 font-medium">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {bestDays.map((day, index) => (
                <tr key={day.date} className="border-b border-border/50">
                  <td className="py-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      index === 0 ? 'bg-warning/20 text-warning' :
                      index === 1 ? 'bg-muted text-foreground' :
                      index === 2 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-secondary text-muted-foreground'
                    }`}>
                      {index + 1}
                    </div>
                  </td>
                  <td className="py-3 font-medium">{day.date}</td>
                  <td className="py-3 text-success font-bold">+${day.pnl.toFixed(2)}</td>
                  <td className="py-3">{day.trades}</td>
                  <td className="py-3">
                    <span className="px-2 py-1 rounded bg-success/20 text-success text-sm">
                      {day.winRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
