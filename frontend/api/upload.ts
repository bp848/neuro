import { Storage } from '@google-cloud/storage';
import { VercelRequest, VercelResponse } from '@vercel/node';

const storage = new Storage({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}'),
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { fileName, contentType, jobId } = req.body;
  const bucketName = process.env.INPUT_BUCKET || 'aidriven-mastering-input';
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(`uploads/${jobId}_${fileName}`);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType,
    extensionHeaders: {
      'x-goog-meta-jobId': jobId,
    },
  });

  res.status(200).json({ url, path: file.name });
}
