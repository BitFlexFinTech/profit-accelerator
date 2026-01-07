-- Create function to sync hft_deployments changes to vps_instances
CREATE OR REPLACE FUNCTION public.sync_hft_to_vps()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE vps_instances
  SET bot_status = NEW.bot_status,
      status = NEW.status,
      updated_at = NOW()
  WHERE deployment_id = NEW.server_id 
     OR provider_instance_id = NEW.server_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic sync
DROP TRIGGER IF EXISTS sync_hft_deployments_trigger ON hft_deployments;
CREATE TRIGGER sync_hft_deployments_trigger
AFTER UPDATE ON hft_deployments
FOR EACH ROW EXECUTE FUNCTION public.sync_hft_to_vps();