/**
 * Central registry of button tooltips for consistency across the application
 */
export const BUTTON_TOOLTIPS = {
  // Strategy
  newStrategy: 'Create a new trading strategy using the visual builder',
  startLive: 'Start this strategy with LIVE trading - real money will be used',
  pauseStrategy: 'Pause this strategy - stops all new trades but keeps positions open',
  deleteStrategy: 'Permanently delete this strategy and all its settings',
  
  // Strategy Settings
  positionSize: 'The dollar amount to use for each trade in this strategy',
  profitTarget: 'Target profit per trade before automatically closing the position',
  dailyGoal: 'Your daily profit target - track progress with the progress bar',
  leverage: 'Leverage multiplier for futures trades (1x = no leverage)',
  
  // Bot Control
  startBot: 'Start the trading bot - begins automated LIVE trading based on active strategies',
  stopBot: 'Stop the trading bot - halts all automated trading immediately',
  restartBot: 'Restart the trading bot with current settings',
  syncBalances: 'Refresh all exchange balances from connected exchanges',
  killSwitch: 'EMERGENCY: Immediately stop ALL trading and optionally close all positions',
  
  // Trading
  buyOrder: 'Place a buy order to open a long position or add to existing',
  sellOrder: 'Place a sell order to close a position or open a short',
  closePosition: 'Close this position at current market price',
  cancelOrder: 'Cancel this pending order',
  
  // Mode Selection
  spotMode: 'Trade in spot market - no leverage, own the actual asset',
  futuresMode: 'Trade in futures/perpetual market - use leverage for amplified gains/losses',
  
  // Settings & Credentials
  saveCredentials: 'Save and encrypt your API credentials securely',
  testConnection: 'Test the API connection to verify your credentials work correctly',
  deleteCredentials: 'Remove these saved credentials',
  
  // Navigation
  viewDashboard: 'View the main trading dashboard',
  viewSettings: 'Open settings and configuration',
  viewVPS: 'Manage VPS servers for low-latency trading',
  viewStrategies: 'View and manage your trading strategies',
  
  // VPS Management
  deployVPS: 'Deploy a new VPS instance for automated trading',
  restartVPS: 'Restart the VPS server',
  stopVPS: 'Stop the VPS server - trading will halt',
  startVPS: 'Start this VPS instance',
  viewLogs: 'View real-time logs from the VPS',
  viewSSH: 'Open SSH terminal to connect to this server',
  copyIP: 'Copy server IP address to clipboard',
  editName: 'Edit the nickname for this server',
  deleteVPS: 'Permanently delete this VPS instance',
  rebootVPS: 'Reboot the VPS server (bot will restart)',
  
  // Refresh & Sync
  refreshData: 'Refresh data from the server',
  syncData: 'Synchronize data across all connected services',
  
  // Quick Actions
  startTrading: 'Enable automated LIVE trading on all active strategies',
  pauseAll: 'Pause all trading activity immediately - positions remain open',
  testAlert: 'Send a test notification to Telegram to verify connectivity',
  
  // Amount Presets
  amount25: 'Set order amount to 25% of available balance',
  amount50: 'Set order amount to 50% of available balance',
  amount75: 'Set order amount to 75% of available balance',
  amount100: 'Set order amount to 100% of available balance (max)',
  
  // Navigation & Actions
  goBack: 'Go back to the previous step',
  done: 'Complete setup and close',
  
  // Telegram
  openBotFather: 'Open Telegram to create a bot with @BotFather',
  haveBotToken: 'Proceed if you already have a bot token',
  validateToken: 'Verify your bot token is valid',
  openTelegramBot: 'Open your bot in Telegram to send /start',
  
  // Exchange Wizard
  testExchange: 'Test the exchange connection with your credentials',
  saveExchange: 'Save credentials and connect to this exchange',
} as const;

export type ButtonTooltipKey = keyof typeof BUTTON_TOOLTIPS;
