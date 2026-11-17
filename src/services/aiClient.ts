import type {
  DetectedEquationResult,
  Language,
  MathSolution,
  Model3DBlueprint,
  TutorQuizQuestion,
} from '../types/whiteboard';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export async function callReadWriteAI(params: {
  action: 'ocr' | 'proofread' | 'translate' | 'summarize' | 'explain';
  text?: string;
  imageBase64?: string;
  lang: Language;
}): Promise<string> {
  const res = await postJson<{ result: string }>('/api/ai/read-write', params);
  return res.result;
}

export async function transcribeAudioAI(params: {
  audioBase64: string;
  mimeType: string;
  lang: Language;
}): Promise<string> {
  const res = await postJson<{ text: string }>('/api/ai/transcribe', params);
  return res.text;
}

export async function synthesizeSpeechAI(params: {
  text: string;
  lang: Language;
}): Promise<{ audioBase64: string; mimeType: string }> {
  return postJson<{ audioBase64: string; mimeType: string }>('/api/ai/tts', params);
}

export async function recognizeShapeAI(params: {
  imageBase64?: string;
  pointsSummary?: string;
}): Promise<{ shapeKind: 'circle' | 'rect' | 'triangle' | 'line' | 'arrow' | 'none'; confidence: number; label: string }> {
  return postJson('/api/ai/recognize-shape', params);
}

export async function generateVectorIllustrationAI(params: {
  mode: 'text' | 'sketch';
  prompt?: string;
  imageBase64?: string;
  lang: Language;
}): Promise<{ title: string; svg: string }> {
  return postJson('/api/ai/vector-illustration', params);
}

export async function generate3DModelAI(params: {
  mode: 'text' | 'sketch' | 'image';
  prompt?: string;
  imageBase64?: string;
  lang: Language;
}): Promise<Model3DBlueprint> {
  const res = await postJson<{ blueprint: Model3DBlueprint }>('/api/ai/generate-3d', params);
  return res.blueprint;
}

export async function solveMathAI(params: {
  expression?: string;
  imageBase64?: string;
  lang: Language;
}): Promise<MathSolution> {
  const res = await postJson<{ solution: MathSolution }>('/api/ai/solve-math', params);
  return res.solution;
}

export async function solveMathRegionAI(params: {
  imageBase64: string;
  lang: Language;
}): Promise<DetectedEquationResult> {
  const res = await postJson<{ result: DetectedEquationResult }>('/api/ai/solve-math-region', params);
  return res.result;
}

export async function tutorChatAI(params: {
  subject: string;
  level: string;
  prompt: string;
  imageBase64?: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  lang: Language;
}): Promise<string> {
  const res = await postJson<{ reply: string }>('/api/ai/tutor', {
    action: 'chat',
    ...params,
  });
  return res.reply;
}

export async function tutorQuizAI(params: {
  subject: string;
  level: string;
  prompt?: string;
  imageBase64?: string;
  lang: Language;
}): Promise<TutorQuizQuestion[]> {
  const res = await postJson<{ questions: TutorQuizQuestion[] }>('/api/ai/tutor', {
    action: 'quiz',
    ...params,
  });
  return res.questions || [];
}

export async function tutorDiagramAI(params: {
  subject: string;
  level: string;
  prompt: string;
  lang: Language;
}): Promise<{ title: string; caption: string; svg: string }> {
  return postJson('/api/ai/tutor', {
    action: 'diagram',
    ...params,
  });
}
