import express from 'express';
import { PubSub } from '@google-cloud/pubsub';
import { VertexAI } from '@google-cloud/vertexai';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const cleanJsonResponse = (text: string) => {
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

dotenv.config();

const app = express();
app.use(express.json());

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
    const { bucket, name } = eventData;

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

        const audioFileData = { fileData: { fileUri: `gs://${bucket}/${name}`, mimeType: 'audio/wav' } };

        // 1. Audience Persona Call
        console.log('Consulting Audience Agent...');
        const audiencePrompt = `
      You are the **Audience Persona**. Focus on energy, impact, and "vibe". 
      Analyze the track for festival/club playback. Does the kick hit hard enough? Is the bass clear?
      Respond in JSON: {"comment": "...", "suggestedParams": {"tube_drive": 0.0-1.0, "low_contour": 0.0-2.5}}
    `;
        const audienceResult = await generativeModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: audiencePrompt }, audioFileData] }],
            generationConfig: { responseMimeType: 'application/json' }
        });
        const audienceText = cleanJsonResponse(audienceResult.response.candidates?.[0].content.parts[0].text || '{}');
        const audienceOpinion = JSON.parse(audienceText);
        console.log('Audience Opinion:', audienceOpinion.comment?.slice(0, 50));

        // 2. A&R Persona Call
        console.log('Consulting A&R Agent...');
        const arPrompt = `
      You are the **A&R Persona**. Focus on market compatibility and Beatport Top 10 standards.
      Audience's opinion: "${audienceOpinion.comment}"
      Compare this track to labels like Afterlife or Drumcode.
      Respond in JSON: {"comment": "...", "suggestedParams": {"tube_drive": 0.0-1.0, "target_lufs": -9.0 to -7.0}}
    `;
        const arResult = await generativeModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: arPrompt }, audioFileData] }],
            generationConfig: { responseMimeType: 'application/json' }
        });
        const arText = cleanJsonResponse(arResult.response.candidates?.[0].content.parts[0].text || '{}');
        const arOpinion = JSON.parse(arText);
        console.log('A&R Opinion:', arOpinion.comment?.slice(0, 50));

        // 3. Engineer Persona Call (Final Consensus)
        console.log('Consulting Engineer Agent (Final Consensus)...');
        const engineerPrompt = `
      You are the **Mastering Engineer Persona**. Focus on technical integrity, phase, and dynamics.
      Audience opinion: "${audienceOpinion.comment}"
      A&R opinion: "${arOpinion.comment}"
      Synthesize these into final DSP parameters. Ensure no clipping and optimal "expensive" sound.
      
      Respond ONLY in JSON:
      {
        "metrics": [{"name": "...", "value": "...", "target": "...", "unit": "...", "status": "low/optimal/high", "description": "..."}],
        "engineerComment": "...",
        "finalParams": {
            "tube_drive_amount": (0-1),
            "low_contour_amount": (0-2.5),
            "limiter_ceiling_db": (-1.0 to -0.1),
            "target_lufs": (-9.0 to -7.0)
        }
      }
    `;
        const engineerResult = await generativeModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: engineerPrompt }, audioFileData] }],
            generationConfig: { responseMimeType: 'application/json' }
        });
        const engineerText = cleanJsonResponse(engineerResult.response.candidates?.[0].content.parts[0].text || '{}');
        const finalConsensus = JSON.parse(engineerText);
        console.log('Engineer Consensus achieved.');
        if (!finalConsensus || !finalConsensus.finalParams) {
            throw new Error('AI failed to generate valid mastering parameters. Please try with a different track or check the AI prompt.');
        }

        const consensusOpinions = [
            { role: 'Audience', comment: audienceOpinion.comment || 'No comment provided' },
            { role: 'A&R', comment: arOpinion.comment || 'No comment provided' },
            { role: 'Engineer', comment: finalConsensus.engineerComment || 'No comment provided' }
        ];

        console.log('Multi-Agent Consensus achieved.');

        // 3. Update Supabase
        if (jobId) {
            const { error: updateErr } = await supabase.from('mastering_jobs').update({
                status: 'processing',
                metrics: finalConsensus.metrics || [],
                consensus_opinions: consensusOpinions,
                final_params: finalConsensus.finalParams
            }).eq('id', jobId);

            if (updateErr) throw updateErr;
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
            params: finalConsensus.finalParams,
            targetLUFS: finalConsensus.finalParams.target_lufs || -8.0
        };

        const messageId = await pubsub.topic(topicName).publishMessage({
            json: masteringTask
        });

        console.log(`Task published to DSP engine (ID: ${messageId})`);
        res.status(200).send(`Success: Task ${messageId} published`);

    } catch (error: any) {
        console.error('Error in analysis trigger:', error);
        if (jobId) {
            try {
                await supabase.from('mastering_jobs').update({
                    status: 'failed',
                    error_message: error.message
                }).eq('id', jobId);
            } catch (dbErr) {
                console.error('Failed to update error status in DB:', dbErr);
            }
        }
        // Return 200 to acknowledge Pub/Sub message and stop the retry loop, 
        // since we've already handled the failure state in our DB.
        res.status(200).send(`Handled failure: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Audio Analysis Trigger listening on port ${PORT}`);
});
