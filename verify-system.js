import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'frontend', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing Supabase credentials in frontend/.env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runVerification() {
    console.log("--- NEURO-MASTER RUNTIME VERIFICATION ---");

    // 1. Connection Test
    console.log("[1/4] Testing Supabase Connection...");
    const { data: jobs, error: connError } = await supabase
        .from('mastering_jobs')
        .select('id, status, file_name')
        .order('updated_at', { ascending: false })
        .limit(1);

    if (connError) {
        console.error("❌ Connection failed:", connError.message);
        process.exit(1);
    }
    console.log("✅ Connection stable. Latest job:", jobs[0]?.file_name || "None");

    // 2. Storage Reachability
    console.log("[2/4] Testing Storage Bucket access...");
    const { data: files, error: storageError } = await supabase.storage.from('mastered').list('', { limit: 1 });
    if (storageError) {
        console.warn("⚠️ Storage 'mastered' list failed (possibly permission):", storageError.message);
    } else {
        console.log("✅ Storage accessible.");
    }

    // 3. Edge Function Discovery (via fetch)
    console.log("[3/4] Testing Edge Function Endpoints...");
    const functionUrl = `${SUPABASE_URL}/functions/v1/notify-on-complete`;
    try {
        const res = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: 'test-ping' })
        });
        console.log(`✅ Notify function responded (HTTP ${res.status}).`);
    } catch (e) {
        console.error("❌ Edge function unreachable:", e.message);
    }

    // 4. File Integrity Check (Existence of latest master)
    if (jobs[0] && jobs[0].status === 'completed') {
        console.log(`[4/4] Verifying integrity of latest job: ${jobs[0].id}`);
        const { data: jobDetails } = await supabase.from('mastering_jobs').select('output_path, output_url').eq('id', jobs[0].id).single();
        if (jobDetails && jobDetails.output_url) {
            const headRes = await fetch(jobDetails.output_url, { method: 'HEAD' });
            if (headRes.ok) {
                console.log("✅ Master file exists and is downloadable.");
            } else {
                console.error("❌ Master file link returned error:", headRes.status);
            }
        }
    }

    console.log("--- VERIFICATION COMPLETE ---");
}

runVerification();
