import express from 'express';
import { Storage } from '@google-cloud/storage';
import * as wav from 'node-wav';
import * as fs from 'fs';
import * as path from 'path';
import {
    MasteringParams,
    buildMasteringChain,
    optimizeMasteringParams,
    DEFAULT_PARAMS
} from './engine';

const app = express();
app.use(express.json());

const storage = new Storage();
const PORT = process.env.PORT || 8080;

app.post('/process', async (req, res) => {
    const { inputBucket, inputPath, outputBucket, outputPath, params, targetLUFS } = req.body;

    if (!inputBucket || !inputPath || !outputBucket || !outputPath) {
        return res.status(400).send('Missing required fields');
    }

    try {
        console.log(`Processing ${inputPath} from ${inputBucket}...`);

        // 1. Download from GCS
        const tempInput = path.join('/tmp', `input-${Date.now()}.wav`);
        await storage.bucket(inputBucket).file(inputPath).download({ destination: tempInput });

        // 2. Decode WAV
        const fileBuffer = fs.readFileSync(tempInput);
        const decoded = wav.decode(fileBuffer);
        const { sampleRate, channelData } = decoded;

        // Ensure we have at least 2 channels for stereo processing
        let left = channelData[0];
        let right = channelData[1] || new Float32Array(left.length).fill(0);

        // 3. Optional: Optimize parameters for target LUFS
        let finalParams = { ...DEFAULT_PARAMS, ...params };
        if (targetLUFS) {
            console.log(`Optimizing parameters for target LUFS: ${targetLUFS}`);
            const optimization = optimizeMasteringParams(left, right, sampleRate, targetLUFS, finalParams);
            finalParams = optimization.params;
            console.log(`Optimization complete: achieved LUFS ${optimization.achievedLUFS} in ${optimization.iterations} iterations`);
        }

        // 4. Apply Mastering Chain
        console.log('Applying mastering chain...');
        buildMasteringChain(left, right, sampleRate, finalParams);

        // 5. Encode to WAV
        console.log('Encoding to WAV...');
        const encodedBuffer = wav.encode([left, right], { sampleRate, float: true });
        const tempOutput = path.join('/tmp', `output-${Date.now()}.wav`);
        fs.writeFileSync(tempOutput, encodedBuffer);

        // 6. Upload to GCS
        console.log(`Uploading to ${outputBucket}/${outputPath}...`);
        await storage.bucket(outputBucket).upload(tempOutput, {
            destination: outputPath,
            metadata: {
                contentType: 'audio/wav',
                metadata: {
                    masteredBy: 'Neuro-Master-Engine',
                    params: JSON.stringify(finalParams)
                }
            }
        });

        // Cleanup
        fs.unlinkSync(tempInput);
        fs.unlinkSync(tempOutput);

        res.status(200).json({
            message: 'Mastering complete',
            outputPath: `gs://${outputBucket}/${outputPath}`,
            appliedParams: finalParams
        });

    } catch (error) {
        console.error('Error during mastering:', error);
        res.status(500).send(`Mastering failed: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`DSP Mastering Engine listening on port ${PORT}`);
});
