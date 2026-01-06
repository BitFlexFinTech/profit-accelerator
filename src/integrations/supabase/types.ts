export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          unlocked: boolean | null
          unlocked_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          unlocked?: boolean | null
          unlocked_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          unlocked?: boolean | null
          unlocked_at?: string | null
        }
        Relationships: []
      }
      ai_config: {
        Row: {
          api_key: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          model: string
          provider: string
          updated_at: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          model?: string
          provider?: string
          updated_at?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          model?: string
          provider?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          principal_after: number | null
          principal_before: number | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          principal_after?: number | null
          principal_before?: number | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          principal_after?: number | null
          principal_before?: number | null
        }
        Relationships: []
      }
      backtest_results: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          max_drawdown: number | null
          sharpe_ratio: number | null
          start_date: string
          strategy_name: string
          symbol: string
          total_pnl: number | null
          total_trades: number | null
          win_rate: number | null
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          max_drawdown?: number | null
          sharpe_ratio?: number | null
          start_date: string
          strategy_name: string
          symbol: string
          total_pnl?: number | null
          total_trades?: number | null
          win_rate?: number | null
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          max_drawdown?: number | null
          sharpe_ratio?: number | null
          start_date?: string
          strategy_name?: string
          symbol?: string
          total_pnl?: number | null
          total_trades?: number | null
          win_rate?: number | null
        }
        Relationships: []
      }
      cloud_config: {
        Row: {
          created_at: string | null
          credentials: Json | null
          id: string
          instance_type: string | null
          is_active: boolean | null
          provider: string
          region: string
          status: string | null
          updated_at: string | null
          use_free_tier: boolean | null
        }
        Insert: {
          created_at?: string | null
          credentials?: Json | null
          id?: string
          instance_type?: string | null
          is_active?: boolean | null
          provider: string
          region?: string
          status?: string | null
          updated_at?: string | null
          use_free_tier?: boolean | null
        }
        Update: {
          created_at?: string | null
          credentials?: Json | null
          id?: string
          instance_type?: string | null
          is_active?: boolean | null
          provider?: string
          region?: string
          status?: string | null
          updated_at?: string | null
          use_free_tier?: boolean | null
        }
        Relationships: []
      }
      exchange_connections: {
        Row: {
          agent_private_key: string | null
          api_key: string | null
          api_passphrase: string | null
          api_secret: string | null
          balance_updated_at: string | null
          balance_usdt: number | null
          created_at: string | null
          exchange_name: string
          id: string
          is_connected: boolean | null
          last_ping_at: string | null
          last_ping_ms: number | null
          updated_at: string | null
          wallet_address: string | null
        }
        Insert: {
          agent_private_key?: string | null
          api_key?: string | null
          api_passphrase?: string | null
          api_secret?: string | null
          balance_updated_at?: string | null
          balance_usdt?: number | null
          created_at?: string | null
          exchange_name: string
          id?: string
          is_connected?: boolean | null
          last_ping_at?: string | null
          last_ping_ms?: number | null
          updated_at?: string | null
          wallet_address?: string | null
        }
        Update: {
          agent_private_key?: string | null
          api_key?: string | null
          api_passphrase?: string | null
          api_secret?: string | null
          balance_updated_at?: string | null
          balance_usdt?: number | null
          created_at?: string | null
          exchange_name?: string
          id?: string
          is_connected?: boolean | null
          last_ping_at?: string | null
          last_ping_ms?: number | null
          updated_at?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      latency_thresholds: {
        Row: {
          created_at: string | null
          critical_threshold_ms: number | null
          exchange_name: string
          id: string
          warning_threshold_ms: number | null
        }
        Insert: {
          created_at?: string | null
          critical_threshold_ms?: number | null
          exchange_name: string
          id?: string
          warning_threshold_ms?: number | null
        }
        Update: {
          created_at?: string | null
          critical_threshold_ms?: number | null
          exchange_name?: string
          id?: string
          warning_threshold_ms?: number | null
        }
        Relationships: []
      }
      master_password: {
        Row: {
          created_at: string | null
          id: string
          password_hash: string
          session_timeout_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          password_hash: string
          session_timeout_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          password_hash?: string
          session_timeout_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          created_at: string | null
          daily_pnl: number | null
          id: string
          monthly_pnl: number | null
          snapshot_date: string | null
          total_balance: number
          weekly_pnl: number | null
        }
        Insert: {
          created_at?: string | null
          daily_pnl?: number | null
          id?: string
          monthly_pnl?: number | null
          snapshot_date?: string | null
          total_balance: number
          weekly_pnl?: number | null
        }
        Update: {
          created_at?: string | null
          daily_pnl?: number | null
          id?: string
          monthly_pnl?: number | null
          snapshot_date?: string | null
          total_balance?: number
          weekly_pnl?: number | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string | null
          current_usage: number | null
          exchange_name: string
          id: string
          requests_per_minute: number | null
          reset_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_usage?: number | null
          exchange_name: string
          id?: string
          requests_per_minute?: number | null
          reset_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_usage?: number | null
          exchange_name?: string
          id?: string
          requests_per_minute?: number | null
          reset_at?: string | null
        }
        Relationships: []
      }
      sentiment_data: {
        Row: {
          fear_greed_index: number | null
          id: string
          recorded_at: string | null
          sentiment_score: number | null
          source: string
          symbol: string | null
        }
        Insert: {
          fear_greed_index?: number | null
          id?: string
          recorded_at?: string | null
          sentiment_score?: number | null
          source: string
          symbol?: string | null
        }
        Update: {
          fear_greed_index?: number | null
          id?: string
          recorded_at?: string | null
          sentiment_score?: number | null
          source?: string
          symbol?: string | null
        }
        Relationships: []
      }
      strategy_rules: {
        Row: {
          action: string
          condition: string
          created_at: string | null
          id: string
          indicator: string
          is_active: boolean | null
          strategy_name: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          action: string
          condition: string
          created_at?: string | null
          id?: string
          indicator: string
          is_active?: boolean | null
          strategy_name: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          action?: string
          condition?: string
          created_at?: string | null
          id?: string
          indicator?: string
          is_active?: boolean | null
          strategy_name?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: []
      }
      telegram_config: {
        Row: {
          bot_token: string | null
          chat_id: string | null
          created_at: string | null
          id: string
          notifications_enabled: boolean | null
          notify_daily_summary: boolean | null
          notify_on_error: boolean | null
          notify_on_trade: boolean | null
          updated_at: string | null
        }
        Insert: {
          bot_token?: string | null
          chat_id?: string | null
          created_at?: string | null
          id?: string
          notifications_enabled?: boolean | null
          notify_daily_summary?: boolean | null
          notify_on_error?: boolean | null
          notify_on_trade?: boolean | null
          updated_at?: string | null
        }
        Update: {
          bot_token?: string | null
          chat_id?: string | null
          created_at?: string | null
          id?: string
          notifications_enabled?: boolean | null
          notify_daily_summary?: boolean | null
          notify_on_error?: boolean | null
          notify_on_trade?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trade_copies: {
        Row: {
          copy_ratio: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          source_exchange: string
          symbol: string
          target_exchange: string
          updated_at: string | null
        }
        Insert: {
          copy_ratio?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          source_exchange: string
          symbol: string
          target_exchange: string
          updated_at?: string | null
        }
        Update: {
          copy_ratio?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          source_exchange?: string
          symbol?: string
          target_exchange?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      trading_config: {
        Row: {
          created_at: string | null
          global_kill_switch_enabled: boolean | null
          id: string
          max_daily_drawdown_percent: number | null
          max_daily_trades: number | null
          max_position_size: number | null
          order_size: number | null
          stop_loss: number | null
          take_profit_1: number | null
          take_profit_2: number | null
          trading_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          global_kill_switch_enabled?: boolean | null
          id?: string
          max_daily_drawdown_percent?: number | null
          max_daily_trades?: number | null
          max_position_size?: number | null
          order_size?: number | null
          stop_loss?: number | null
          take_profit_1?: number | null
          take_profit_2?: number | null
          trading_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          global_kill_switch_enabled?: boolean | null
          id?: string
          max_daily_drawdown_percent?: number | null
          max_daily_trades?: number | null
          max_position_size?: number | null
          order_size?: number | null
          stop_loss?: number | null
          take_profit_1?: number | null
          take_profit_2?: number | null
          trading_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trading_journal: {
        Row: {
          ai_reasoning: string | null
          closed_at: string | null
          created_at: string | null
          entry_price: number
          exchange: string
          exit_price: number | null
          id: string
          pnl: number | null
          quantity: number
          side: string
          status: string | null
          symbol: string
        }
        Insert: {
          ai_reasoning?: string | null
          closed_at?: string | null
          created_at?: string | null
          entry_price: number
          exchange: string
          exit_price?: number | null
          id?: string
          pnl?: number | null
          quantity: number
          side: string
          status?: string | null
          symbol: string
        }
        Update: {
          ai_reasoning?: string | null
          closed_at?: string | null
          created_at?: string | null
          entry_price?: number
          exchange?: string
          exit_price?: number | null
          id?: string
          pnl?: number | null
          quantity?: number
          side?: string
          status?: string | null
          symbol?: string
        }
        Relationships: []
      }
      vps_config: {
        Row: {
          cors_proxy_enabled: boolean | null
          created_at: string | null
          emergency_stopped_at: string | null
          execution_buffer_ms: number | null
          id: string
          instance_type: string | null
          outbound_ip: string | null
          provider: string | null
          region: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          cors_proxy_enabled?: boolean | null
          created_at?: string | null
          emergency_stopped_at?: string | null
          execution_buffer_ms?: number | null
          id?: string
          instance_type?: string | null
          outbound_ip?: string | null
          provider?: string | null
          region?: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          cors_proxy_enabled?: boolean | null
          created_at?: string | null
          emergency_stopped_at?: string | null
          execution_buffer_ms?: number | null
          id?: string
          instance_type?: string | null
          outbound_ip?: string | null
          provider?: string | null
          region?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
