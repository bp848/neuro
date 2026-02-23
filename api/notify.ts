import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');

export const config = {
    runtime: 'edge',
};

export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        const { email, jobId, fileName } = await req.json();

        if (!email || !jobId) {
            return new Response('Missing required fields', { status: 400 });
        }

        const { data, error } = await resend.emails.send({
            from: 'Neuro-Master <onboarding@resend.dev>',
            to: [email],
            subject: 'Mastering Completed: ' + (fileName || 'Your Track'),
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #000; color: #fff; border-radius: 12px;">
          <h1 style="font-style: italic; font-weight: 900; letter-spacing: -0.05em; text-transform: uppercase;">Neuro-Master</h1>
          <p style="color: #666; text-transform: uppercase; font-size: 10px; letter-spacing: 0.3em;">Status: Signal Processed</p>
          <div style="margin: 40px 0; padding: 30px; background-color: #111; border: 1px solid #222; border-radius: 8px;">
            <p style="margin: 0; font-size: 14px; color: #888;">Track Name</p>
            <p style="margin: 5px 0 20px 0; font-size: 18px; font-weight: bold;">${fileName || 'Processed Audio'}</p>
            <a href="https://neuro-master-beatport-top-10-ai.vercel.app/?jobId=${jobId}" 
               style="display: inline-block; padding: 12px 24px; background-color: #fff; color: #000; text-decoration: none; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; border-radius: 4px;">
              Listen & Finalize
            </a>
          </div>
          <p style="font-size: 10px; color: #444; text-transform: uppercase; letter-spacing: 0.1em;">
            © 2025 NEURO-MASTER // Beatport Top 10 Standard
          </p>
        </div>
      `,
        });

        if (error) {
            return new Response(JSON.stringify(error), { status: 400 });
        }

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        return new Response(error.message, { status: 500 });
    }
}
