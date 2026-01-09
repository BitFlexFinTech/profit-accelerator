-- Fix increment_paper_trade_v2 to use 20 trades threshold (matching the UI)
CREATE OR REPLACE FUNCTION public.increment_paper_trade_v2(profit numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_count INTEGER; is_unlocked BOOLEAN := false;
BEGIN
  UPDATE simulation_progress 
  SET successful_paper_trades = COALESCE(successful_paper_trades, 0) + 1,
      paper_profit_total = COALESCE(paper_profit_total, 0) + profit,
      last_paper_trade_at = now(),
      updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001'
  RETURNING successful_paper_trades INTO new_count;
  
  -- Unlock live mode after 20 profitable paper trades (matching UI threshold)
  IF new_count >= 20 AND NOT COALESCE(live_mode_unlocked, false) THEN
    UPDATE simulation_progress SET live_mode_unlocked = true
    WHERE id = '00000000-0000-0000-0000-000000000001';
    
    INSERT INTO system_notifications (type, title, message, severity, category)
    VALUES ('mode_unlock', 'Live Trading Unlocked!', 'Completed 20 profitable paper trades. Live trading mode is now available.', 'achievement', 'unlock');
    
    is_unlocked := true;
  END IF;
  RETURN is_unlocked;
END;
$function$;