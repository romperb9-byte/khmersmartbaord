import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
      if (!isTransient || attempt === maxAttempts - 1) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

function extractBase64Payload(dataUrlOrBase64: string, fallbackMime = 'image/png') {
  if (dataUrlOrBase64.startsWith('data:')) {
    const match = dataUrlOrBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
  }
  return { mimeType: fallbackMime, data: dataUrlOrBase64 };
}

function handleApiError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unexpected AI server error.';
  console.error('[AI API Error]', message);
  let status = 500;
  if (message.includes('API_KEY_INVALID') || message.includes('GEMINI_API_KEY is not configured')) {
    status = 400;
  } else if (message.includes('PERMISSION_DENIED') || message.includes('403')) {
    status = 403;
  } else if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
    status = 429;
  }
  res.status(status).json({ error: message });
}

function sanitizeSvgMarkup(rawSvg: string): string {
  const cleaned = rawSvg
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .trim();
  const match = cleaned.match(/<svg[\s\S]*<\/svg>/i);
  return match ? match[0] : cleaned;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '18mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, hasKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // 1. AI Read & Write (OCR, Proofread, Translate KM<->EN, Summarize, Explain)
  app.post('/api/ai/read-write', async (req: Request, res: Response) => {
    try {
      const { action, text = '', imageBase64, lang = 'km' } = req.body as {
        action: 'ocr' | 'proofread' | 'translate' | 'summarize' | 'explain';
        text?: string;
        imageBase64?: string;
        lang?: 'km' | 'en';
      };

      const trimmedText = typeof text === 'string' ? text.trim() : '';
      if (!trimmedText && !imageBase64) {
        res.status(400).json({ error: 'Please provide text or whiteboard content to process.' });
        return;
      }

      const ai = getAiClient();
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (imageBase64) {
        const img = extractBase64Payload(imageBase64, 'image/png');
        parts.push({ inlineData: img });
      }

      const responseLangNote =
        lang === 'km'
          ? 'Respond primarily in clear, natural Khmer (and preserve English technical terms when helpful).'
          : 'Respond in clear, natural English (preserving Khmer terms if translating or analyzing Khmer text).';

      const sourceBlock = trimmedText
        ? `\n\nText:\n${trimmedText}`
        : '\n\n(Read and extract the text directly from the attached whiteboard image.)';

      let instruction = '';
      switch (action) {
        case 'ocr':
          instruction =
            'Perform accurate OCR on this whiteboard image. Extract ALL handwritten and typed text in both Khmer (អក្សរខ្មែរ) and English, preserving line breaks and mathematical expressions accurately. Output only the recognized text cleanly without extra commentary. If no text is visible, state that clearly.';
          break;
        case 'proofread':
          instruction = `Proofread and correct spelling, grammar, and punctuation in the following text or whiteboard image (supports both Khmer and English). Return the corrected version first, followed by a brief list of key corrections made. ${responseLangNote}${sourceBlock}`;
          break;
        case 'translate':
          instruction = `Detect whether the following text or whiteboard image content is Khmer or English (or mixed). If it is primarily Khmer, translate it accurately into natural English. If it is primarily English, translate it accurately into natural Khmer. Preserve formatting.${sourceBlock}`;
          break;
        case 'summarize':
          instruction = `Summarize the lesson/notes below (and/or from the attached whiteboard image) into concise, structured bullet points highlighting key takeaways. ${responseLangNote}${sourceBlock}`;
          break;
        case 'explain':
          instruction = `Explain the concept/lesson below (and/or from the attached whiteboard image) clearly and simply with intuitive examples so any student can understand easily. ${responseLangNote}${sourceBlock}`;
          break;
        default:
          instruction = `Analyze the input cleanly. ${responseLangNote}${sourceBlock}`;
      }

      parts.push({ text: instruction });

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
      );

      const fallbackText =
        response.candidates?.[0]?.content?.parts
          ?.map((p) => ('text' in p && typeof p.text === 'string' ? p.text : ''))
          .join('') || '';
      const output = (response.text ?? fallbackText).trim();

      res.json({ result: output });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 2. Speech to Text (Audio Transcription via gemini-3.5-transcribe)
  app.post('/api/ai/transcribe', async (req: Request, res: Response) => {
    try {
      const { audioBase64, mimeType = 'audio/webm', lang = 'km' } = req.body as {
        audioBase64: string;
        mimeType?: string;
        lang?: 'km' | 'en';
      };

      if (!audioBase64) {
        res.status(400).json({ error: 'Audio data is required.' });
        return;
      }

      const ai = getAiClient();
      const audio = extractBase64Payload(audioBase64, mimeType);

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              { inlineData: audio },
              {
                text:
                  lang === 'km'
                    ? 'Transcribe this spoken audio accurately in Khmer and/or English. Output only the transcribed text.'
                    : 'Transcribe this spoken audio accurately in English and/or Khmer. Output only the transcribed text.',
              },
            ],
          },
        }),
      );

      res.json({ text: (response.text ?? '').trim() });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 3. Text to Speech (via gemini-3.8-flash-lite-tts)
  app.post('/api/ai/tts', async (req: Request, res: Response) => {
    try {
      const { text, lang = 'km' } = req.body as { text: string; lang?: 'km' | 'en' };
      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }

      const ai = getAiClient();
      const trimmed = text.trim().slice(0, 1800);

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: trimmed,
                  speechMetadata: {
                    style:
                      lang === 'km'
                        ? 'Clear, warm, articulate educator speaking smoothly'
                        : 'Clear, friendly, articulate educator',
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        }),
      );

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) {
        throw new Error('No audio data returned by TTS model.');
      }

      res.json({ audioBase64: audioData, mimeType: 'audio/wav' });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 4. AI Shape Recognition
  app.post('/api/ai/recognize-shape', async (req: Request, res: Response) => {
    try {
      const { imageBase64, pointsSummary } = req.body as {
        imageBase64?: string;
        pointsSummary?: string;
      };

      const ai = getAiClient();
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (imageBase64) {
        parts.push({ inlineData: extractBase64Payload(imageBase64, 'image/png') });
      }
      parts.push({
        text: `Classify the hand-drawn stroke into the closest geometric shape: "circle", "rect", "triangle", "line", "arrow", or "none" (if it is handwriting or an irregular organic drawing). ${
          pointsSummary ? `Normalized stroke geometry summary: ${pointsSummary}` : ''
        }`,
      });

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                shapeKind: {
                  type: Type.STRING,
                  description: 'One of: circle, rect, triangle, line, arrow, none',
                },
                confidence: {
                  type: Type.NUMBER,
                  description: 'Confidence from 0 to 1',
                },
                label: {
                  type: Type.STRING,
                  description: 'Short name of recognized shape',
                },
              },
              required: ['shapeKind', 'confidence', 'label'],
            },
          },
        }),
      );

      const parsed = JSON.parse(response.text ?? '{}');
      res.json(parsed);
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 5. AI Drawing: Text or Sketch to Crisp Vector SVG Illustration
  app.post('/api/ai/vector-illustration', async (req: Request, res: Response) => {
    try {
      const { mode = 'text', prompt = '', imageBase64, lang = 'km' } = req.body as {
        mode: 'text' | 'sketch';
        prompt?: string;
        imageBase64?: string;
        lang?: 'km' | 'en';
      };

      const ai = getAiClient();
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (imageBase64) {
        parts.push({ inlineData: extractBase64Payload(imageBase64, 'image/png') });
      }

      const instruction =
        mode === 'sketch'
          ? `Look carefully at this rough whiteboard sketch${
              prompt ? ` and description ("${prompt}")` : ''
            }. Transform it into a polished, clean, richly layered, colorful vector illustration in SVG format (viewBox="0 0 420 320") with smooth paths, subtle gradients, clean shapes, and balanced composition on a transparent or soft backdrop.`
          : `Create a polished, detailed, colorful vector illustration in SVG format (viewBox="0 0 420 320") for: "${prompt}". Use clean geometric/bezier paths, harmonious colors, gradients, and crisp visual hierarchy suitable for placing onto an educational whiteboard.`;

      parts.push({
        text: `${instruction} Title should be in ${lang === 'km' ? 'Khmer or bilingual' : 'English'}. Return valid standalone <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 320">...</svg> with no external URLs or scripts.`,
      });

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                svg: { type: Type.STRING },
              },
              required: ['title', 'svg'],
            },
          },
        }),
      );

      const parsed = JSON.parse(response.text ?? '{}') as { title?: string; svg?: string };
      res.json({
        title: parsed.title ?? 'AI Illustration',
        svg: sanitizeSvgMarkup(parsed.svg ?? ''),
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 6. AI Auto 3D Generator (Text/Sketch/Image -> Multi-Part Three.js PBR Blueprint)
  app.post('/api/ai/generate-3d', async (req: Request, res: Response) => {
    try {
      const { mode = 'text', prompt = '', imageBase64, lang = 'km' } = req.body as {
        mode: 'text' | 'sketch' | 'image';
        prompt?: string;
        imageBase64?: string;
        lang?: 'km' | 'en';
      };

      const ai = getAiClient();
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (imageBase64) {
        parts.push({ inlineData: extractBase64Payload(imageBase64, 'image/png') });
      }

      const sourceInstruction =
        mode === 'sketch'
          ? `Analyze the attached whiteboard hand-drawn sketch${
              prompt ? ` along with the user prompt "${prompt}"` : ''
            } and reconstruct it into a detailed, recognizable 3D composite object.`
          : mode === 'image'
            ? `Analyze the attached 2D reference image${
                prompt ? ` and prompt "${prompt}"` : ''
              } and reconstruct it into an accurate, well-proportioned 3D composite object.`
            : `Design a detailed, recognizable 3D composite object matching: "${prompt}".`;

      parts.push({
        text: `${sourceInstruction}
Rules for 3D Blueprint synthesis:
- Assemble between 5 and 16 distinct parts (primary body/chassis, secondary sub-assemblies, and accent details like windows, wheels, eyes, roof tiles, foliage, lights, handles).
- Coordinate system: Y is UP (+Y), ground plane is at y = 0. Ensure the lowest bottom edge of the model rests cleanly at y = 0 so nothing floats or sinks underground. Keep overall model footprint centered around (0, 0) on X/Z within roughly -2.5 to +2.5 units in size.
- Allowed geometry types: "box", "sphere", "cylinder", "cone", "torus", "capsule", "dodecahedron", "octahedron", "torusknot".
- Dimensions interpretation per geometry:
  - box: [width, height, depth]
  - sphere: [radius, widthSegments(24), heightSegments(18)]
  - cylinder: [radiusTop, radiusBottom, height]
  - cone: [radius, height, radialSegments(24)]
  - torus: [radius, tubeRadius, radialSegments(16)]
  - capsule: [radius, length, capSegments(8)]
  - dodecahedron / octahedron: [radius, detail(0), 0]
  - torusknot: [radius, tube, tubularSegments(64)]
- Vary roughness (>= 0.25 difference between structural matte/wood/fabric vs glossy glass/metal) and metalness appropriately.
- Use valid 6-digit hex color strings (e.g. "#2563EB").
- Provide title and short description in ${lang === 'km' ? 'Khmer (with English term)' : 'English'}.`,
      });

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                category: { type: Type.STRING },
                description: { type: Type.STRING },
                parts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                      geometry: {
                        type: Type.STRING,
                        description:
                          'box, sphere, cylinder, cone, torus, capsule, dodecahedron, octahedron, or torusknot',
                      },
                      dimensions: {
                        type: Type.ARRAY,
                        items: { type: Type.NUMBER },
                      },
                      position: {
                        type: Type.ARRAY,
                        items: { type: Type.NUMBER },
                      },
                      rotation: {
                        type: Type.ARRAY,
                        items: { type: Type.NUMBER },
                      },
                      scale: {
                        type: Type.ARRAY,
                        items: { type: Type.NUMBER },
                      },
                      color: { type: Type.STRING },
                      roughness: { type: Type.NUMBER },
                      metalness: { type: Type.NUMBER },
                      emissive: { type: Type.STRING },
                      emissiveIntensity: { type: Type.NUMBER },
                      opacity: { type: Type.NUMBER },
                    },
                    required: [
                      'id',
                      'name',
                      'geometry',
                      'dimensions',
                      'position',
                      'rotation',
                      'scale',
                      'color',
                      'roughness',
                      'metalness',
                    ],
                  },
                },
              },
              required: ['title', 'category', 'description', 'parts'],
            },
          },
        }),
      );

      const blueprint = JSON.parse(response.text ?? '{}');
      res.json({ blueprint });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 7. AI Calculator (Arithmetic, Percentages, Fractions, Algebra, Geometry, Equations, Canvas Handwriting)
  app.post('/api/ai/solve-math', async (req: Request, res: Response) => {
    try {
      const { expression = '', imageBase64, lang = 'km' } = req.body as {
        expression?: string;
        imageBase64?: string;
        lang?: 'km' | 'en';
      };

      const ai = getAiClient();
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (imageBase64) {
        parts.push({ inlineData: extractBase64Payload(imageBase64, 'image/png') });
      }

      parts.push({
        text: `Solve the mathematical expression, equation, algebra, geometry, percentage, fraction, or handwritten math problem${
          expression ? `: "${expression}"` : ' shown in the attached whiteboard image'
        }.
Verify every calculation carefully. Provide:
- expression: cleaned mathematical expression or equation found
- answer: clear final exact/decimal answer
- topic: math category (e.g. Arithmetic, Algebra, Geometry, Fractions, Equations)
- steps: array of clear step-by-step reasoning strings
- explanation: concise summary explanation
Respond in ${lang === 'km' ? 'Khmer (keeping standard math notation like x, =, √, π)' : 'English'}.`,
      });

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                expression: { type: Type.STRING },
                answer: { type: Type.STRING },
                topic: { type: Type.STRING },
                steps: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                explanation: { type: Type.STRING },
              },
              required: ['expression', 'answer', 'topic', 'steps', 'explanation'],
            },
          },
        }),
      );

      const solution = JSON.parse(response.text ?? '{}');
      res.json({ solution });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 7b. AI Handwritten Math Region (= Trigger, Fractions, Equations & Graph Extraction)
  app.post('/api/ai/solve-math-region', async (req: Request, res: Response) => {
    try {
      const { imageBase64, lang = 'km' } = req.body as {
        imageBase64?: string;
        lang?: 'km' | 'en';
      };

      if (!imageBase64) {
        res.status(400).json({ error: 'Board image data is required.' });
        return;
      }

      const ai = getAiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              { inlineData: extractBase64Payload(imageBase64, 'image/png') },
              {
                text: `You are a math OCR, algebraic equation solver, and function graph analyzer for a smart classroom whiteboard (user UI language: ${lang}).
Look at the handwritten math expression, equation, or function in this image (e.g., "3y + 5 = 5", "2x - 4 = 0", "y = 2x + 1", "y = x^2 - 2", or arithmetic like "1/2 + 1/4 =").
1. Read the expression/equation accurately (converting Khmer digits ០១២៣៤៥៦៧៨៩ to 0-9).
2. If it is an equation with one variable (like "3y + 5 = 5" or "2x + 6 = 0"), solve for the variable (e.g. "y = 0" or "x = -3") and also provide a plottable math expression in terms of x if it defines y (for "3y + 5 = 5" => y = 0 => plottableFn: "0"; for "2x - 4 = 0" => plottableFn: "").
3. If it is a function of x (like "y = 2x + 1" or "f(x) = x^2 - 2"), set displayAnswer to the simplified function and plottableFn to standard math syntax using x (e.g. "2*x + 1", "x^2 - 2").
4. If it is an arithmetic expression, calculate the exact answer (including simplified fraction if non-integer).
5. If no clear math expression is visible, set answer to "unknown".`,
              },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                expression: { type: Type.STRING },
                answer: { type: Type.STRING },
                fraction: { type: Type.STRING },
                displayAnswer: { type: Type.STRING },
                isEquationOrFunction: { type: Type.BOOLEAN },
                plottableFn: { type: Type.STRING },
                suggested3D: { type: Type.STRING },
              },
              required: [
                'expression',
                'answer',
                'fraction',
                'displayAnswer',
                'isEquationOrFunction',
                'plottableFn',
                'suggested3D',
              ],
            },
          },
        }),
      );

      const parsed = JSON.parse(response.text ?? '{}');
      res.json({ result: parsed });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 8. AI Tutor (Q&A, Quiz Generation, Educational SVG Diagrams)
  app.post('/api/ai/tutor', async (req: Request, res: Response) => {
    try {
      const {
        action = 'chat',
        subject = 'math',
        level = 'high',
        prompt = '',
        imageBase64,
        history = [],
        lang = 'km',
      } = req.body as {
        action: 'chat' | 'quiz' | 'diagram';
        subject?: string;
        level?: string;
        prompt?: string;
        imageBase64?: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        lang?: 'km' | 'en';
      };

      const ai = getAiClient();
      const langNote = lang === 'km' ? 'Khmer (with English scientific/math terms where helpful)' : 'English';

      if (action === 'quiz') {
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
        if (imageBase64) {
          parts.push({ inlineData: extractBase64Payload(imageBase64, 'image/png') });
        }
        parts.push({
          text: `Create a 4-question practice quiz for Subject: "${subject}", Student Level: "${level}"${
            prompt ? `, focused on topic: "${prompt}"` : ' based on the whiteboard content or core curriculum for this subject/level'
          }. Write questions, 4 options per question, and clear explanations in ${langNote}.`,
        });

        const response = await withRetry(() =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: { parts },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        question: { type: Type.STRING },
                        options: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        correctIndex: { type: Type.INTEGER },
                        explanation: { type: Type.STRING },
                      },
                      required: ['id', 'question', 'options', 'correctIndex', 'explanation'],
                    },
                  },
                },
                required: ['questions'],
              },
            },
          }),
        );

        const parsed = JSON.parse(response.text ?? '{"questions":[]}');
        res.json(parsed);
        return;
      }

      if (action === 'diagram') {
        const response = await withRetry(() =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Create a clean, labeled educational SVG diagram (viewBox="0 0 560 380") for Subject: "${subject}", Level: "${level}", Topic: "${
              prompt || subject
            }".
Include clean arrows, labeled parts, coordinate axes or flow diagrams, high-contrast typography, and zero scripts/external links. Language for labels: ${langNote}.`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  caption: { type: Type.STRING },
                  svg: { type: Type.STRING },
                },
                required: ['title', 'caption', 'svg'],
              },
            },
          }),
        );

        const parsed = JSON.parse(response.text ?? '{}') as {
          title?: string;
          caption?: string;
          svg?: string;
        };
        res.json({
          title: parsed.title ?? 'Lesson Diagram',
          caption: parsed.caption ?? '',
          svg: sanitizeSvgMarkup(parsed.svg ?? ''),
        });
        return;
      }

      // Default: 'chat'
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (imageBase64) {
        parts.push({ inlineData: extractBase64Payload(imageBase64, 'image/png') });
      }
      const recentContext = history
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`)
        .join('\n');

      parts.push({
        text: `${recentContext ? `Recent conversation:\n${recentContext}\n\n` : ''}Student question: ${prompt}`,
      });

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            systemInstruction: `You are an encouraging, expert AI Tutor teaching Subject: ${subject} at Student Level: ${level}. Explain concepts clearly, adapt depth to the student's level, use concrete examples, and respond in ${langNote}.`,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
      );

      res.json({ reply: (response.text ?? '').trim() });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart AI Whiteboard server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
