import express from 'express';
import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { VertexAI } from '@google-cloud/vertexai';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(express.json());

const storage = new Storage();
const pubsub = new PubSub();
const PORT = process.env.PORT || 8080;

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '' // Use service role for backend updates
);

const vertexAI = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT || '',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'asia-northeast1'
});

const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-pro-002',
});

app.post('/trigger', async (req: any, res: any) => {
    const message = req.body.message;
    if (!message || !message.data) {
        return res.status(400).send('Invalid Pub/Sub message');
    }

    const eventData = JSON.parse(Buffer.from(message.data, 'base64').toString());
    const { bucket, name, metadata } = eventData;

    if (!bucket || !name) {
        return res.status(400).send('Incomplete GCS event data');
    }

    // Try to find jobId in metadata (passed from frontend)
    const jobId = eventData.metadata?.jobId || name.split('/').pop()?.split('_')[0];

    try {
        console.log(`Analyzing file: gs://${bucket}/${name} for job: ${jobId}`);

        if (jobId) {
            await supabase.from('mastering_jobs').update({ status: 'analyzing' }).eq('id', jobId);
        }

        const prompt = `
      You are an AI mastering system designed to dominate the Beatport Top 10 (Tech House, Melodic Techno, Peak Time Techno).
      Analyze the provided audio and reach a consensus through three specialized agent personas:
      
      1. **Audience Persona**: Focuses on energy, impact, and "vibe". Wants it loud and exciting. Prioritizes the "kick and bass" relationship for festival systems.
      2. **A&R Persona**: Focuses on market compatibility and translation. Compares it to current Top 10 standards from labels like Afterlife, Drumcode, or Catch & Release.
      3. **Engineer Persona**: Focuses on technical integrity, phase, and dynamic range. Ensures the high-end is "expensive" sounding and prevents inter-sample peaks.
      
      Provide:
      - 20 technical metrics (name, value, target, unit, status: low/optimal/high, description).
      - Discussion opinions for each persona.
      - Final agreed-upon DSP parameters.
      
      Respond ONLY in JSON format:
      {
        "metrics": [...],
        "opinions": [
            {"role": "Audience", "comment": "...", "suggestedParams": {...}},
            {"role": "A&R", "comment": "...", "suggestedParams": {...}},
            {"role": "Engineer", "comment": "...", "suggestedParams": {...}}
        ],
        "finalParams": {
            "tube_drive_amount": (0-1),
            "low_contour_amount": (0-2.5),
            "limiter_ceiling_db": (-1.0 to -0.1),
            "target_lufs": (-9.0 to -7.0)
        }
      }
    `;

        const audioFilePath = `gs://${bucket}/${name}`;
        const result = await generativeModel.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { fileData: { fileUri: audioFilePath, mimeType: 'audio/wav' } }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: 'application/json',
            }
        });

        const aiResponseText = result.response.candidates?.[0].content.parts[0].text;
        if (!aiResponseText) throw new Error('No response from Gemini');

        const analysisResult = JSON.parse(aiResponseText);
        console.log('Gemini Analysis & Consensus achieved.');

        // 3. Update Supabase
        if (jobId) {
            await supabase.from('mastering_jobs').update({
                status: 'processing',
                metrics: analysisResult.metrics,
                consensus_opinions: analysisResult.opinions,
                final_params: analysisResult.finalParams
            }).eq('id', jobId);
        }

        // 4. Trigger DSP Engine
        const topicName = process.env.DSP_PARAMS_TOPIC || 'dsp-params-topic';
        const outputBucket = process.env.OUTPUT_BUCKET || 'aidriven-mastering-output';
        const outputPath = `mastered/${jobId || Date.now()}_${path.basename(name)}`;

        const masteringTask = {
            jobId: jobId,
            inputBucket: bucket,
            inputPath: name,
            outputBucket: outputBucket,
            outputPath: outputPath,
            params: analysisResult.finalParams,
            targetLUFS: analysisResult.finalParams.target_lufs
        };

        const messageId = await pubsub.topic(topicName).publishMessage({
            json: masteringTask
        });

        console.log(`Task published to DSP engine (ID: ${messageId})`);
        res.status(200).send(`Success: Task ${messageId} published`);

    } catch (error: any) {
        console.error('Error in analysis trigger:', error);
        if (jobId) {
            await supabase.from('mastering_jobs').update({ status: 'failed' }).eq('id', jobId);
        }
        res.status(500).send(`Analysis failed: ${error.message || 'Unknown error'}`);
    }
});

app.listen(PORT, () => {
    console.log(`Audio Analysis Trigger listening on port ${PORT}`);
});
