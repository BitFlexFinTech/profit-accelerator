import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action } = await req.json();

    if (action === "disable-kill-switch") {
      // Disable kill switch and set bot to stopped state
      const { error: configError } = await supabase
        .from("trading_config")
        .update({
          global_kill_switch_enabled: false,
          bot_status: "stopped",
          trading_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (configError) throw configError;

      // Sync hft_deployments
      await supabase
        .from("hft_deployments")
        .update({
          bot_status: "stopped",
          updated_at: new Date().toISOString(),
        })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      // Sync vps_instances
      await supabase
        .from("vps_instances")
        .update({
          bot_status: "stopped",
          updated_at: new Date().toISOString(),
        })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      return new Response(
        JSON.stringify({ success: true, message: "Kill switch disabled, all statuses synced to stopped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "sync-status") {
      const { status } = await req.json();
      const newStatus = status || "stopped";

      // Sync all tables to the same status
      await Promise.all([
        supabase
          .from("trading_config")
          .update({
            bot_status: newStatus,
            trading_enabled: newStatus === "running",
            updated_at: new Date().toISOString(),
          })
          .neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase
          .from("hft_deployments")
          .update({
            bot_status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase
          .from("vps_instances")
          .update({
            bot_status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);

      return new Response(
        JSON.stringify({ success: true, message: `All statuses synced to ${newStatus}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Unknown action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
