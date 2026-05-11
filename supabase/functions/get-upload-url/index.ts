import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return new Response("Unauthorized", { status: 401 });

    const { data: profile } = await sb
      .from("profiles")
      .select("couple_id")
      .eq("id", user.id)
      .single();
    if (!profile?.couple_id) return new Response("No couple", { status: 403 });

    const fileId = crypto.randomUUID();
    const key = `${profile.couple_id}/${fileId}.enc`;
    const bucket = Deno.env.get("R2_BUCKET_NAME")!;
    const accountId = Deno.env.get("R2_ACCOUNT_ID")!;
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

    const r2 = new AwsClient({
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      service: "s3",
      region: "auto",
    });

    // Generate presigned PUT URL (5 min expiry)
    const url = new URL(`/${bucket}/${key}`, endpoint);
    url.searchParams.set("X-Amz-Expires", "300");
    const signed = await r2.sign(
      new Request(url.toString(), { method: "PUT" }),
      { aws: { signQuery: true } }
    );

    return new Response(
      JSON.stringify({ uploadUrl: signed.url, key }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
