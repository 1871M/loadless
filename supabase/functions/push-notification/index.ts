import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Called from DB triggers (X-Push-Secret header) or authenticated users
// Requires ONESIGNAL_APP_ID + ONESIGNAL_API_KEY in Supabase secrets
// supabase secrets set ONESIGNAL_APP_ID=your_app_id ONESIGNAL_API_KEY=your_api_key

// Internal secret for DB trigger calls (stored in _app_config table)
const INTERNAL_SECRET = "ll-push-7K9mX2vN5pQ8wR3jL6hY1tF4cB0sZ";

interface PushPayload {
  couple_id: string;
  exclude_user_id: string; // don't notify the sender
  title: string;
  body: string;
  category: "chat" | "tasks" | "budget" | "shopping" | "meals" | "calendar";
  data?: Record<string, string>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const pushSecret = req.headers.get("X-Push-Secret") || "";

    const isInternalCall = pushSecret === INTERNAL_SECRET;
    const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    let isAuthorized = isInternalCall || isServiceRole;

    if (!isAuthorized) {
      const sbUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await sbUser.auth.getUser();
      isAuthorized = !!user;
    }

    if (!isAuthorized) return new Response("Unauthorized", { status: 401 });

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload: PushPayload = await req.json();
    const { couple_id, exclude_user_id, title, body, category, data: extraData } = payload;

    if (!couple_id || !title || !body || !category) {
      return new Response("Missing fields", { status: 400 });
    }

    // Load device tokens for all couple members (except sender)
    const { data: tokens, error: tokErr } = await sb
      .from("device_tokens")
      .select("token, user_id")
      .eq("couple_id", couple_id)
      .neq("user_id", exclude_user_id);

    if (tokErr || !tokens?.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check notification preferences for each recipient
    const recipientIds = [...new Set(tokens.map((t) => t.user_id))];
    const prefColumn = `notif_${category}` as const;

    const { data: prefs } = await sb
      .from("notification_prefs")
      .select(`user_id, ${prefColumn}`)
      .in("user_id", recipientIds);

    // Build set of users who want this category (default: allow if no pref row)
    const blockedUsers = new Set(
      (prefs || [])
        .filter((p) => p[prefColumn] === false)
        .map((p) => p.user_id)
    );

    const playerIds = tokens
      .filter((t) => !blockedUsers.has(t.user_id))
      .map((t) => t.token);

    if (!playerIds.length) {
      return new Response(JSON.stringify({ sent: 0, reason: "all_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const oneSignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const oneSignalKey = Deno.env.get("ONESIGNAL_API_KEY");

    if (!oneSignalAppId || !oneSignalKey) {
      console.warn("OneSignal credentials not configured — push skipped");
      return new Response(JSON.stringify({ sent: 0, reason: "no_credentials" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const osPayload = {
      app_id: oneSignalAppId,
      include_player_ids: playerIds,
      headings: { en: title, fr: title },
      contents: { en: body, fr: body },
      data: { category, couple_id, ...extraData },
      android_channel_id: `loadless-${category}`,
      small_icon: "ic_notification",
      priority: category === "chat" ? 10 : 7,
    };

    const osResp = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${oneSignalKey}`,
      },
      body: JSON.stringify(osPayload),
    });

    const osData = await osResp.json();

    return new Response(
      JSON.stringify({ sent: playerIds.length, onesignal: osData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("push-notification error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
