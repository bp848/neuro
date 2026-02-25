import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PROCESS_MASTERING_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-mastering`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { fileName, jobId } = req.body as {
      fileName: string;
      contentType?: string;
      jobId: string;
    };

    if (!fileName || !jobId) {
      return res.status(400).json({ error: 'fileName and jobId are required' });
    }

    // ── 1. Generate a signed upload URL for Supabase Storage ────────────────
    const storagePath = `${jobId}/${fileName}`;
    const { data: signedData, error: signErr } = await supabase.storage
      .from('originals')
      .createSignedUploadUrl(storagePath);

    if (signErr || !signedData) {
      console.error('Signed URL error:', signErr);
      return res.status(500).json({ error: `Storage error: ${signErr?.message}` });
    }

    // ── 2. Update job with storage path ─────────────────────────────────────
    const { error: updateErr } = await supabase
      .from('mastering_jobs')
      .update({
        original_file_path: storagePath,
        input_path: storagePath,
        status: 'uploaded',
      })
      .eq('id', jobId);

    if (updateErr) {
      console.error('DB update error:', updateErr);
      // Non-fatal — continue
    }

    // ── 3. Kick off mastering asynchronously (fire-and-forget) ──────────────
    // We don't await this — the Edge Function will update DB on completion
    fetch(PROCESS_MASTERING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Edge Function is verify_jwt: false, no auth needed
      },
      body: JSON.stringify({ job_id: jobId }),
    }).catch((e) => console.error('process-mastering trigger error:', e));

    // ── 4. Return the signed URL to the frontend ─────────────────────────────
    return res.status(200).json({
      url: signedData.signedUrl,
      path: storagePath,
      token: signedData.token,
    });

  } catch (error: any) {
    console.error('Upload handler error:', error);
    return res.status(500).json({ error: `Upload API Error: ${error.message}` });
  }
}
