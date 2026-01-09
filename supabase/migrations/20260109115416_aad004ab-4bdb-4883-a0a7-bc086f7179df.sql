-- Fix increment_paper_trade_v2 to properly reference table columns
CREATE OR REPLACE FUNCTION public.increment_paper_trade_v2(profit numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  new_count INTEGER; 
  is_unlocked BOOLEAN := false;
  current_live_unlocked BOOLEAN;
BEGIN
  -- Update and get the new count
  UPDATE simulation_progress 
  SET successful_paper_trades = COALESCE(successful_paper_trades, 0) + 1,
      paper_profit_total = COALESCE(paper_profit_total, 0) + profit,
      last_paper_trade_at = now(),
      updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001'
  RETURNING successful_paper_trades, simulation_progress.live_mode_unlocked 
  INTO new_count, current_live_unlocked;
  
  -- Unlock live mode after 20 profitable paper trades
  IF new_count >= 20 AND NOT COALESCE(current_live_unlocked, false) THEN
    UPDATE simulation_progress SET live_mode_unlocked = true
    WHERE id = '00000000-0000-0000-0000-000000000001';
    
    INSERT INTO system_notifications (type, title, message, severity, category)
    VALUES ('mode_unlock', 'Live Trading Unlocked!', 'Completed 20 profitable paper trades. Live trading mode is now available.', 'achievement', 'unlock');
    
    is_unlocked := true;
  END IF;
  
  RETURN is_unlocked;
END;
$function$;