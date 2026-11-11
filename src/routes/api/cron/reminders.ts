import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/api/cron/reminders")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { data, error } = await supabase.rpc("generate_scheduled_reminders");
          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ ok: true, result: data }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message || "Unknown error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      POST: async () => {
        try {
          const { data, error } = await supabase.rpc("generate_scheduled_reminders");
          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ ok: true, result: data }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message || "Unknown error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
