import express from 'express';
import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { VertexAI } from '@google-cloud/vertexai';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const storage = new Storage();
const pubsub = new PubSub();
const PORT = process.env.PORT || 8080;

const vertexAI = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT || '',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
});

const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-pro-002',
});

app.post('/trigger', async (req, res) => {
    // Cloud Pub/Sub push subscription sends messages in this format
    const message = req.body.message;
    if (!message || !message.data) {
        return res.status(400).send('Invalid Pub/Sub message');
    }

    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    const { bucket, name } = data; // GCS event data

    if (!bucket || !name) {
        return res.status(400).send('Incomplete GCS event data');
    }

    try {
        console.log(`Analyzing file: gs://${bucket}/${name}`);

        // 1. Prepare prompt for Gemini
        const prompt = `
      You are an expert audio engineer specializing in Beatport Top 10 electronic music.
      Analyze the provided audio file (metadata: ${name}) and determine the optimal DSP mastering parameters.
      
      Benchmarks for Beatport Top 10:
      - LUFS: -7 to -9 dB
      - Key: Harmonic alignment is critical.
      - Low End: Tight, 30Hz cut, 55Hz punch.
      
      Respond only in JSON format with the following fields:
      {
        "tube_drive_amount": (0-1),
        "low_contour_amount": (0-2.5),
        "limiter_ceiling_db": (-1.0 to -0.1),
        "target_lufs": (-9 to -7)
      }
    `;

        // 2. Call Gemini
        const audioFilePath = `gs://${bucket}/${name}`;
        const result = await generativeModel.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { fileData: { fileUri: audioFilePath, mimeType: 'audio/wav' } } // Assuming WAV, adjust if needed
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: 'application/json',
            }
        });

        const aiResponseText = result.response.candidates?.[0].content.parts[0].text;
        if (!aiResponseText) {
            throw new Error('No response from Gemini');
        }

        const dspParams = JSON.parse(aiResponseText);
        console.log('Gemini Analysis Results:', dspParams);

        // 3. Orchestrate the next step: Push to dsp-params-topic
        const topicName = process.env.DSP_PARAMS_TOPIC || 'dsp-params-topic';
        const outputBucket = process.env.OUTPUT_BUCKET || 'aidriven-mastering-output';
        const outputPath = `mastered/${path.basename(name)}`;

        const masteringTask = {
            inputBucket: bucket,
            inputPath: name,
            outputBucket: outputBucket,
            outputPath: outputPath,
            params: {
                tube_drive_amount: dspParams.tube_drive_amount,
                low_contour_amount: dspParams.low_contour_amount,
                limiter_ceiling_db: dspParams.limiter_ceiling_db
            },
            targetLUFS: dspParams.target_lufs
        };

        const messageId = await pubsub.topic(topicName).publishMessage({
            json: masteringTask
        });

        console.log(`Mastering task published to ${topicName} (ID: ${messageId})`);

        res.status(200).send(`Success: Task ${messageId} published`);
    } catch (error: any) {
        console.error('Error in analysis trigger:', error);
        res.status(500).send(`Analysis failed: ${error.message || 'Unknown error'}`);
    }
});

app.listen(PORT, () => {
    console.log(`Audio Analysis Trigger listening on port ${PORT}`);
});
