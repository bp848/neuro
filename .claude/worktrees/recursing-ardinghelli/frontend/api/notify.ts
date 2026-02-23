import { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { email, jobId, fileName } = req.body;

    if (!email || !jobId) {
        return res.status(400).json({ error: 'Missing email or jobId' });
    }

    try {
        const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'Neuro-Master <onboarding@resend.dev>',
            to: [email],
            subject: `Mastering Complete: ${fileName || 'Your Track'}`,
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #333; background-color: #0a0a0a; color: #fff;">
          <h1 style="color: #00ffcc; text-transform: uppercase; letter-spacing: 2px;">Your Master is Ready</h1>
          <p>Hello,</p>
          <p>The AI mastering process for <strong>${fileName || 'your track'}</strong> has been completed successfully.</p>
          <p>You can now listen to the results and download your mastered file by clicking the button below:</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/?job=${jobId}" 
               style="background-color: #00ffcc; color: #000; padding: 15px 25px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
               VIEW MASTERING RESULT
            </a>
          </div>
          <p style="font-size: 0.8em; color: #666;">If you didn't request this email, please ignore it.</p>
          <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;" />
          <p style="color: #00ffcc; font-weight: bold;">NEURO-MASTER | AI Driven Audio Mastering</p>
        </div>
      `,
        });

        if (error) {
            console.error('Resend Error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({ success: true, data });
    } catch (err: any) {
        console.error('Notification API Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
