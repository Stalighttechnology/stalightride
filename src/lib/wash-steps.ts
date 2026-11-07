/**
 * Wash job progress, mirroring public.advance_wash_job in
 * supabase/migrations/20261107130000_wash_pipeline.sql: strictly one step at a
 * time, (none) → assigned → on_the_way → started → completed.
 */
export const NEXT_WASH_STEP: Record<string, { to: string; label: string }> = {
  none: { to: "assigned", label: "Assign washer" },
  assigned: { to: "on_the_way", label: "Start travelling" },
  on_the_way: { to: "started", label: "Start wash" },
  started: { to: "completed", label: "Mark completed" },
};

export const WASH_STEP_LABEL: Record<string, string> = {
  assigned: "Assigned",
  on_the_way: "On the way",
  started: "In progress",
};
