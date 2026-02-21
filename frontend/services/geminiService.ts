
import { GoogleGenAI, Type } from '@google/genai';
import { AnalysisMetric, AgentOpinion, MasteringParams } from '../types';

const ai = new GoogleGenAI({ apiKey: (process.env as any).API_KEY, vertexai: true });

export async function analyzeAudioWithGemini(fileName: string): Promise<AnalysisMetric[]> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      role: 'user',
      parts: [{ text: `Analyze the audio file "${fileName}" for Beatport Top 10 compatibility. Provide 20 key technical metrics compared to current Top 10 standards (Tech House/Techno).` }]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            value: { type: Type.NUMBER },
            target: { type: Type.NUMBER },
            unit: { type: Type.STRING },
            status: { type: Type.STRING, enum: ['low', 'optimal', 'high'] },
            description: { type: Type.STRING }
          },
          required: ['name', 'value', 'target', 'unit', 'status', 'description']
        }
      }
    }
  });

  return JSON.parse(response.text);
}

export async function getAgentConsensus(metrics: AnalysisMetric[]): Promise<{ opinions: AgentOpinion[], finalParams: MasteringParams }> {
  const metricsSummary = metrics.map(m => `${m.name}: ${m.value}${m.unit} (Target: ${m.target}${m.unit})`).join('\n');
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      role: 'user',
      parts: [{ text: `Based on these audio metrics:\n${metricsSummary}\n\nAct as three personas: Audience, A&R, and Engineer. Discuss and reach a consensus on the following DSP parameters for mastering:\n1. tube_drive_amount (0-1)\n2. low_contour_amount (0-2.5)\n3. limiter_ceiling_db (-2.0 to -0.1)\n\nProvide each persona's opinion and the final agreed-upon values.` }]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          opinions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                role: { type: Type.STRING },
                avatar: { type: Type.STRING },
                comment: { type: Type.STRING },
                suggestedParams: {
                  type: Type.OBJECT,
                  properties: {
                    tube_drive_amount: { type: Type.NUMBER },
                    low_contour_amount: { type: Type.NUMBER },
                    limiter_ceiling_db: { type: Type.NUMBER }
                  }
                }
              }
            }
          },
          finalParams: {
            type: Type.OBJECT,
            properties: {
              tube_drive_amount: { type: Type.NUMBER },
              low_contour_amount: { type: Type.NUMBER },
              limiter_ceiling_db: { type: Type.NUMBER }
            }
          }
        }
      }
    }
  });

  return JSON.parse(response.text);
}
