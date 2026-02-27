/// <reference types="@supabase/functions-js/edge-runtime.d.ts" />
import { createClient } from "@supabase/supabase-js";

/**
 * process-mastering v7 — Cloud Run ブリッジ
 * Edge Function は DSP をやらない。
 * 署名付き URL を作って Cloud Run に投げるだけ。
 */

const CORS = {

    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DSP_ENGINE_URL =
    Deno.env.get("DSP_ENGINE_URL") ||
    "https://dsp-mastering-engine-270124753853.asia-northeast1.run.app";

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    let jobId: string | undefined;

    try {
        const body = await req.json();
        jobId = body.job_id;
        if (!jobId) throw new Error("Missing job_id");

        // 1. DB からジョブ情報を取得
        const { data: job } = await supabase
            .from("mastering_jobs")
            .select("*")
            .eq("id", jobId)
            .single();
        if (!job) throw new Error("Job not found");

        await supabase
            .from("mastering_jobs")
            .update({ status: "processing", started_at: new Date().toISOString() })
            .eq("id", jobId);

        // 2. Supabase Storage の署名付きダウンロード URL を生成 (1時間有効)
        const { data: signed, error: signErr } = await supabase.storage
            .from("originals")
            .createSignedUrl(job.original_file_path, 3600);
        if (signErr || !signed)
            throw new Error(`Signed URL error: ${signErr?.message}`);

        // 3. Cloud Run に POST (fire-and-forget)
        const dspPayload = {
            jobId,
            downloadUrl: signed.signedUrl,
            fileName: job.file_name,
            targetLUFS: job.target_lufs ?? -14.0,
            params: job.mastering_params ?? {},
        };

        // fire-and-forget: Cloud Run 側で完了時に DB を更新する
        fetch(`${DSP_ENGINE_URL}/master`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dspPayload),
        }).catch((e) => console.error("Cloud Run call failed:", e));

        return new Response(
            JSON.stringify({ ok: true, jobId, message: "Dispatched to DSP engine" }),
            { headers: { ...CORS, "Content-Type": "application/json" } }
        );
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (jobId) {
            await supabase
                .from("mastering_jobs")
                .update({ status: "failed", error_message: error })
                .eq("id", jobId);
        }
        return new Response(
            JSON.stringify({ error }),
            { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
        );
    }
});
