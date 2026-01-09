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
      ai_market_updates: {
        Row: {
          ai_provider: string | null
          confidence: number | null
          created_at: string | null
          current_price: number | null
          exchange_name: string
          expected_move_percent: number | null
          id: string
          insight: string
          price_change_24h: number | null
          profit_timeframe_minutes: number | null
          recommended_side: string | null
          resistance_level: number | null
          sentiment: string | null
          support_level: number | null
          symbol: string
        }
        Insert: {
          ai_provider?: string | null
          confidence?: number | null
          created_at?: string | null
          current_price?: number | null
          exchange_name: string
          expected_move_percent?: number | null
          id?: string
          insight: string
          price_change_24h?: number | null
          profit_timeframe_minutes?: number | null
          recommended_side?: string | null
          resistance_level?: number | null
          sentiment?: string | null
          support_level?: number | null
          symbol: string
        }
        Update: {
          ai_provider?: string | null
          confidence?: number | null
          created_at?: string | null
          current_price?: number | null
          exchange_name?: string
          expected_move_percent?: number | null
          id?: string
          insight?: string
          price_change_24h?: number | null
          profit_timeframe_minutes?: number | null
          recommended_side?: string | null
          resistance_level?: number | null
          sentiment?: string | null
          support_level?: number | null
          symbol?: string
        }
        Relationships: []
      }
      ai_provider_performance: {
        Row: {
          id: string
          profitable_signals: number | null
          provider_name: string
          recorded_at: string | null
          total_profit_usdt: number | null
          trades_analyzed: number | null
        }
        Insert: {
          id?: string
          profitable_signals?: number | null
          provider_name: string
          recorded_at?: string | null
          total_profit_usdt?: number | null
          trades_analyzed?: number | null
        }
        Update: {
          id?: string
          profitable_signals?: number | null
          provider_name?: string
          recorded_at?: string | null
          total_profit_usdt?: number | null
          trades_analyzed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_performance_provider_name_fkey"
            columns: ["provider_name"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["provider_name"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_endpoint: string
          api_key_field: string
          border_class: string
          color_class: string
          color_hex: string
          cooldown_until: string | null
          created_at: string | null
          current_usage: number | null
          daily_usage: number | null
          display_name: string
          error_count: number | null
          free_tier_info: string | null
          get_key_url: string
          has_secret: boolean | null
          id: string
          is_active: boolean | null
          is_enabled: boolean | null
          last_daily_reset_at: string | null
          last_error: string | null
          last_reset_at: string | null
          last_used_at: string | null
          model_name: string
          priority: number | null
          provider_name: string
          rate_limit_rpd: number | null
          rate_limit_rpm: number | null
          secret_name: string
          short_name: string
          success_count: number | null
          total_latency_ms: number | null
        }
        Insert: {
          api_endpoint: string
          api_key_field?: string
          border_class: string
          color_class: string
          color_hex: string
          cooldown_until?: string | null
          created_at?: string | null
          current_usage?: number | null
          daily_usage?: number | null
          display_name: string
          error_count?: number | null
          free_tier_info?: string | null
          get_key_url: string
          has_secret?: boolean | null
          id?: string
          is_active?: boolean | null
          is_enabled?: boolean | null
          last_daily_reset_at?: string | null
          last_error?: string | null
          last_reset_at?: string | null
          last_used_at?: string | null
          model_name: string
          priority?: number | null
          provider_name: string
          rate_limit_rpd?: number | null
          rate_limit_rpm?: number | null
          secret_name: string
          short_name: string
          success_count?: number | null
          total_latency_ms?: number | null
        }
        Update: {
          api_endpoint?: string
          api_key_field?: string
          border_class?: string
          color_class?: string
          color_hex?: string
          cooldown_until?: string | null
          created_at?: string | null
          current_usage?: number | null
          daily_usage?: number | null
          display_name?: string
          error_count?: number | null
          free_tier_info?: string | null
          get_key_url?: string
          has_secret?: boolean | null
          id?: string
          is_active?: boolean | null
          is_enabled?: boolean | null
          last_daily_reset_at?: string | null
          last_error?: string | null
          last_reset_at?: string | null
          last_used_at?: string | null
          model_name?: string
          priority?: number | null
          provider_name?: string
          rate_limit_rpd?: number | null
          rate_limit_rpm?: number | null
          secret_name?: string
          short_name?: string
          success_count?: number | null
          total_latency_ms?: number | null
        }
        Relationships: []
      }
      ai_trade_decisions: {
        Row: {
          actual_outcome: string | null
          actual_profit: number | null
          ai_provider: string
          confidence: number
          created_at: string | null
          entry_price: number | null
          exchange: string
          expected_profit_percent: number | null
          expected_time_minutes: number | null
          id: string
          reasoning: string | null
          recommended_side: string
          symbol: string
          target_price: number | null
          trade_id: string | null
          was_executed: boolean | null
        }
        Insert: {
          actual_outcome?: string | null
          actual_profit?: number | null
          ai_provider: string
          confidence: number
          created_at?: string | null
          entry_price?: number | null
          exchange: string
          expected_profit_percent?: number | null
          expected_time_minutes?: number | null
          id?: string
          reasoning?: string | null
          recommended_side: string
          symbol: string
          target_price?: number | null
          trade_id?: string | null
          was_executed?: boolean | null
        }
        Update: {
          actual_outcome?: string | null
          actual_profit?: number | null
          ai_provider?: string
          confidence?: number
          created_at?: string | null
          entry_price?: number | null
          exchange?: string
          expected_profit_percent?: number | null
          expected_time_minutes?: number | null
          id?: string
          reasoning?: string | null
          recommended_side?: string
          symbol?: string
          target_price?: number | null
          trade_id?: string | null
          was_executed?: boolean | null
        }
        Relationships: []
      }
      alert_config: {
        Row: {
          alert_type: string
          channel: string
          cooldown_minutes: number | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          latency_threshold_healthy: number | null
          latency_threshold_jitter: number | null
          threshold_value: number | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          alert_type: string
          channel: string
          cooldown_minutes?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          latency_threshold_healthy?: number | null
          latency_threshold_jitter?: number | null
          threshold_value?: number | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          alert_type?: string
          channel?: string
          cooldown_minutes?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          latency_threshold_healthy?: number | null
          latency_threshold_jitter?: number | null
          threshold_value?: number | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      alert_history: {
        Row: {
          acknowledged_at: string | null
          alert_type: string
          channel: string
          id: string
          message: string | null
          sent_at: string | null
          severity: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          alert_type: string
          channel: string
          id?: string
          message?: string | null
          sent_at?: string | null
          severity?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          alert_type?: string
          channel?: string
          id?: string
          message?: string | null
          sent_at?: string | null
          severity?: string | null
        }
        Relationships: []
      }
      api_request_logs: {
        Row: {
          endpoint: string
          error_message: string | null
          exchange_name: string
          id: string
          latency_ms: number | null
          method: string | null
          request_time: string | null
          status_code: number | null
          success: boolean | null
        }
        Insert: {
          endpoint: string
          error_message?: string | null
          exchange_name: string
          id?: string
          latency_ms?: number | null
          method?: string | null
          request_time?: string | null
          status_code?: number | null
          success?: boolean | null
        }
        Update: {
          endpoint?: string
          error_message?: string | null
          exchange_name?: string
          id?: string
          latency_ms?: number | null
          method?: string | null
          request_time?: string | null
          status_code?: number | null
          success?: boolean | null
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
      backup_schedule: {
        Row: {
          created_at: string | null
          cron_expression: string | null
          id: string
          is_enabled: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          provider: string
          retention_days: number | null
        }
        Insert: {
          created_at?: string | null
          cron_expression?: string | null
          id?: string
          is_enabled?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          provider: string
          retention_days?: number | null
        }
        Update: {
          created_at?: string | null
          cron_expression?: string | null
          id?: string
          is_enabled?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          provider?: string
          retention_days?: number | null
        }
        Relationships: []
      }
      balance_history: {
        Row: {
          created_at: string | null
          exchange_breakdown: Json | null
          id: string
          snapshot_time: string | null
          total_balance: number
          version: number | null
        }
        Insert: {
          created_at?: string | null
          exchange_breakdown?: Json | null
          id?: string
          snapshot_time?: string | null
          total_balance?: number
          version?: number | null
        }
        Update: {
          created_at?: string | null
          exchange_breakdown?: Json | null
          id?: string
          snapshot_time?: string | null
          total_balance?: number
          version?: number | null
        }
        Relationships: []
      }
      bot_signals: {
        Row: {
          bot_name: string
          confidence: number
          created_at: string | null
          current_price: number | null
          exchange_name: string | null
          expected_move_percent: number | null
          id: string
          processed: boolean | null
          side: string
          symbol: string
          timeframe_minutes: number | null
        }
        Insert: {
          bot_name: string
          confidence: number
          created_at?: string | null
          current_price?: number | null
          exchange_name?: string | null
          expected_move_percent?: number | null
          id?: string
          processed?: boolean | null
          side: string
          symbol: string
          timeframe_minutes?: number | null
        }
        Update: {
          bot_name?: string
          confidence?: number
          created_at?: string | null
          current_price?: number | null
          exchange_name?: string | null
          expected_move_percent?: number | null
          id?: string
          processed?: boolean | null
          side?: string
          symbol?: string
          timeframe_minutes?: number | null
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
      cloud_credentials: {
        Row: {
          created_at: string | null
          encrypted_value: string
          error_message: string | null
          field_name: string
          id: string
          last_validated_at: string | null
          provider: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          encrypted_value: string
          error_message?: string | null
          field_name: string
          id?: string
          last_validated_at?: string | null
          provider: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          encrypted_value?: string
          error_message?: string | null
          field_name?: string
          id?: string
          last_validated_at?: string | null
          provider?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cost_analysis: {
        Row: {
          analysis_date: string
          avg_latency_ms: number | null
          compute_cost: number | null
          cpu_avg_percent: number | null
          created_at: string | null
          id: string
          network_cost: number | null
          network_gb_out: number | null
          provider: string
          ram_avg_percent: number | null
          storage_cost: number | null
          total_cost: number | null
          trades_executed: number | null
          uptime_hours: number | null
        }
        Insert: {
          analysis_date?: string
          avg_latency_ms?: number | null
          compute_cost?: number | null
          cpu_avg_percent?: number | null
          created_at?: string | null
          id?: string
          network_cost?: number | null
          network_gb_out?: number | null
          provider: string
          ram_avg_percent?: number | null
          storage_cost?: number | null
          total_cost?: number | null
          trades_executed?: number | null
          uptime_hours?: number | null
        }
        Update: {
          analysis_date?: string
          avg_latency_ms?: number | null
          compute_cost?: number | null
          cpu_avg_percent?: number | null
          created_at?: string | null
          id?: string
          network_cost?: number | null
          network_gb_out?: number | null
          provider?: string
          ram_avg_percent?: number | null
          storage_cost?: number | null
          total_cost?: number | null
          trades_executed?: number | null
          uptime_hours?: number | null
        }
        Relationships: []
      }
      cost_optimization_reports: {
        Row: {
          created_at: string | null
          id: string
          optimizations_applied: Json | null
          period_end: string
          period_start: string
          recommendations: Json | null
          report_date: string
          savings: number | null
          total_cost_after: number | null
          total_cost_before: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          optimizations_applied?: Json | null
          period_end: string
          period_start: string
          recommendations?: Json | null
          report_date: string
          savings?: number | null
          total_cost_after?: number | null
          total_cost_before?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          optimizations_applied?: Json | null
          period_end?: string
          period_start?: string
          recommendations?: Json | null
          report_date?: string
          savings?: number | null
          total_cost_after?: number | null
          total_cost_before?: number | null
        }
        Relationships: []
      }
      cost_recommendations: {
        Row: {
          created_at: string | null
          current_monthly_cost: number | null
          current_provider: string | null
          id: string
          is_dismissed: boolean | null
          priority: string | null
          reason: string | null
          recommendation_type: string
          recommended_monthly_cost: number | null
          recommended_provider: string | null
          savings_percent: number | null
        }
        Insert: {
          created_at?: string | null
          current_monthly_cost?: number | null
          current_provider?: string | null
          id?: string
          is_dismissed?: boolean | null
          priority?: string | null
          reason?: string | null
          recommendation_type: string
          recommended_monthly_cost?: number | null
          recommended_provider?: string | null
          savings_percent?: number | null
        }
        Update: {
          created_at?: string | null
          current_monthly_cost?: number | null
          current_provider?: string | null
          id?: string
          is_dismissed?: boolean | null
          priority?: string | null
          reason?: string | null
          recommendation_type?: string
          recommended_monthly_cost?: number | null
          recommended_provider?: string | null
          savings_percent?: number | null
        }
        Relationships: []
      }
      credential_permissions: {
        Row: {
          can_trade: boolean | null
          can_withdraw: boolean | null
          created_at: string | null
          credential_id: string | null
          credential_type: string
          detected_scopes: string[] | null
          excess_scopes: string[] | null
          expiry_date: string | null
          has_expiry: boolean | null
          id: string
          ip_restricted: boolean | null
          is_read_only: boolean | null
          last_analyzed_at: string | null
          provider: string
          required_scopes: string[] | null
          risk_level: string | null
          security_score: number | null
          whitelisted_range: string | null
        }
        Insert: {
          can_trade?: boolean | null
          can_withdraw?: boolean | null
          created_at?: string | null
          credential_id?: string | null
          credential_type: string
          detected_scopes?: string[] | null
          excess_scopes?: string[] | null
          expiry_date?: string | null
          has_expiry?: boolean | null
          id?: string
          ip_restricted?: boolean | null
          is_read_only?: boolean | null
          last_analyzed_at?: string | null
          provider: string
          required_scopes?: string[] | null
          risk_level?: string | null
          security_score?: number | null
          whitelisted_range?: string | null
        }
        Update: {
          can_trade?: boolean | null
          can_withdraw?: boolean | null
          created_at?: string | null
          credential_id?: string | null
          credential_type?: string
          detected_scopes?: string[] | null
          excess_scopes?: string[] | null
          expiry_date?: string | null
          has_expiry?: boolean | null
          id?: string
          ip_restricted?: boolean | null
          is_read_only?: boolean | null
          last_analyzed_at?: string | null
          provider?: string
          required_scopes?: string[] | null
          risk_level?: string | null
          security_score?: number | null
          whitelisted_range?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credential_permissions_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credential_vault"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_vault: {
        Row: {
          access_count: number | null
          auth_tag: string
          created_at: string | null
          credential_type: string
          encrypted_data: string
          id: string
          iv: string
          key_version: number | null
          label: string | null
          last_accessed_at: string | null
          last_rotated_at: string | null
          provider: string
          rotation_reminder_days: number | null
          updated_at: string | null
        }
        Insert: {
          access_count?: number | null
          auth_tag: string
          created_at?: string | null
          credential_type: string
          encrypted_data: string
          id?: string
          iv: string
          key_version?: number | null
          label?: string | null
          last_accessed_at?: string | null
          last_rotated_at?: string | null
          provider: string
          rotation_reminder_days?: number | null
          updated_at?: string | null
        }
        Update: {
          access_count?: number | null
          auth_tag?: string
          created_at?: string | null
          credential_type?: string
          encrypted_data?: string
          id?: string
          iv?: string
          key_version?: number | null
          label?: string | null
          last_accessed_at?: string | null
          last_rotated_at?: string | null
          provider?: string
          rotation_reminder_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      deployment_logs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          deployment_id: string
          error_details: string | null
          id: string
          instance_id: string | null
          message: string | null
          progress: number | null
          provider: string
          stage: string | null
          stage_number: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          deployment_id: string
          error_details?: string | null
          id?: string
          instance_id?: string | null
          message?: string | null
          progress?: number | null
          provider: string
          stage?: string | null
          stage_number?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          deployment_id?: string
          error_details?: string | null
          id?: string
          instance_id?: string | null
          message?: string | null
          progress?: number | null
          provider?: string
          stage?: string | null
          stage_number?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deployment_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "vps_instances"
            referencedColumns: ["id"]
          },
        ]
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
          last_error: string | null
          last_error_at: string | null
          last_ping_at: string | null
          last_ping_ms: number | null
          updated_at: string | null
          version: number | null
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
          last_error?: string | null
          last_error_at?: string | null
          last_ping_at?: string | null
          last_ping_ms?: number | null
          updated_at?: string | null
          version?: number | null
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
          last_error?: string | null
          last_error_at?: string | null
          last_ping_at?: string | null
          last_ping_ms?: number | null
          updated_at?: string | null
          version?: number | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      exchange_latency_history: {
        Row: {
          exchange_name: string
          id: string
          latency_ms: number
          recorded_at: string | null
          region: string | null
          source: string
        }
        Insert: {
          exchange_name: string
          id?: string
          latency_ms: number
          recorded_at?: string | null
          region?: string | null
          source?: string
        }
        Update: {
          exchange_name?: string
          id?: string
          latency_ms?: number
          recorded_at?: string | null
          region?: string | null
          source?: string
        }
        Relationships: []
      }
      exchange_pulse: {
        Row: {
          api_endpoint: string | null
          created_at: string | null
          error_message: string | null
          exchange_name: string
          id: string
          last_check: string | null
          latency_ms: number | null
          region: string | null
          source: string | null
          status: string | null
        }
        Insert: {
          api_endpoint?: string | null
          created_at?: string | null
          error_message?: string | null
          exchange_name: string
          id?: string
          last_check?: string | null
          latency_ms?: number | null
          region?: string | null
          source?: string | null
          status?: string | null
        }
        Update: {
          api_endpoint?: string | null
          created_at?: string | null
          error_message?: string | null
          exchange_name?: string
          id?: string
          last_check?: string | null
          latency_ms?: number | null
          region?: string | null
          source?: string | null
          status?: string | null
        }
        Relationships: []
      }
      failover_config: {
        Row: {
          auto_failover_enabled: boolean | null
          consecutive_failures: number | null
          created_at: string | null
          health_check_url: string | null
          id: string
          is_enabled: boolean | null
          is_primary: boolean | null
          last_health_check: string | null
          latency_ms: number | null
          priority: number
          provider: string
          region: string | null
          timeout_ms: number | null
          updated_at: string | null
        }
        Insert: {
          auto_failover_enabled?: boolean | null
          consecutive_failures?: number | null
          created_at?: string | null
          health_check_url?: string | null
          id?: string
          is_enabled?: boolean | null
          is_primary?: boolean | null
          last_health_check?: string | null
          latency_ms?: number | null
          priority?: number
          provider: string
          region?: string | null
          timeout_ms?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_failover_enabled?: boolean | null
          consecutive_failures?: number | null
          created_at?: string | null
          health_check_url?: string | null
          id?: string
          is_enabled?: boolean | null
          is_primary?: boolean | null
          last_health_check?: string | null
          latency_ms?: number | null
          priority?: number
          provider?: string
          region?: string | null
          timeout_ms?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      failover_events: {
        Row: {
          from_provider: string
          id: string
          is_automatic: boolean | null
          reason: string | null
          resolved_at: string | null
          to_provider: string
          triggered_at: string | null
        }
        Insert: {
          from_provider: string
          id?: string
          is_automatic?: boolean | null
          reason?: string | null
          resolved_at?: string | null
          to_provider: string
          triggered_at?: string | null
        }
        Update: {
          from_provider?: string
          id?: string
          is_automatic?: boolean | null
          reason?: string | null
          resolved_at?: string | null
          to_provider?: string
          triggered_at?: string | null
        }
        Relationships: []
      }
      health_check_results: {
        Row: {
          check_type: string
          created_at: string | null
          credential_id: string | null
          details: Json | null
          id: string
          message: string | null
          provider: string | null
          status: string
          telegram_notified: boolean | null
        }
        Insert: {
          check_type: string
          created_at?: string | null
          credential_id?: string | null
          details?: Json | null
          id?: string
          message?: string | null
          provider?: string | null
          status: string
          telegram_notified?: boolean | null
        }
        Update: {
          check_type?: string
          created_at?: string | null
          credential_id?: string | null
          details?: Json | null
          id?: string
          message?: string | null
          provider?: string | null
          status?: string
          telegram_notified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "health_check_results_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credential_vault"
            referencedColumns: ["id"]
          },
        ]
      }
      hft_deployments: {
        Row: {
          bot_status: string | null
          created_at: string | null
          id: string
          ip_address: string | null
          provider: string
          region: string | null
          server_id: string
          server_name: string | null
          server_plan: string | null
          ssh_key_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          bot_status?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          provider: string
          region?: string | null
          server_id: string
          server_name?: string | null
          server_plan?: string | null
          ssh_key_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          bot_status?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          provider?: string
          region?: string | null
          server_id?: string
          server_name?: string | null
          server_plan?: string | null
          ssh_key_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hft_deployments_ssh_key_id_fkey"
            columns: ["ssh_key_id"]
            isOneToOne: false
            referencedRelation: "hft_ssh_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      hft_ssh_keys: {
        Row: {
          created_at: string | null
          id: string
          key_name: string
          private_key_encrypted: string | null
          provider: string
          public_key: string
          server_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_name: string
          private_key_encrypted?: string | null
          provider: string
          public_key: string
          server_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key_name?: string
          private_key_encrypted?: string | null
          provider?: string
          public_key?: string
          server_id?: string | null
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
      orders: {
        Row: {
          amount: number
          average_fill_price: number | null
          cancelled_at: string | null
          client_order_id: string | null
          created_at: string | null
          exchange_name: string
          exchange_order_id: string | null
          filled_amount: number | null
          filled_at: string | null
          id: string
          idempotency_key: string | null
          price: number | null
          side: string
          status: string
          symbol: string
          type: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          amount: number
          average_fill_price?: number | null
          cancelled_at?: string | null
          client_order_id?: string | null
          created_at?: string | null
          exchange_name: string
          exchange_order_id?: string | null
          filled_amount?: number | null
          filled_at?: string | null
          id?: string
          idempotency_key?: string | null
          price?: number | null
          side: string
          status?: string
          symbol: string
          type: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          amount?: number
          average_fill_price?: number | null
          cancelled_at?: string | null
          client_order_id?: string | null
          created_at?: string | null
          exchange_name?: string
          exchange_order_id?: string | null
          filled_amount?: number | null
          filled_at?: string | null
          id?: string
          idempotency_key?: string | null
          price?: number | null
          side?: string
          status?: string
          symbol?: string
          type?: string
          updated_at?: string | null
          version?: number | null
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
      positions: {
        Row: {
          created_at: string | null
          current_price: number | null
          entry_price: number
          exchange_name: string
          id: string
          leverage: number | null
          liquidation_price: number | null
          margin: number | null
          realized_pnl: number | null
          side: string
          size: number
          symbol: string
          unrealized_pnl: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_price?: number | null
          entry_price: number
          exchange_name: string
          id?: string
          leverage?: number | null
          liquidation_price?: number | null
          margin?: number | null
          realized_pnl?: number | null
          side: string
          size: number
          symbol: string
          unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_price?: number | null
          entry_price?: number
          exchange_name?: string
          id?: string
          leverage?: number | null
          liquidation_price?: number | null
          margin?: number | null
          realized_pnl?: number | null
          side?: string
          size?: number
          symbol?: string
          unrealized_pnl?: number | null
          updated_at?: string | null
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
      security_scores: {
        Row: {
          analyzed_at: string | null
          cloud_score: number | null
          exchange_score: number | null
          id: string
          integration_score: number | null
          overall_score: number
          recommendations: string[] | null
        }
        Insert: {
          analyzed_at?: string | null
          cloud_score?: number | null
          exchange_score?: number | null
          id?: string
          integration_score?: number | null
          overall_score: number
          recommendations?: string[] | null
        }
        Update: {
          analyzed_at?: string | null
          cloud_score?: number | null
          exchange_score?: number | null
          id?: string
          integration_score?: number | null
          overall_score?: number
          recommendations?: string[] | null
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
      strategy_config: {
        Row: {
          allowed_exchanges: string[] | null
          allowed_symbols: string[] | null
          created_at: string | null
          display_name: string
          id: string
          is_enabled: boolean | null
          leverage_multiplier: number | null
          max_concurrent_positions: number | null
          max_position_size: number | null
          min_position_size: number | null
          profit_target_leverage: number | null
          profit_target_spot: number | null
          strategy_name: string
          trade_both_directions: boolean | null
          updated_at: string | null
          use_leverage: boolean | null
        }
        Insert: {
          allowed_exchanges?: string[] | null
          allowed_symbols?: string[] | null
          created_at?: string | null
          display_name: string
          id?: string
          is_enabled?: boolean | null
          leverage_multiplier?: number | null
          max_concurrent_positions?: number | null
          max_position_size?: number | null
          min_position_size?: number | null
          profit_target_leverage?: number | null
          profit_target_spot?: number | null
          strategy_name: string
          trade_both_directions?: boolean | null
          updated_at?: string | null
          use_leverage?: boolean | null
        }
        Update: {
          allowed_exchanges?: string[] | null
          allowed_symbols?: string[] | null
          created_at?: string | null
          display_name?: string
          id?: string
          is_enabled?: boolean | null
          leverage_multiplier?: number | null
          max_concurrent_positions?: number | null
          max_position_size?: number | null
          min_position_size?: number | null
          profit_target_leverage?: number | null
          profit_target_spot?: number | null
          strategy_name?: string
          trade_both_directions?: boolean | null
          updated_at?: string | null
          use_leverage?: boolean | null
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
      strategy_trades: {
        Row: {
          created_at: string | null
          entry_price: number
          entry_time: string | null
          exchange_name: string
          exit_price: number | null
          exit_time: string | null
          fees_paid: number | null
          gross_pnl: number | null
          hold_duration_seconds: number | null
          id: string
          is_leverage: boolean | null
          leverage_multiplier: number | null
          net_pnl: number | null
          position_value: number
          profit_target: number
          side: string
          size: number
          status: string | null
          strategy_name: string
          symbol: string
          vps_ip: string | null
          vps_provider: string | null
        }
        Insert: {
          created_at?: string | null
          entry_price: number
          entry_time?: string | null
          exchange_name: string
          exit_price?: number | null
          exit_time?: string | null
          fees_paid?: number | null
          gross_pnl?: number | null
          hold_duration_seconds?: number | null
          id?: string
          is_leverage?: boolean | null
          leverage_multiplier?: number | null
          net_pnl?: number | null
          position_value: number
          profit_target: number
          side: string
          size: number
          status?: string | null
          strategy_name?: string
          symbol: string
          vps_ip?: string | null
          vps_provider?: string | null
        }
        Update: {
          created_at?: string | null
          entry_price?: number
          entry_time?: string | null
          exchange_name?: string
          exit_price?: number | null
          exit_time?: string | null
          fees_paid?: number | null
          gross_pnl?: number | null
          hold_duration_seconds?: number | null
          id?: string
          is_leverage?: boolean | null
          leverage_multiplier?: number | null
          net_pnl?: number | null
          position_value?: number
          profit_target?: number
          side?: string
          size?: number
          status?: string | null
          strategy_name?: string
          symbol?: string
          vps_ip?: string | null
          vps_provider?: string | null
        }
        Relationships: []
      }
      system_notifications: {
        Row: {
          category: string | null
          created_at: string | null
          dismissed: boolean | null
          id: string
          message: string | null
          metadata: Json | null
          read: boolean | null
          severity: string | null
          title: string
          type: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          message?: string | null
          metadata?: Json | null
          read?: boolean | null
          severity?: string | null
          title: string
          type: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          message?: string | null
          metadata?: Json | null
          read?: boolean | null
          severity?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      system_secrets: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          last_accessed_at: string | null
          secret_name: string
          secret_value: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_accessed_at?: string | null
          secret_name: string
          secret_value: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_accessed_at?: string | null
          secret_name?: string
          secret_value?: string
          updated_at?: string | null
          version?: number | null
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
          delay_ms: number | null
          executed_at: string | null
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
          delay_ms?: number | null
          executed_at?: string | null
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
          delay_ms?: number | null
          executed_at?: string | null
          id?: string
          is_active?: boolean | null
          source_exchange?: string
          symbol?: string
          target_exchange?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      trade_execution_metrics: {
        Row: {
          api_response_time_ms: number | null
          created_at: string | null
          exchange: string
          execution_time_ms: number
          id: string
          network_latency_ms: number | null
          order_filled_at: string | null
          order_placed_at: string
          order_type: string | null
          symbol: string | null
        }
        Insert: {
          api_response_time_ms?: number | null
          created_at?: string | null
          exchange: string
          execution_time_ms: number
          id?: string
          network_latency_ms?: number | null
          order_filled_at?: string | null
          order_placed_at?: string
          order_type?: string | null
          symbol?: string | null
        }
        Update: {
          api_response_time_ms?: number | null
          created_at?: string | null
          exchange?: string
          execution_time_ms?: number
          id?: string
          network_latency_ms?: number | null
          order_filled_at?: string | null
          order_placed_at?: string
          order_type?: string | null
          symbol?: string | null
        }
        Relationships: []
      }
      trading_config: {
        Row: {
          bot_status: string | null
          created_at: string | null
          global_kill_switch_enabled: boolean | null
          id: string
          leverage: number | null
          manual_start_required: boolean | null
          max_daily_drawdown_percent: number | null
          max_daily_trades: number | null
          max_position_size: number | null
          order_size: number | null
          stop_loss: number | null
          take_profit_1: number | null
          take_profit_2: number | null
          test_mode: boolean | null
          trading_enabled: boolean | null
          trading_mode: string | null
          updated_at: string | null
        }
        Insert: {
          bot_status?: string | null
          created_at?: string | null
          global_kill_switch_enabled?: boolean | null
          id?: string
          leverage?: number | null
          manual_start_required?: boolean | null
          max_daily_drawdown_percent?: number | null
          max_daily_trades?: number | null
          max_position_size?: number | null
          order_size?: number | null
          stop_loss?: number | null
          take_profit_1?: number | null
          take_profit_2?: number | null
          test_mode?: boolean | null
          trading_enabled?: boolean | null
          trading_mode?: string | null
          updated_at?: string | null
        }
        Update: {
          bot_status?: string | null
          created_at?: string | null
          global_kill_switch_enabled?: boolean | null
          id?: string
          leverage?: number | null
          manual_start_required?: boolean | null
          max_daily_drawdown_percent?: number | null
          max_daily_trades?: number | null
          max_position_size?: number | null
          order_size?: number | null
          stop_loss?: number | null
          take_profit_1?: number | null
          take_profit_2?: number | null
          test_mode?: boolean | null
          trading_enabled?: boolean | null
          trading_mode?: string | null
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
          execution_latency_ms: number | null
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
          execution_latency_ms?: number | null
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
          execution_latency_ms?: number | null
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
      trading_sessions: {
        Row: {
          ai_accuracy_percent: number | null
          avg_trade_duration_ms: number | null
          best_trade_pnl: number | null
          consistency_score: number | null
          ended_at: string | null
          id: string
          metadata: Json | null
          session_type: string
          started_at: string | null
          total_pnl: number | null
          total_trades: number | null
          win_rate: number | null
          winning_trades: number | null
          worst_trade_pnl: number | null
        }
        Insert: {
          ai_accuracy_percent?: number | null
          avg_trade_duration_ms?: number | null
          best_trade_pnl?: number | null
          consistency_score?: number | null
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          session_type: string
          started_at?: string | null
          total_pnl?: number | null
          total_trades?: number | null
          win_rate?: number | null
          winning_trades?: number | null
          worst_trade_pnl?: number | null
        }
        Update: {
          ai_accuracy_percent?: number | null
          avg_trade_duration_ms?: number | null
          best_trade_pnl?: number | null
          consistency_score?: number | null
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          session_type?: string
          started_at?: string | null
          total_pnl?: number | null
          total_trades?: number | null
          win_rate?: number | null
          winning_trades?: number | null
          worst_trade_pnl?: number | null
        }
        Relationships: []
      }
      trading_strategies: {
        Row: {
          created_at: string | null
          daily_goal: number | null
          daily_progress: number | null
          description: string | null
          id: string
          is_active: boolean | null
          is_paused: boolean | null
          leverage: number | null
          name: string
          pnl_today: number | null
          position_size: number | null
          profit_target: number | null
          source_framework: string | null
          trades_today: number | null
          trading_mode: string | null
          updated_at: string | null
          vps_ip: string | null
          win_rate: number | null
        }
        Insert: {
          created_at?: string | null
          daily_goal?: number | null
          daily_progress?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_paused?: boolean | null
          leverage?: number | null
          name: string
          pnl_today?: number | null
          position_size?: number | null
          profit_target?: number | null
          source_framework?: string | null
          trades_today?: number | null
          trading_mode?: string | null
          updated_at?: string | null
          vps_ip?: string | null
          win_rate?: number | null
        }
        Update: {
          created_at?: string | null
          daily_goal?: number | null
          daily_progress?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_paused?: boolean | null
          leverage?: number | null
          name?: string
          pnl_today?: number | null
          position_size?: number | null
          profit_target?: number | null
          source_framework?: string | null
          trades_today?: number | null
          trading_mode?: string | null
          updated_at?: string | null
          vps_ip?: string | null
          win_rate?: number | null
        }
        Relationships: []
      }
      transaction_log: {
        Row: {
          action_type: string
          created_at: string | null
          details: Json | null
          error_message: string | null
          exchange_name: string | null
          id: string
          status: string | null
          symbol: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          exchange_name?: string | null
          id?: string
          status?: string | null
          symbol?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          exchange_name?: string | null
          id?: string
          status?: string | null
          symbol?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          auto_refresh_interval: number | null
          compact_mode: boolean | null
          created_at: string | null
          daily_report_enabled: boolean | null
          default_currency: string | null
          email_alerts: boolean | null
          id: string
          language: string | null
          notifications_enabled: boolean | null
          sound_alerts: boolean | null
          telegram_alerts: boolean | null
          theme: string | null
          timezone: string | null
          updated_at: string | null
          weekly_report_enabled: boolean | null
        }
        Insert: {
          auto_refresh_interval?: number | null
          compact_mode?: boolean | null
          created_at?: string | null
          daily_report_enabled?: boolean | null
          default_currency?: string | null
          email_alerts?: boolean | null
          id?: string
          language?: string | null
          notifications_enabled?: boolean | null
          sound_alerts?: boolean | null
          telegram_alerts?: boolean | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          weekly_report_enabled?: boolean | null
        }
        Update: {
          auto_refresh_interval?: number | null
          compact_mode?: boolean | null
          created_at?: string | null
          daily_report_enabled?: boolean | null
          default_currency?: string | null
          email_alerts?: boolean | null
          id?: string
          language?: string | null
          notifications_enabled?: boolean | null
          sound_alerts?: boolean | null
          telegram_alerts?: boolean | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          weekly_report_enabled?: boolean | null
        }
        Relationships: []
      }
      vault_audit_log: {
        Row: {
          action: string
          created_at: string | null
          credential_id: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          credential_id?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          credential_id?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_audit_log_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credential_vault"
            referencedColumns: ["id"]
          },
        ]
      }
      vps_backups: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          provider: string
          size_gb: number | null
          snapshot_id: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          provider: string
          size_gb?: number | null
          snapshot_id?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          provider?: string
          size_gb?: number | null
          snapshot_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      vps_benchmarks: {
        Row: {
          benchmark_type: string
          exchange_latencies: Json | null
          hft_score: number | null
          id: string
          provider: string
          raw_results: Json | null
          run_at: string | null
          score: number
        }
        Insert: {
          benchmark_type: string
          exchange_latencies?: Json | null
          hft_score?: number | null
          id?: string
          provider: string
          raw_results?: Json | null
          run_at?: string | null
          score: number
        }
        Update: {
          benchmark_type?: string
          exchange_latencies?: Json | null
          hft_score?: number | null
          id?: string
          provider?: string
          raw_results?: Json | null
          run_at?: string | null
          score?: number
        }
        Relationships: []
      }
      vps_config: {
        Row: {
          balance_poll_interval_ms: number | null
          cors_proxy_enabled: boolean | null
          created_at: string | null
          emergency_stopped_at: string | null
          execution_buffer_ms: number | null
          id: string
          instance_type: string | null
          last_balance_poll_at: string | null
          outbound_ip: string | null
          provider: string | null
          region: string
          status: string | null
          updated_at: string | null
          vps_token: string | null
        }
        Insert: {
          balance_poll_interval_ms?: number | null
          cors_proxy_enabled?: boolean | null
          created_at?: string | null
          emergency_stopped_at?: string | null
          execution_buffer_ms?: number | null
          id?: string
          instance_type?: string | null
          last_balance_poll_at?: string | null
          outbound_ip?: string | null
          provider?: string | null
          region?: string
          status?: string | null
          updated_at?: string | null
          vps_token?: string | null
        }
        Update: {
          balance_poll_interval_ms?: number | null
          cors_proxy_enabled?: boolean | null
          created_at?: string | null
          emergency_stopped_at?: string | null
          execution_buffer_ms?: number | null
          id?: string
          instance_type?: string | null
          last_balance_poll_at?: string | null
          outbound_ip?: string | null
          provider?: string | null
          region?: string
          status?: string | null
          updated_at?: string | null
          vps_token?: string | null
        }
        Relationships: []
      }
      vps_instances: {
        Row: {
          bot_pid: number | null
          bot_status: string | null
          config: Json | null
          created_at: string | null
          deployment_id: string | null
          id: string
          instance_size: string | null
          ip_address: string | null
          last_health_check: string | null
          monthly_cost: number | null
          nickname: string | null
          provider: string
          provider_instance_id: string | null
          region: string | null
          ssh_private_key: string | null
          status: string | null
          updated_at: string | null
          uptime_seconds: number | null
        }
        Insert: {
          bot_pid?: number | null
          bot_status?: string | null
          config?: Json | null
          created_at?: string | null
          deployment_id?: string | null
          id?: string
          instance_size?: string | null
          ip_address?: string | null
          last_health_check?: string | null
          monthly_cost?: number | null
          nickname?: string | null
          provider: string
          provider_instance_id?: string | null
          region?: string | null
          ssh_private_key?: string | null
          status?: string | null
          updated_at?: string | null
          uptime_seconds?: number | null
        }
        Update: {
          bot_pid?: number | null
          bot_status?: string | null
          config?: Json | null
          created_at?: string | null
          deployment_id?: string | null
          id?: string
          instance_size?: string | null
          ip_address?: string | null
          last_health_check?: string | null
          monthly_cost?: number | null
          nickname?: string | null
          provider?: string
          provider_instance_id?: string | null
          region?: string | null
          ssh_private_key?: string | null
          status?: string | null
          updated_at?: string | null
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      vps_metrics: {
        Row: {
          cpu_percent: number | null
          disk_percent: number | null
          id: string
          latency_ms: number | null
          network_in_mbps: number | null
          network_out_mbps: number | null
          provider: string
          ram_percent: number | null
          recorded_at: string | null
          uptime_seconds: number | null
        }
        Insert: {
          cpu_percent?: number | null
          disk_percent?: number | null
          id?: string
          latency_ms?: number | null
          network_in_mbps?: number | null
          network_out_mbps?: number | null
          provider: string
          ram_percent?: number | null
          recorded_at?: string | null
          uptime_seconds?: number | null
        }
        Update: {
          cpu_percent?: number | null
          disk_percent?: number | null
          id?: string
          latency_ms?: number | null
          network_in_mbps?: number | null
          network_out_mbps?: number | null
          provider?: string
          ram_percent?: number | null
          recorded_at?: string | null
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      vps_proxy_health: {
        Row: {
          checked_at: string | null
          consecutive_failures: number | null
          error_message: string | null
          id: string
          is_healthy: boolean
          latency_ms: number | null
          vps_ip: string
        }
        Insert: {
          checked_at?: string | null
          consecutive_failures?: number | null
          error_message?: string | null
          id?: string
          is_healthy: boolean
          latency_ms?: number | null
          vps_ip: string
        }
        Update: {
          checked_at?: string | null
          consecutive_failures?: number | null
          error_message?: string | null
          id?: string
          is_healthy?: boolean
          latency_ms?: number | null
          vps_ip?: string
        }
        Relationships: []
      }
      vps_timeline_events: {
        Row: {
          created_at: string | null
          description: string | null
          event_subtype: string | null
          event_type: string
          id: string
          metadata: Json | null
          provider: string
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_subtype?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          provider: string
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_subtype?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          provider?: string
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_provider_accuracy: {
        Row: {
          accuracy_percent: number | null
          ai_provider: string | null
          avg_confidence: number | null
          avg_profit: number | null
          correct_predictions: number | null
          total_recommendations: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      increment_live_trade: { Args: { profit?: number }; Returns: boolean }
      is_service_role: { Args: never; Returns: boolean }
      reset_ai_provider_daily_usage: { Args: never; Returns: undefined }
      reset_ai_provider_usage: { Args: never; Returns: undefined }
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
