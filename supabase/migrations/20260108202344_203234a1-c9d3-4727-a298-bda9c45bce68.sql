-- Create database function for paper trade increment (called by bot after successful paper trade)
CREATE OR REPLACE FUNCTION public.increment_paper_trade()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE simulation_progress 
  SET 
    successful_paper_trades = successful_paper_trades + 1,
    last_paper_trade_at = now(),
    live_mode_unlocked = CASE WHEN successful_paper_trades + 1 >= 20 THEN true ELSE false END,
    updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001';
  
  -- If no row exists, create it
  IF NOT FOUND THEN
    INSERT INTO simulation_progress (id, successful_paper_trades, last_paper_trade_at, live_mode_unlocked, updated_at)
    VALUES ('00000000-0000-0000-0000-000000000001', 1, now(), false, now())
    ON CONFLICT (id) DO UPDATE SET
      successful_paper_trades = simulation_progress.successful_paper_trades + 1,
      last_paper_trade_at = now(),
      updated_at = now();
  END IF;
END;
$$;