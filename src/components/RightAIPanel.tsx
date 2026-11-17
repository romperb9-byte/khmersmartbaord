import React, { useRef, useState } from 'react';
import {
  BookOpen,
  Box,
  Calculator,
  CheckCircle2,
  Cpu,
  FileText,
  GraduationCap,
  ImagePlus,
  Languages,
  Loader2,
  Mic,
  MicOff,
  PenTool,
  PlusCircle,
  Send,
  Shapes,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import type {
  CanvasItem,
  Language,
  MathSolution,
  Model3DBlueprint,
  ShapeItem,
  StrokeItem,
  TutorChatMessage,
  TutorQuizQuestion,
} from '../types/whiteboard';
import { t } from '../i18n/translations';
import {
  callReadWriteAI,
  generate3DModelAI,
  generateVectorIllustrationAI,
  recognizeShapeAI,
  solveMathAI,
  synthesizeSpeechAI,
  transcribeAudioAI,
  tutorChatAI,
  tutorDiagramAI,
  tutorQuizAI,
} from '../services/aiClient';
import { svgMarkupToDataUrl } from '../utils/exportUtils';

export type AITabId = 'readWrite' | 'drawing' | 'gen3d' | 'calculator' | 'tutor';

interface RightAIPanelProps {
  lang: Language;
  activeTab: AITabId;
  onChangeTab: (tab: AITabId) => void;
  getBoardPngBase64: () => string;
  currentItems: CanvasItem[];
  onReplaceItems: (nextItems: CanvasItem[]) => void;
  onInsertText: (text: string) => void;
  onInsertImage: (dataUrl: string, label?: string) => void;
  current3DModel: Model3DBlueprint | null;
  onModel3DGenerated: (model: Model3DBlueprint) => void;
  onOpen3DStudio: () => void;
}

export const RightAIPanel: React.FC<RightAIPanelProps> = ({
  lang,
  activeTab,
  onChangeTab,
  getBoardPngBase64,
  currentItems,
  onReplaceItems,
  onInsertText,
  onInsertImage,
  current3DModel,
  onModel3DGenerated,
  onOpen3DStudio,
}) => {
  const copy = t(lang);

  // Shared error / loading
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- Tab 1: Read & Write ---
  const [rwText, setRwText] = useState('');
  const [rwResult, setRwResult] = useState('');
  const [rwLoading, setRwLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // --- Tab 2: AI Drawing ---
  const [drawMode, setDrawMode] = useState<'text' | 'sketch'>('text');
  const [drawPrompt, setDrawPrompt] = useState('');
  const [drawPreview, setDrawPreview] = useState<{ title: string; svg: string; dataUrl: string } | null>(
    null,
  );
  const [drawLoading, setDrawLoading] = useState(false);
  const [shapeNotice, setShapeNotice] = useState<string | null>(null);

  // --- Tab 3: 3D Generator ---
  const [gen3dMode, setGen3dMode] = useState<'text' | 'sketch' | 'image'>('text');
  const [gen3dPrompt, setGen3dPrompt] = useState('');
  const [gen3dImage, setGen3dImage] = useState<string | null>(null);
  const [gen3dLoading, setGen3dLoading] = useState(false);

  // --- Tab 4: AI Calculator ---
  const [calcExpr, setCalcExpr] = useState('');
  const [calcSolution, setCalcSolution] = useState<MathSolution | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // --- Tab 5: AI Tutor ---
  const [tutorSubject, setTutorSubject] = useState('math');
  const [tutorLevel, setTutorLevel] = useState('high');
  const [tutorPrompt, setTutorPrompt] = useState('');
  const [tutorIncludeBoard, setTutorIncludeBoard] = useState(true);
  const [tutorMessages, setTutorMessages] = useState<TutorChatMessage[]>([]);
  const [tutorQuiz, setTutorQuiz] = useState<TutorQuizQuestion[]>([]);
  const [tutorAnswers, setTutorAnswers] = useState<Record<string, number>>({});
  const [tutorGraded, setTutorGraded] = useState(false);
  const [tutorLoading, setTutorLoading] = useState(false);

  const runReadWrite = async (action: 'ocr' | 'proofread' | 'translate' | 'summarize' | 'explain') => {
    setErrorMsg(null);
    const boardText = currentItems
      .filter((it): it is Extract<CanvasItem, { type: 'text' }> => it.type === 'text')
      .map((it) => it.text.trim())
      .filter(Boolean)
      .join('\n');

    const textToProcess = rwText.trim() || (action !== 'ocr' ? boardText : '');
    const needsBoard = action === 'ocr' || !textToProcess;
    const imageBase64 = needsBoard ? getBoardPngBase64() : undefined;

    if (!textToProcess && (!imageBase64 || currentItems.length === 0)) {
      setErrorMsg(
        lang === 'km'
          ? 'សូមវាយអត្ថបទ ឬសរសេរលើក្ដារខៀនជាមុនសិន។'
          : 'Please type text or draw/write on the whiteboard first.',
      );
      return;
    }

    setRwLoading(true);
    try {
      const result = await callReadWriteAI({
        action,
        text: textToProcess,
        imageBase64,
        lang,
      });
      if (!result || !result.trim()) {
        setErrorMsg(
          lang === 'km'
            ? 'AI មិនទទួលបានអត្ថបទសម្រាប់ដំណើរការទេ។'
            : 'No text result returned by AI.',
        );
        return;
      }
      if (action === 'ocr') {
        setRwText(result);
      } else if (!rwText.trim() && boardText) {
        setRwText(boardText);
      }
      setRwResult(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI Read/Write failed');
    } finally {
      setRwLoading(false);
    }
  };

  const toggleRecording = async () => {
    setErrorMsg(null);
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = String(reader.result || '');
          setRwLoading(true);
          try {
            const transcribed = await transcribeAudioAI({
              audioBase64: base64,
              mimeType: blob.type || 'audio/webm',
              lang,
            });
            setRwText((prev) => (prev ? `${prev}\n${transcribed}` : transcribed));
            setRwResult(transcribed);
          } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Transcription failed');
          } finally {
            setRwLoading(false);
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Microphone access denied');
    }
  };

  const toggleReadAloud = async () => {
    setErrorMsg(null);
    if (isPlayingAudio && audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
      setIsPlayingAudio(false);
      return;
    }

    const textToSpeak = (rwResult || rwText).trim();
    if (!textToSpeak) return;

    setRwLoading(true);
    try {
      const { audioBase64, mimeType } = await synthesizeSpeechAI({
        text: textToSpeak,
        lang,
      });
      const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
      audioElRef.current = audio;
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => setIsPlayingAudio(false);
      await audio.play();
      setIsPlayingAudio(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Text-to-speech failed');
    } finally {
      setRwLoading(false);
    }
  };

  const handleBeautifyShapes = async () => {
    setErrorMsg(null);
    setShapeNotice(null);
    const strokes = currentItems.filter((it): it is StrokeItem => it.type === 'stroke' && !it.isHighlighter);
    if (strokes.length === 0) {
      setShapeNotice(lang === 'km' ? 'មិនមានគំនូរដៃលើក្ដារខៀនទេ។' : 'No freehand strokes found on this page.');
      return;
    }

    setDrawLoading(true);
    try {
      // Check latest 3 strokes
      const targets = strokes.slice(-3);
      let replacedCount = 0;
      let nextItems = [...currentItems];

      for (const s of targets) {
        const off = document.createElement('canvas');
        off.width = 160;
        off.height = 160;
        const ctx = off.getContext('2d');
        if (!ctx) continue;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 160, 160);
        const scale = 120 / Math.max(20, s.width, s.height);
        const ox = (160 - s.width * scale) / 2;
        const oy = (160 - s.height * scale) / 2;
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        s.points.forEach((p, idx) => {
          const px = ox + (p.x - s.x) * scale;
          const py = oy + (p.y - s.y) * scale;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        const res = await recognizeShapeAI({ imageBase64: off.toDataURL('image/png') });
        if (res.shapeKind && res.shapeKind !== 'none' && res.confidence >= 0.45) {
          const first = s.points[0];
          const last = s.points[s.points.length - 1];
          const shape: ShapeItem = {
            id: s.id,
            type: 'shape',
            shapeKind: res.shapeKind,
            x: res.shapeKind === 'line' || res.shapeKind === 'arrow' ? first.x : s.x,
            y: res.shapeKind === 'line' || res.shapeKind === 'arrow' ? first.y : s.y,
            width:
              res.shapeKind === 'line' || res.shapeKind === 'arrow'
                ? last.x - first.x
                : Math.max(24, s.width),
            height:
              res.shapeKind === 'line' || res.shapeKind === 'arrow'
                ? last.y - first.y
                : Math.max(24, s.height),
            color: s.color,
            strokeWidth: s.strokeWidth,
          };
          nextItems = nextItems.map((it) => (it.id === s.id ? shape : it));
          replacedCount++;
        }
      }

      if (replacedCount > 0) {
        onReplaceItems(nextItems);
        setShapeNotice(
          lang === 'km'
            ? `បានកែលម្អរូបភាពធរណីមាត្រចំនួន ${replacedCount} រូប។`
            : `Converted ${replacedCount} freehand stroke(s) into crisp geometry.`,
        );
      } else {
        setShapeNotice(
          lang === 'km'
            ? 'គំនូរដៃត្រូវបានរក្សាទុកដដែល (មិនមែនជារាងធរណីមាត្រសាមញ្ញ)។'
            : 'No simple geometric shapes detected in recent strokes.',
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Shape recognition failed');
    } finally {
      setDrawLoading(false);
    }
  };

  const handleGenerateVector = async () => {
    setErrorMsg(null);
    if (drawMode === 'text' && !drawPrompt.trim()) return;
    setDrawLoading(true);
    try {
      const imageBase64 = drawMode === 'sketch' ? getBoardPngBase64() : undefined;
      const res = await generateVectorIllustrationAI({
        mode: drawMode,
        prompt: drawPrompt.trim(),
        imageBase64,
        lang,
      });
      if (res.svg) {
        setDrawPreview({
          title: res.title,
          svg: res.svg,
          dataUrl: svgMarkupToDataUrl(res.svg),
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Vector illustration failed');
    } finally {
      setDrawLoading(false);
    }
  };

  const handleGenerate3D = async (overridePrompt?: string) => {
    setErrorMsg(null);
    const promptToUse = (overridePrompt ?? gen3dPrompt).trim();
    if (gen3dMode === 'text' && !promptToUse) return;
    if (gen3dMode === 'image' && !gen3dImage) {
      setErrorMsg(lang === 'km' ? 'សូមផ្ទុកឡើងរូបភាព 2D ជាមុនសិន។' : 'Please upload a 2D image first.');
      return;
    }

    setGen3dLoading(true);
    try {
      const imageBase64 =
        gen3dMode === 'sketch'
          ? getBoardPngBase64()
          : gen3dMode === 'image'
            ? gen3dImage || undefined
            : undefined;
      const blueprint = await generate3DModelAI({
        mode: gen3dMode,
        prompt: promptToUse,
        imageBase64,
        lang,
      });
      onModel3DGenerated(blueprint);
      onOpen3DStudio();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '3D model generation failed');
    } finally {
      setGen3dLoading(false);
    }
  };

  const handleSolveMath = async (fromBoard: boolean) => {
    setErrorMsg(null);
    if (!fromBoard && !calcExpr.trim()) return;
    setCalcLoading(true);
    try {
      const sol = await solveMathAI({
        expression: fromBoard ? '' : calcExpr.trim(),
        imageBase64: fromBoard ? getBoardPngBase64() : undefined,
        lang,
      });
      setCalcSolution(sol);
      if (fromBoard && sol.expression) {
        setCalcExpr(sol.expression);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Math solver failed');
    } finally {
      setCalcLoading(false);
    }
  };

  const handleTutorChat = async () => {
    setErrorMsg(null);
    const q = tutorPrompt.trim();
    if (!q) return;
    const userMsg: TutorChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      text: q,
      timestamp: Date.now(),
    };
    const nextHistory = [...tutorMessages, userMsg];
    setTutorMessages(nextHistory);
    setTutorPrompt('');
    setTutorLoading(true);

    try {
      const reply = await tutorChatAI({
        subject: tutorSubject,
        level: tutorLevel,
        prompt: q,
        imageBase64: tutorIncludeBoard ? getBoardPngBase64() : undefined,
        history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
        lang,
      });
      setTutorMessages([
        ...nextHistory,
        {
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          text: reply,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Tutor chat failed');
    } finally {
      setTutorLoading(false);
    }
  };

  const handleTutorQuiz = async () => {
    setErrorMsg(null);
    setTutorLoading(true);
    setTutorGraded(false);
    setTutorAnswers({});
    try {
      const questions = await tutorQuizAI({
        subject: tutorSubject,
        level: tutorLevel,
        prompt: tutorPrompt.trim(),
        imageBase64: tutorIncludeBoard ? getBoardPngBase64() : undefined,
        lang,
      });
      setTutorQuiz(questions);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Quiz generation failed');
    } finally {
      setTutorLoading(false);
    }
  };

  const handleTutorDiagram = async () => {
    setErrorMsg(null);
    setTutorLoading(true);
    try {
      const topic = tutorPrompt.trim() || `${tutorSubject} diagram`;
      const res = await tutorDiagramAI({
        subject: tutorSubject,
        level: tutorLevel,
        prompt: topic,
        lang,
      });
      setTutorMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          text: `${res.title}\n${res.caption}`,
          diagramSvg: res.svg,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Diagram generation failed');
    } finally {
      setTutorLoading(false);
    }
  };

  const tabs: Array<{ id: AITabId; label: string; icon: React.ReactNode }> = [
    { id: 'readWrite', label: copy.aiTabs.readWrite, icon: <BookOpen className="h-3.5 w-3.5" /> },
    { id: 'drawing', label: copy.aiTabs.drawing, icon: <PenTool className="h-3.5 w-3.5" /> },
    { id: 'gen3d', label: copy.aiTabs.gen3d, icon: <Box className="h-3.5 w-3.5" /> },
    { id: 'calculator', label: copy.aiTabs.calculator, icon: <Calculator className="h-3.5 w-3.5" /> },
    { id: 'tutor', label: copy.aiTabs.tutor, icon: <GraduationCap className="h-3.5 w-3.5" /> },
  ];

  const calcKeys = [
    '7', '8', '9', '/', 'sqrt(',
    '4', '5', '6', '*', '^',
    '1', '2', '3', '-', '(',
    '0', '.', '%', '+', ')',
    'x', '=', 'pi', 'C', '⌫',
  ];

  const quizScore = tutorQuiz.reduce(
    (acc, q) => (tutorAnswers[q.id] === q.correctIndex ? acc + 1 : acc),
    0,
  );

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Tab Navigation */}
      <div className="grid grid-cols-5 border-b border-slate-200 bg-slate-50/70 p-1 dark:border-slate-800 dark:bg-slate-950/60">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setErrorMsg(null);
                onChangeTab(tab.id);
              }}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors ${
                active
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.icon}
              <span className="max-w-full truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="mx-3 mt-3 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <span className="break-words">{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="shrink-0 font-semibold">
            ×
          </button>
        </div>
      )}

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* === TAB 1: READ & WRITE === */}
        {activeTab === 'readWrite' && (
          <div className="space-y-3">
            <button
              type="button"
              disabled={rwLoading}
              onClick={() => runReadWrite('ocr')}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {rwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {copy.readWrite.ocrBoard}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={toggleRecording}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium ${
                  isRecording
                    ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                <span className="truncate">
                  {isRecording ? copy.readWrite.stopRecording : copy.readWrite.voiceInput}
                </span>
              </button>

              <button
                type="button"
                disabled={rwLoading || !(rwResult || rwText).trim()}
                onClick={toggleReadAloud}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {isPlayingAudio ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                <span className="truncate">
                  {isPlayingAudio ? copy.readWrite.stopAudio : copy.readWrite.readAloud}
                </span>
              </button>
            </div>

            <div className="space-y-1.5">
              <textarea
                rows={4}
                value={rwText}
                onChange={(e) => setRwText(e.target.value)}
                placeholder={copy.readWrite.inputPlaceholder}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              {rwText.trim() && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onInsertText(rwText.trim())}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    <PlusCircle className="h-3 w-3" />
                    {copy.readWrite.addToBoard}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={rwLoading}
                onClick={() => runReadWrite('proofread')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {rwLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                {copy.readWrite.proofread}
              </button>
              <button
                type="button"
                disabled={rwLoading}
                onClick={() => runReadWrite('translate')}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {rwLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
                {copy.readWrite.translateKmEn}
              </button>
              <button
                type="button"
                disabled={rwLoading}
                onClick={() => runReadWrite('summarize')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {rwLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                {copy.readWrite.summarize}
              </button>
              <button
                type="button"
                disabled={rwLoading}
                onClick={() => runReadWrite('explain')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {rwLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                {copy.readWrite.explain}
              </button>
            </div>

            {rwResult && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {copy.readWrite.resultTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => onInsertText(rwResult)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    {copy.readWrite.addToBoard}
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {rwResult}
                </div>
              </div>
            )}
          </div>
        )}

        {/* === TAB 2: AI DRAWING === */}
        {activeTab === 'drawing' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <button
                type="button"
                disabled={drawLoading}
                onClick={handleBeautifyShapes}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {drawLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shapes className="h-4 w-4 text-blue-600" />}
                {copy.drawing.shapeRecognize}
              </button>
              {shapeNotice && (
                <p className="text-xs text-slate-600 dark:text-slate-400">{shapeNotice}</p>
              )}
            </div>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-800 space-y-3">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setDrawMode('text')}
                  className={`rounded-md py-1.5 text-xs font-medium ${
                    drawMode === 'text'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {copy.drawing.textToVector}
                </button>
                <button
                  type="button"
                  onClick={() => setDrawMode('sketch')}
                  className={`rounded-md py-1.5 text-xs font-medium ${
                    drawMode === 'sketch'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {copy.drawing.sketchToVector}
                </button>
              </div>

              <textarea
                rows={3}
                value={drawPrompt}
                onChange={(e) => setDrawPrompt(e.target.value)}
                placeholder={copy.drawing.promptPlaceholder}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              <button
                type="button"
                disabled={drawLoading || (drawMode === 'text' && !drawPrompt.trim())}
                onClick={handleGenerateVector}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {drawLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {copy.drawing.generateBtn}
              </button>

              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {copy.drawing.vectorNotice}
              </p>

              {drawPreview && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {drawPreview.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => onInsertImage(drawPreview.dataUrl, drawPreview.title)}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 shrink-0"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      {copy.drawing.insertBtn}
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800">
                    <img
                      src={drawPreview.dataUrl}
                      alt={drawPreview.title}
                      referrerPolicy="no-referrer"
                      className="mx-auto max-h-48 w-auto object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === TAB 3: AI AUTO 3D GENERATOR === */}
        {activeTab === 'gen3d' && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              {(['text', 'sketch', 'image'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setGen3dMode(m)}
                  className={`rounded-md py-1.5 text-[11px] font-medium ${
                    gen3dMode === m
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {m === 'text'
                    ? copy.gen3d.textTo3d
                    : m === 'sketch'
                      ? copy.gen3d.sketchTo3d
                      : copy.gen3d.imageTo3d}
                </button>
              ))}
            </div>

            {gen3dMode === 'image' && (
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-600 hover:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <Upload className="h-4 w-4" />
                  <span>{lang === 'km' ? 'ជ្រើសរើសរូបភាព 2D' : 'Upload 2D Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setGen3dImage(String(reader.result || ''));
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {gen3dImage && (
                  <img
                    src={gen3dImage}
                    alt="2D Reference"
                    referrerPolicy="no-referrer"
                    className="mx-auto max-h-28 rounded-lg border border-slate-200 object-contain dark:border-slate-800"
                  />
                )}
              </div>
            )}

            <textarea
              rows={3}
              value={gen3dPrompt}
              onChange={(e) => setGen3dPrompt(e.target.value)}
              placeholder={copy.gen3d.promptPlaceholder}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />

            <button
              type="button"
              disabled={gen3dLoading || (gen3dMode === 'text' && !gen3dPrompt.trim())}
              onClick={() => handleGenerate3D()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {gen3dLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
              {copy.gen3d.generateBtn}
            </button>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {copy.gen3d.presetsLabel}
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {copy.gen3d.presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={gen3dLoading}
                    onClick={() => {
                      setGen3dMode('text');
                      setGen3dPrompt(preset.prompt);
                      void handleGenerate3D(preset.prompt);
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {current3DModel && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {current3DModel.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {current3DModel.parts.length} parts · {current3DModel.category}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpen3DStudio}
                    className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 shrink-0"
                  >
                    {copy.gen3d.openStudio}
                  </button>
                </div>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {copy.gen3d.notice}
            </p>
          </div>
        )}

        {/* === TAB 4: AI CALCULATOR === */}
        {activeTab === 'calculator' && (
          <div className="space-y-3">
            <button
              type="button"
              disabled={calcLoading}
              onClick={() => handleSolveMath(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {calcLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4 text-blue-600" />}
              {copy.calc.solveFromBoard}
            </button>

            <input
              type="text"
              value={calcExpr}
              onChange={(e) => setCalcExpr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSolveMath(false);
              }}
              placeholder={copy.calc.placeholder}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />

            {/* Scientific Keypad */}
            <div className="grid grid-cols-5 gap-1.5">
              {calcKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (key === 'C') setCalcExpr('');
                    else if (key === '⌫') setCalcExpr((p) => p.slice(0, -1));
                    else setCalcExpr((p) => p + key);
                  }}
                  className="rounded-lg border border-slate-200 bg-white py-2 font-mono text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {key}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={calcLoading || !calcExpr.trim()}
              onClick={() => handleSolveMath(false)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {calcLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {copy.calc.solveBtn}
            </button>

            {calcSolution && (
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{calcSolution.topic}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onInsertText(
                        `${calcSolution.expression}\n= ${calcSolution.answer}\n\n${calcSolution.steps.join('\n')}`,
                      )
                    }
                    className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    {copy.calc.addToBoard}
                  </button>
                </div>
                <div className="rounded-lg bg-white p-2.5 font-mono text-sm font-semibold text-blue-700 dark:bg-slate-900 dark:text-blue-400">
                  {copy.calc.answer}: {calcSolution.answer}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {copy.calc.steps}
                  </p>
                  <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {calcSolution.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{calcSolution.explanation}</p>
              </div>
            )}
          </div>
        )}

        {/* === TAB 5: AI TUTOR === */}
        {activeTab === 'tutor' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {copy.tutor.subject}
                </label>
                <select
                  value={tutorSubject}
                  onChange={(e) => setTutorSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {copy.tutor.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {copy.tutor.level}
                </label>
                <select
                  value={tutorLevel}
                  onChange={(e) => setTutorLevel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {copy.tutor.levels.map((lv) => (
                    <option key={lv.id} value={lv.id}>
                      {lv.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={tutorLoading}
                onClick={handleTutorQuiz}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {copy.tutor.makeQuiz}
              </button>
              <button
                type="button"
                disabled={tutorLoading}
                onClick={handleTutorDiagram}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {copy.tutor.makeDiagram}
              </button>
            </div>

            {/* Interactive Quiz Section */}
            {tutorQuiz.length > 0 && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                {tutorQuiz.map((q, idx) => {
                  const chosen = tutorAnswers[q.id];
                  return (
                    <div key={q.id} className="space-y-1.5 border-b border-slate-200 pb-2.5 last:border-b-0 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {idx + 1}. {q.question}
                      </p>
                      <div className="space-y-1">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = chosen === optIdx;
                          const isCorrect = q.correctIndex === optIdx;
                          let cls =
                            'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
                          if (tutorGraded) {
                            if (isCorrect)
                              cls =
                                'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
                            else if (isSelected)
                              cls =
                                'border-red-400 bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300';
                          } else if (isSelected) {
                            cls =
                              'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300';
                          }
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              disabled={tutorGraded}
                              onClick={() => setTutorAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}
                              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs ${cls}`}
                            >
                              <span>{opt}</span>
                              {tutorGraded && isCorrect && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                              {tutorGraded && isSelected && !isCorrect && <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                            </button>
                          );
                        })}
                      </div>
                      {tutorGraded && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">{q.explanation}</p>
                      )}
                    </div>
                  );
                })}

                {!tutorGraded ? (
                  <button
                    type="button"
                    onClick={() => setTutorGraded(true)}
                    className="w-full rounded-lg bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    {copy.tutor.checkAnswers}
                  </button>
                ) : (
                  <div className="rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100 tabular-nums">
                    {copy.tutor.scoreLabel} {quizScore} / {tutorQuiz.length}
                  </div>
                )}
              </div>
            )}

            {/* Chat Feed */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {tutorMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl p-2.5 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'ml-6 bg-blue-600 text-white'
                      : 'mr-2 border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                  {msg.diagramSvg && (
                    <div className="mt-2 space-y-1.5">
                      <img
                        src={svgMarkupToDataUrl(msg.diagramSvg)}
                        alt="Lesson Diagram"
                        referrerPolicy="no-referrer"
                        className="w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => onInsertImage(svgMarkupToDataUrl(msg.diagramSvg!), 'Tutor Diagram')}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        <ImagePlus className="h-3 w-3" />
                        {copy.drawing.insertBtn}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {tutorLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>AI Tutor...</span>
                </div>
              )}
            </div>

            {/* Chat Composer */}
            <div className="space-y-2 border-t border-slate-200 pt-2.5 dark:border-slate-800">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={tutorIncludeBoard}
                  onChange={(e) => setTutorIncludeBoard(e.target.checked)}
                  className="rounded border-slate-300 accent-blue-600"
                />
                {copy.tutor.includeBoard}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tutorPrompt}
                  onChange={(e) => setTutorPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleTutorChat();
                  }}
                  placeholder={copy.tutor.askPlaceholder}
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={tutorLoading || !tutorPrompt.trim()}
                  onClick={handleTutorChat}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
