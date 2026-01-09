CREATE OR REPLACE FUNCTION public.increment_simulation_trade(profit numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  new_count INTEGER; 
  is_unlocked BOOLEAN := false;
  current_paper_unlocked BOOLEAN;
BEGIN
  UPDATE simulation_progress 
  SET successful_simulation_trades = COALESCE(successful_simulation_trades, 0) + 1,
      simulation_profit_total = COALESCE(simulation_profit_total, 0) + profit,
      updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001'
  RETURNING successful_simulation_trades, simulation_progress.paper_mode_unlocked 
  INTO new_count, current_paper_unlocked;
  
  IF new_count >= 20 AND NOT COALESCE(current_paper_unlocked, false) THEN
    UPDATE simulation_progress SET paper_mode_unlocked = true
    WHERE id = '00000000-0000-0000-0000-000000000001';
    
    INSERT INTO system_notifications (type, title, message, severity, category)
    VALUES ('mode_unlock', 'Paper Trading Unlocked!', 'Completed 20 profitable simulation trades. Paper trading mode is now available.', 'achievement', 'unlock');
    
    is_unlocked := true;
  END IF;
  
  RETURN is_unlocked;
END;
$function$;