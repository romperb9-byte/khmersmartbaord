import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  ArrowRight,
  Axis3d,
  Box,
  Calculator,
  Circle,
  Compass,
  Download,
  Eraser,
  FolderKanban,
  Hand,
  HelpCircle,
  Highlighter,
  ImagePlus,
  Layers,
  LogIn,
  LogOut,
  Maximize,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  MousePointer2,
  Orbit,
  Palette,
  PanelLeft,
  PanelRight,
  Pen,
  Plus,
  Redo2,
  Ruler,
  Save,
  Shapes,
  Sparkles,
  Square,
  Sun,
  Trash2,
  TrendingUp,
  Triangle,
  Type as TypeIcon,
  Undo2,
  Volume2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { auth } from './firebase';
import {
  deleteBoardFromFirestore,
  loadBoardPages,
  saveBoardToFirestore,
  subscribeUserBoards,
  upsertUserProfile,
} from './services/firestoreService';
import { solveMathRegionAI } from './services/aiClient';
import type {
  BackgroundStyle,
  BoardSurfaceTheme,
  CanvasItem,
  DetectedEquationResult,
  DetectedShapeInfo,
  ImageItem,
  Language,
  Model3DBlueprint,
  Quick3DShapeMode,
  TextItem,
  ThemeMode,
  ToolType,
  WhiteboardPageData,
  WhiteboardProjectMeta,
} from './types/whiteboard';
import { t } from './i18n/translations';
import {
  MathRegionBox,
  WhiteboardCanvas,
  WhiteboardCanvasHandle,
} from './components/WhiteboardCanvas';
import { ThreeDViewport } from './components/ThreeDViewport';
import { AITabId, RightAIPanel } from './components/RightAIPanel';
import { AuthModal } from './components/AuthModal';
import { ProjectsModal } from './components/ProjectsModal';
import { GuideModal } from './components/GuideModal';
import { GraphSpaceModal } from './components/GraphSpaceModal';
import { ClassroomToolsModal } from './components/ClassroomToolsModal';
import {
  EquationActionBar,
  InteractiveAxesWidget,
  MathRulerWidget,
  ScreenShadeOverlay,
} from './components/ClassroomWidgets';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  BOARD_HEIGHT,
  BOARD_SURFACE_CONFIG,
  BOARD_WIDTH,
  exportBoardAsPdf,
  generateFunctionGraphDataUrl,
  renderPageToDataUrl,
  triggerDownload,
} from './utils/exportUtils';

const COLOR_SWATCHES = [
  '#FFFFFF',
  '#FDE047',
  '#38BDF8',
  '#4ADE80',
  '#FB7185',
  '#0F172A',
  '#2563EB',
  '#7C3AED',
];

const SURFACE_THEMES: BoardSurfaceTheme[] = ['chalkboard', 'whiteboard', 'blackboard'];

function createDefaultPage(index = 0): WhiteboardPageData {
  return {
    id: `page_${Date.now()}_${index}`,
    pageIndex: index,
    title: `Page ${index + 1}`,
    items: [],
  };
}

const LOCAL_DRAFT_KEY = 'smart_ai_whiteboard_draft_v1';

function WhiteboardWorkspace() {
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('wb_lang') as Language) || 'km';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('wb_theme') as ThemeMode) || 'light';
  });
  const [boardSurface, setBoardSurface] = useState<BoardSurfaceTheme>(() => {
    return (localStorage.getItem('wb_surface') as BoardSurfaceTheme) || 'chalkboard';
  });
  const copy = t(lang);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('wb_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('wb_lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('wb_surface', boardSurface);
  }, [boardSurface]);

  // Auth & Cloud State
  const [user, setUser] = useState<User | null>(null);
  const [boards, setBoards] = useState<WhiteboardProjectMeta[]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'local'>('local');

  // Active Board State
  const [boardId, setBoardId] = useState<string>(() => `board_${Date.now()}`);
  const [boardTitle, setBoardTitle] = useState<string>(copy.untitledBoard);
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('dots');
  const [pages, setPages] = useState<WhiteboardPageData[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
          return parsed.pages;
        }
      }
    } catch {
      // ignore corrupt draft
    }
    return [createDefaultPage(0)];
  });
  const [activePageIdx, setActivePageIdx] = useState(0);

  // Undo / Redo Stacks
  const [undoStack, setUndoStack] = useState<WhiteboardPageData[][]>([]);
  const [redoStack, setRedoStack] = useState<WhiteboardPageData[][]>([]);

  // Canvas & Tool State
  const [centerView, setCenterView] = useState<'2d' | '3d'>('2d');
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [activeColor, setActiveColor] = useState<string>(
    BOARD_SURFACE_CONFIG[boardSurface].defaultPen,
  );
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [zoom, setZoom] = useState<number>(0.75);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Classroom Smart Features State
  const [autoShapeEnabled, setAutoShapeEnabled] = useState(true);
  const [aiMathEnabled, setAiMathEnabled] = useState(true);
  const [aiMathBusy, setAiMathBusy] = useState(false);
  const [aiMathStatus, setAiMathStatus] = useState<string | null>(null);
  const [auto3DModeEnabled, setAuto3DModeEnabled] = useState(false);
  const [spotlightEnabled, setSpotlightEnabled] = useState(false);
  const [rulerVisible, setRulerVisible] = useState(false);
  const [shadeVisible, setShadeVisible] = useState(false);
  const [axesWidget, setAxesWidget] = useState<{
    mode: 'axes2d' | 'axes3d';
    pos?: { x: number; y: number };
  } | null>(null);
  const [detectedEquation, setDetectedEquation] = useState<DetectedEquationResult | null>(null);
  const [lastDetectedShape, setLastDetectedShape] = useState<DetectedShapeInfo | null>(null);

  // 3D Studio & AI Panel State
  const [aiTab, setAiTab] = useState<AITabId>('readWrite');
  const [current3DModel, setCurrent3DModel] = useState<Model3DBlueprint | null>(null);
  const [quick3DMode, setQuick3DMode] = useState<Quick3DShapeMode>('blueprint');
  const [hologramImageUrl, setHologramImageUrl] = useState<string | null>(null);
  const [equationPlotFn, setEquationPlotFn] = useState<string | null>(null);

  // Responsive Drawers & Modals
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const prevDrawersRef = useRef<{ left: boolean; right: boolean }>({ left: true, right: true });
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [projectsModalOpen, setProjectsModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [graphModalOpen, setGraphModalOpen] = useState(false);
  const [toolsModalOpen, setToolsModalOpen] = useState(false);

  const canvasRef = useRef<WhiteboardCanvasHandle | null>(null);
  const viewportAreaRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const enterFullscreen = useCallback(async () => {
    prevDrawersRef.current = { left: leftOpen, right: rightOpen };
    setLeftOpen(false);
    setRightOpen(false);
    setIsFullscreen(true);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Browser/iFrame may restrict native fullscreen API; UI zen-fullscreen still fills 100vw x 100vh
    }
  }, [leftOpen, rightOpen]);

  const exitFullscreen = useCallback(async () => {
    setIsFullscreen(false);
    setLeftOpen(prevDrawersRef.current.left);
    setRightOpen(prevDrawersRef.current.right);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      void exitFullscreen();
    } else {
      void enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen, isFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        // Keep sync when user presses browser Esc to leave native fullscreen
        setIsFullscreen(false);
        setLeftOpen(prevDrawersRef.current.left);
        setRightOpen(prevDrawersRef.current.right);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        isFullscreen &&
        !document.fullscreenElement &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'INPUT'
      ) {
        void exitFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [exitFullscreen, isFullscreen]);

  const speakBrowser = useCallback(
    (text: string) => {
      if (!('speechSynthesis' in window) || !text.trim()) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang === 'km' ? 'km-KH' : 'en-US';
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    },
    [lang],
  );

  const cycleBoardSurface = () => {
    const idx = SURFACE_THEMES.indexOf(boardSurface);
    const next = SURFACE_THEMES[(idx + 1) % SURFACE_THEMES.length];
    setBoardSurface(next);
    setActiveColor(BOARD_SURFACE_CONFIG[next].defaultPen);
    showToast(copy.boardThemes[next]);
  };

  // Listen to Firebase Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser && nextUser.emailVerified) {
        try {
          await upsertUserProfile(nextUser, lang, theme);
        } catch (err) {
          console.warn('Profile sync warning:', err);
        }
      }
    });
    return () => unsub();
  }, [lang, theme]);

  // Subscribe to user's saved whiteboards when verified
  useEffect(() => {
    if (!user || !user.emailVerified) {
      setBoards([]);
      return;
    }
    const unsub = subscribeUserBoards(
      user.uid,
      (list) => setBoards(list),
      (err) => console.error('Boards list error:', err),
    );
    return () => unsub();
  }, [user]);

  const currentPage = pages[activePageIdx] || pages[0];

  // Save local draft immediately
  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_DRAFT_KEY,
        JSON.stringify({ boardId, boardTitle, backgroundStyle, pages }),
      );
    } catch {
      // quota exceeded on huge image drafts
    }
  }, [backgroundStyle, boardId, boardTitle, pages]);

  // Cloud Save (Manual & Debounced Auto-Save)
  const performCloudSave = useCallback(async () => {
    if (!user || !user.emailVerified) {
      setSaveState('local');
      return;
    }
    setSaveState('saving');
    try {
      let thumb: string | undefined;
      if (pages[0]) {
        thumb = await renderPageToDataUrl(
          pages[0],
          backgroundStyle,
          theme,
          'image/jpeg',
          0.28,
          boardSurface,
        );
      }
      await saveBoardToFirestore({
        boardId,
        ownerId: user.uid,
        title: boardTitle,
        backgroundStyle,
        pages,
        thumbnailDataUrl: thumb,
      });
      setSaveState('saved');
    } catch (err) {
      console.error('Auto-save failed:', err);
      setSaveState('local');
    }
  }, [backgroundStyle, boardId, boardSurface, boardTitle, pages, theme, user]);

  useEffect(() => {
    if (!user || !user.emailVerified) {
      setSaveState('local');
      return;
    }
    const timer = window.setTimeout(() => {
      void performCloudSave();
    }, 1800);
    return () => clearTimeout(timer);
  }, [performCloudSave, user]);

  const pushUndo = useCallback((snapshotPages: WhiteboardPageData[]) => {
    setUndoStack((prev) => [...prev.slice(-30), structuredClone(snapshotPages)]);
    setRedoStack([]);
  }, []);

  const handleChangePageItems = useCallback(
    (nextItems: CanvasItem[], commitHistory = true) => {
      if (commitHistory) {
        pushUndo(pages);
      }
      setPages((prev) =>
        prev.map((p, idx) => (idx === activePageIdx ? { ...p, items: nextItems } : p)),
      );
    },
    [activePageIdx, pages, pushUndo],
  );

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, structuredClone(pages)]);
    setUndoStack((prev) => prev.slice(0, -1));
    setPages(previous);
    if (activePageIdx >= previous.length) {
      setActivePageIdx(Math.max(0, previous.length - 1));
    }
    setSelectedId(null);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, structuredClone(pages)]);
    setRedoStack((prev) => prev.slice(0, -1));
    setPages(next);
    if (activePageIdx >= next.length) {
      setActivePageIdx(Math.max(0, next.length - 1));
    }
    setSelectedId(null);
  };

  const handleAddPage = () => {
    pushUndo(pages);
    const nextIdx = pages.length;
    setPages((prev) => [...prev, createDefaultPage(nextIdx)]);
    setActivePageIdx(nextIdx);
    setSelectedId(null);
  };

  const handleDeletePage = () => {
    if (pages.length <= 1) {
      pushUndo(pages);
      setPages([createDefaultPage(0)]);
      setActivePageIdx(0);
      return;
    }
    pushUndo(pages);
    const filtered = pages
      .filter((_, idx) => idx !== activePageIdx)
      .map((p, idx) => ({ ...p, pageIndex: idx }));
    setPages(filtered);
    setActivePageIdx(Math.max(0, activePageIdx - 1));
    setSelectedId(null);
  };

  const handleClearPage = () => {
    if (currentPage.items.length === 0) return;
    pushUndo(pages);
    setPages((prev) =>
      prev.map((p, idx) => (idx === activePageIdx ? { ...p, items: [] } : p)),
    );
    setSelectedId(null);
  };

  const handleInsertTextToBoard = (text: string, atPos?: { x: number; y: number }, customColor?: string, fontSizeOverride?: number) => {
    const lines = text.split('\n');
    const fontSize = fontSizeOverride || 24;
    const newItem: TextItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'text',
      x: atPos ? atPos.x : 120 + (currentPage.items.length % 5) * 24,
      y: atPos ? atPos.y : 100 + (currentPage.items.length % 5) * 24,
      width: Math.min(900, Math.max(120, Math.max(...lines.map((l) => l.length)) * fontSize * 0.65)),
      height: Math.max(38, lines.length * fontSize * 1.4),
      color: customColor || BOARD_SURFACE_CONFIG[boardSurface].defaultPen,
      strokeWidth: 2,
      text,
      fontSize,
      fontWeight: 'bold',
    };
    setCenterView('2d');
    handleChangePageItems([...currentPage.items, newItem], true);
    if (!atPos) {
      setActiveTool('select');
      setSelectedId(newItem.id);
    }
  };

  const handleInsertImageToBoard = (dataUrl: string, label?: string) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 480;
      const ratio = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
      const w = Math.max(120, Math.round(img.naturalWidth * ratio));
      const h = Math.max(90, Math.round(img.naturalHeight * ratio));

      const item: ImageItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'image',
        x: Math.round((BOARD_WIDTH - w) / 2),
        y: Math.round((BOARD_HEIGHT - h) / 2),
        width: w,
        height: h,
        color: activeColor,
        strokeWidth: 1,
        dataUrl,
        label,
      };
      setCenterView('2d');
      handleChangePageItems([...currentPage.items, item], true);
      setActiveTool('select');
      setSelectedId(item.id);
    };
    img.src = dataUrl;
  };

  const handleUploadImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const tempImg = new Image();
      tempImg.onload = () => {
        // Preserve ultra-crisp resolution up to 2560px so zooming in never blurs uploaded images
        const maxSide = 2560;
        if (tempImg.naturalWidth <= maxSide && tempImg.naturalHeight <= maxSide && file.size <= 3_500_000) {
          handleInsertImageToBoard(rawDataUrl, file.name);
          return;
        }
        const scale = Math.min(maxSide / tempImg.naturalWidth, maxSide / tempImg.naturalHeight, 1);
        const c = document.createElement('canvas');
        c.width = Math.round(tempImg.naturalWidth * scale);
        c.height = Math.round(tempImg.naturalHeight * scale);
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(tempImg, 0, 0, c.width, c.height);
          const isPngLike = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/svg+xml';
          const outUrl = isPngLike ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.95);
          handleInsertImageToBoard(outUrl, file.name);
        }
      };
      tempImg.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTriggerMathRegionSolve = useCallback(
    async (region: MathRegionBox, imageBase64: string) => {
      if (aiMathBusy || !imageBase64) return;
      setAiMathBusy(true);
      setAiMathStatus(lang === 'km' ? 'កំពុងវិភាគ...' : 'Solving...');
      try {
        const res = await solveMathRegionAI({ imageBase64, lang });
        if (res && res.answer && res.answer !== 'unknown') {
          const finalOut =
            res.displayAnswer ||
            (res.fraction ? `${res.fraction} (${res.answer})` : String(res.answer));
          const drawX = Math.min(BOARD_WIDTH - 180, region.eqRightX + 16);
          const drawY = Math.max(24, region.eqCenterY - (region.digitHeight || 34) * 0.5);
          const ansColor = boardSurface === 'whiteboard' ? '#059669' : '#4ade80';
          const fontSize = Math.round((region.digitHeight || 34) * 0.95);

          handleInsertTextToBoard(finalOut, { x: drawX, y: drawY }, ansColor, fontSize);
          setAiMathStatus(`${res.expression} → ${finalOut}`);
          showToast(`${res.expression} → ${finalOut}`);

          if (res.isEquationOrFunction || /[xy]/i.test(res.expression || '')) {
            setDetectedEquation(res);
          }

          const speakStr = res.fraction
            ? lang === 'km'
              ? `ចម្លើយគឺ ប្រភាគ ${res.fraction.replace('/', ' ភាគ ')}`
              : `Answer is ${res.fraction}`
            : lang === 'km'
              ? `ចម្លើយគឺ ${finalOut}`
              : `Answer is ${finalOut}`;
          speakBrowser(speakStr);
        } else {
          setAiMathStatus(lang === 'km' ? 'មិនអាចអានលេខបានច្បាស់' : 'Could not read expression');
          showToast(
            lang === 'km'
              ? 'AI មិនអាចស្គាល់កន្សោមលេខបានច្បាស់ សូមសរសេរឱ្យច្បាស់ជាងមុន'
              : 'Could not recognize math clearly. Try writing a bit larger.',
          );
        }
      } catch (err) {
        setAiMathStatus(null);
        showToast(err instanceof Error ? err.message : 'AI Math failed');
      } finally {
        setAiMathBusy(false);
      }
    },
    [aiMathBusy, boardSurface, handleInsertTextToBoard, lang, showToast, speakBrowser],
  );

  const handlePlotEquationGraph = (fnExpr: string) => {
    try {
      const dataUrl = generateFunctionGraphDataUrl(fnExpr, true, boardSurface);
      if (dataUrl) {
        handleInsertImageToBoard(dataUrl, `y = ${fnExpr}`);
        setDetectedEquation(null);
        showToast(`y = ${fnExpr}`);
      }
    } catch {
      showToast(copy.graphModal.invalidFormula);
    }
  };

  const handleShowEquation3D = (eq: DetectedEquationResult) => {
    setDetectedEquation(null);
    if (eq.plottableFn && eq.plottableFn.trim()) {
      setEquationPlotFn(eq.plottableFn);
      setQuick3DMode('revolve');
      setCenterView('3d');
      return;
    }
    const sug = (eq.suggested3D || 'cylinder') as Quick3DShapeMode;
    setEquationPlotFn(null);
    setQuick3DMode(
      ['cube', 'sphere', 'cylinder', 'cone', 'pyramid', 'revolve', 'extrude'].includes(sug)
        ? sug
        : 'cylinder',
    );
    setCenterView('3d');
  };

  const handleReadBoardAloud = () => {
    const summary = aiMathStatus
      ? lang === 'km'
        ? `លទ្ធផលគណនាចុងក្រោយគឺ ${aiMathStatus}`
        : `Last calculation result is ${aiMathStatus}`
      : lastDetectedShape
        ? lang === 'km'
          ? `រាងចុងក្រោយលើក្ដាខៀនគឺ ${lastDetectedShape.label}`
          : `Last shape on board is ${lastDetectedShape.label}`
        : lang === 'km'
          ? 'ក្ដារខៀនឆ្លាតវៃរួចរាល់'
          : 'Smart AI Whiteboard is ready';
    showToast(summary);
    speakBrowser(summary);
  };

  const handleExport = async (format: 'png' | 'jpg' | 'pdf') => {
    setExportMenuOpen(false);
    const safeName = (boardTitle || 'whiteboard').replace(/[^a-zA-Z0-9_\-\u1780-\u17FF]+/g, '_');
    if (format === 'pdf') {
      await exportBoardAsPdf(pages, backgroundStyle, theme, boardTitle, boardSurface);
      return;
    }
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = await renderPageToDataUrl(
      currentPage,
      backgroundStyle,
      theme,
      mime,
      1.5,
      boardSurface,
    );
    triggerDownload(dataUrl, `${safeName}_page${activePageIdx + 1}.${format}`);
  };

  const handleCreateNewBoard = (title: string) => {
    setBoardId(`board_${Date.now()}`);
    setBoardTitle(title);
    setPages([createDefaultPage(0)]);
    setActivePageIdx(0);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
  };

  const handleOpenCloudBoard = async (meta: WhiteboardProjectMeta) => {
    if (!user) return;
    const loadedPages = await loadBoardPages(meta.id, user.uid);
    setBoardId(meta.id);
    setBoardTitle(meta.title);
    setBackgroundStyle(meta.backgroundStyle);
    setPages(loadedPages.length > 0 ? loadedPages : [createDefaultPage(0)]);
    setActivePageIdx(0);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
  };

  const handleDeleteCloudBoard = async (targetId: string) => {
    if (!user) return;
    await deleteBoardFromFirestore(targetId, user.uid);
    if (targetId === boardId) {
      handleCreateNewBoard(copy.untitledBoard);
    }
  };

  const getBoardPngBase64 = useCallback(() => {
    return canvasRef.current?.getBoardPngBase64() || '';
  }, []);

  const toolButtons: Array<{ id: ToolType; label: string; icon: React.ReactNode }> = [
    { id: 'select', label: copy.tools.select, icon: <MousePointer2 className="h-4 w-4" /> },
    { id: 'pan', label: copy.tools.pan, icon: <Hand className="h-4 w-4" /> },
    { id: 'pen', label: copy.tools.pen, icon: <Pen className="h-4 w-4" /> },
    { id: 'highlighter', label: copy.tools.highlighter, icon: <Highlighter className="h-4 w-4" /> },
    { id: 'eraser', label: copy.tools.eraser, icon: <Eraser className="h-4 w-4" /> },
    { id: 'laser', label: copy.tools.laser, icon: <Wand2 className="h-4 w-4 text-rose-500" /> },
    { id: 'smart_shape', label: copy.tools.smart_shape, icon: <Sparkles className="h-4 w-4" /> },
    { id: 'line', label: copy.tools.line, icon: <Minus className="h-4 w-4" /> },
    { id: 'rect', label: copy.tools.rect, icon: <Square className="h-4 w-4" /> },
    { id: 'circle', label: copy.tools.circle, icon: <Circle className="h-4 w-4" /> },
    { id: 'triangle', label: copy.tools.triangle, icon: <Triangle className="h-4 w-4" /> },
    { id: 'arrow', label: copy.tools.arrow, icon: <ArrowRight className="h-4 w-4" /> },
    { id: 'axes2d', label: copy.tools.axes2d, icon: <Compass className="h-4 w-4 text-cyan-500" /> },
    { id: 'axes3d', label: copy.tools.axes3d, icon: <Axis3d className="h-4 w-4 text-sky-500" /> },
    { id: 'text', label: copy.tools.text, icon: <TypeIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* === TOP HEADER (Hidden in Fullscreen Mode) === */}
      {!isFullscreen && (
        <header className="z-30 flex h-13 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900">
          {/* Left: Drawer Toggle, Brand, Project Title & Save Status */}
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setLeftOpen((v) => !v)}
              title="Toggle tools"
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <PanelLeft className="h-4 w-4" />
            </button>

          <span className="hidden whitespace-nowrap font-display text-sm font-bold tracking-tight text-slate-900 dark:text-white sm:inline-block shrink-0">
            {copy.appName}
          </span>

          <input
            type="text"
            value={boardTitle}
            onChange={(e) => setBoardTitle(e.target.value)}
            aria-label="Project title"
            className="w-28 truncate rounded-lg border border-transparent bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-900 outline-none hover:border-slate-300 focus:border-blue-500 focus:bg-white dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-950 sm:w-40"
          />

          <span className="hidden whitespace-nowrap text-xs text-slate-500 tabular-nums dark:text-slate-400 xl:inline-block">
            {saveState === 'saving'
              ? copy.saving
              : saveState === 'saved'
                ? copy.saved
                : copy.localMode}{' '}
            · {pages.length}p
          </span>
        </div>

        {/* Center: 2D Board vs 3D Studio Switcher */}
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
          <button
            type="button"
            onClick={() => setCenterView('2d')}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              centerView === '2d'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            {copy.board2d}
          </button>
          <button
            type="button"
            onClick={() => setCenterView('3d')}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              centerView === '3d'
                ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
          >
            <Box className="h-3.5 w-3.5" />
            {copy.studio3d}
          </button>
        </div>

        {/* Right: Fullscreen, Read Aloud, Undo, Redo, Save, Export, Projects, Guide, Lang, Theme, Auth */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={toggleFullscreen}
            title={copy.fullscreen}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
          >
            <Maximize className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{copy.fullscreen}</span>
          </button>

          <button
            type="button"
            onClick={handleReadBoardAloud}
            title={copy.classroomBar.readAloud}
            className="hidden rounded-lg border border-slate-200 p-1.5 text-sky-600 hover:bg-slate-100 dark:border-slate-700 dark:text-sky-400 dark:hover:bg-slate-800 sm:inline-flex"
          >
            <Volume2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title={copy.undo}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title={copy.redo}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Redo2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (!user) setAuthModalOpen(true);
              else void performCloudSave();
            }}
            title={copy.save}
            className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 md:inline-flex"
          >
            <Save className="h-3.5 w-3.5" />
            {copy.save}
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportMenuOpen((v) => !v)}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{copy.export}</span>
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full z-40 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => void handleExport('png')}
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {copy.exportPng}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('jpg')}
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {copy.exportJpg}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('pdf')}
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {copy.exportPdf}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setProjectsModalOpen(true)}
            title={copy.projects}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">{copy.projects}</span>
          </button>

          <button
            type="button"
            onClick={() => setGuideModalOpen(true)}
            title={copy.guide}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setLang((l) => (l === 'km' ? 'en' : 'km'))}
            className="shrink-0 whitespace-nowrap rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {lang === 'km' ? 'EN' : 'ខ្មែរ'}
          </button>

          <button
            type="button"
            onClick={() => setTheme((m) => (m === 'light' ? 'dark' : 'light'))}
            title="Toggle Light / Dark UI"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {user ? (
            <button
              type="button"
              onClick={() => signOut(auth)}
              title={`${user.displayName || user.email} — ${copy.signOut}`}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <span className="hidden max-w-[96px] truncate lg:inline">
                {user.displayName || user.email?.split('@')[0]}
              </span>
              <LogOut className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{copy.signIn}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setRightOpen((v) => !v)}
            title="Toggle AI Assistant"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </header>
      )}

      {/* === SMART CLASSROOM QUICK ACTION BAR === */}
      {!isFullscreen && centerView === '2d' && (
        <div className="z-20 flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-900 px-3 py-1.5 text-white dark:border-slate-800">
          {/* Board Surface Theme (Green Chalkboard / Whiteboard / Blackboard) */}
          <button
            type="button"
            onClick={cycleBoardSurface}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium hover:bg-slate-700"
          >
            <Palette className="h-3.5 w-3.5 text-emerald-400" />
            <span>{copy.boardThemes[boardSurface]}</span>
          </button>

          {/* Auto Shape Toggle */}
          <button
            type="button"
            onClick={() => setAutoShapeEnabled((v) => !v)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
              autoShapeEnabled
                ? 'border-emerald-500/60 bg-emerald-600/25 text-emerald-300'
                : 'border-slate-700 bg-slate-800 text-slate-400 opacity-75'
            }`}
          >
            <Shapes className="h-3.5 w-3.5" />
            <span>
              {autoShapeEnabled ? copy.classroomBar.autoShapeOn : copy.classroomBar.autoShapeOff}
            </span>
          </button>

          {/* AI Math (=) Toggle */}
          <button
            type="button"
            onClick={() => setAiMathEnabled((v) => !v)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
              aiMathEnabled
                ? 'border-violet-500/60 bg-violet-600/30 text-violet-200'
                : 'border-slate-700 bg-slate-800 text-slate-400 opacity-75'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-violet-300" />
            <span>{aiMathEnabled ? copy.classroomBar.aiMathOn : copy.classroomBar.aiMathOff}</span>
          </button>

          {/* Solve Math Now */}
          <button
            type="button"
            disabled={aiMathBusy}
            onClick={() => canvasRef.current?.triggerSolveRecentMath()}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-violet-600 px-2.5 py-1 text-xs font-bold text-white shadow hover:bg-violet-500 disabled:opacity-60"
          >
            <Calculator className="h-3.5 w-3.5" />
            <span>{copy.classroomBar.solveNow}</span>
          </button>

          {/* Graph, Axes & 3D Solids Modal */}
          <button
            type="button"
            onClick={() => setGraphModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-cyan-500/60 bg-cyan-600/30 px-2.5 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-600/45"
          >
            <TrendingUp className="h-3.5 w-3.5 text-cyan-300" />
            <span>{copy.classroomBar.graphAxes}</span>
          </button>

          {/* 3D Auto Toggle */}
          <button
            type="button"
            onClick={() => setAuto3DModeEnabled((v) => !v)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
              auto3DModeEnabled
                ? 'border-amber-400 bg-amber-600/30 text-amber-200'
                : 'border-slate-700 bg-slate-800 text-slate-300'
            }`}
          >
            <Box className="h-3.5 w-3.5 text-amber-400" />
            <span>
              {auto3DModeEnabled ? copy.classroomBar.auto3dOn : copy.classroomBar.auto3dOff}
            </span>
          </button>

          {/* Show Last Drawn Shape in 3D */}
          <button
            type="button"
            onClick={() => {
              setQuick3DMode('extrude');
              setCenterView('3d');
            }}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-amber-600 px-2.5 py-1 text-xs font-bold text-white shadow hover:bg-amber-500"
          >
            <Orbit className="h-3.5 w-3.5" />
            <span>{copy.classroomBar.show3d}</span>
          </button>

          {/* Classroom Teaching Tools */}
          <button
            type="button"
            onClick={() => setToolsModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium hover:bg-slate-700"
          >
            <Ruler className="h-3.5 w-3.5 text-rose-400" />
            <span>{copy.classroomBar.toolsModal}</span>
          </button>
        </div>
      )}

      {/* === MAIN WORKSPACE === */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* LEFT SIDEBAR: TOOLS (Floating drawer in Fullscreen mode) */}
        {leftOpen && (
          <aside
            className={`z-30 flex w-60 shrink-0 flex-col justify-between overflow-y-auto border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 ${
              isFullscreen
                ? 'absolute inset-y-0 left-0 shadow-2xl'
                : 'max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:shadow-xl'
            }`}
          >
            <div className="space-y-4">
              {/* Drawing & Selection Tools */}
              <div className="grid grid-cols-2 gap-1.5">
                {toolButtons.map((tool) => {
                  const active = activeTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => {
                        setActiveTool(tool.id);
                        setCenterView('2d');
                      }}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="shrink-0">{tool.icon}</span>
                      <span className="truncate">{tool.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Upload Image Button */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadImageFile}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                >
                  <ImagePlus className="h-4 w-4" />
                  <span>{copy.tools.image}</span>
                </button>
              </div>

              {/* Chalk / Marker Color Swatches */}
              <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                  <span>{copy.color}</span>
                  <input
                    type="color"
                    value={activeColor}
                    onChange={(e) => setActiveColor(e.target.value)}
                    className="h-6 w-8 cursor-pointer rounded border border-slate-200 bg-transparent p-0 dark:border-slate-700"
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setActiveColor(swatch)}
                      aria-label={`Color ${swatch}`}
                      style={{ backgroundColor: swatch }}
                      className={`h-7 rounded-lg border transition-transform ${
                        activeColor.toLowerCase() === swatch.toLowerCase()
                          ? 'scale-105 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Stroke Width */}
              <div className="space-y-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>{copy.strokeWidth}</span>
                  <span className="font-mono tabular-nums">{strokeWidth}px</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={22}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              {/* Canvas Background Pattern */}
              <div className="space-y-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-1.5">
                  {(['plain', 'dots', 'grid', 'ruled'] as const).map((bg) => (
                    <button
                      key={bg}
                      type="button"
                      onClick={() => setBackgroundStyle(bg)}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium ${
                        backgroundStyle === bg
                          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {copy.bg[bg]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClearPage}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {copy.clearPage}
            </button>
          </aside>
        )}

        {/* CENTER VIEWPORT: 2D WHITEBOARD OR 3D STUDIO */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div ref={viewportAreaRef} className="relative min-h-0 flex-1">
            {centerView === '2d' ? (
              <>
                <WhiteboardCanvas
                  ref={canvasRef}
                  items={currentPage.items}
                  onChangeItems={handleChangePageItems}
                  activeTool={activeTool}
                  activeColor={activeColor}
                  strokeWidth={strokeWidth}
                  backgroundStyle={backgroundStyle}
                  boardTheme={boardSurface}
                  theme={theme}
                  lang={lang}
                  zoom={zoom}
                  onChangeZoom={setZoom}
                  isFullscreen={isFullscreen}
                  selectedId={selectedId}
                  onSelectId={setSelectedId}
                  autoShapeEnabled={autoShapeEnabled}
                  aiMathEnabled={aiMathEnabled}
                  spotlightEnabled={spotlightEnabled}
                  onShapeRecognized={(label, info) => {
                    showToast(`Auto-Shape: ${label}`);
                    if (info) setLastDetectedShape(info);
                    if (auto3DModeEnabled && label !== 'line') {
                      window.setTimeout(() => {
                        setQuick3DMode('extrude');
                        setCenterView('3d');
                      }, 220);
                    }
                  }}
                  onLastShapeChange={(info) => setLastDetectedShape(info)}
                  onTriggerMathRegionSolve={(region, imgBase64) => {
                    void handleTriggerMathRegionSolve(region, imgBase64);
                  }}
                  onOpenInteractiveAxes={(mode, pos) => setAxesWidget({ mode, pos })}
                  onSendTo3DStudio={(mode, info, holoUrl) => {
                    setLastDetectedShape(info);
                    if (holoUrl) setHologramImageUrl(holoUrl);
                    setEquationPlotFn(null);
                    setQuick3DMode(mode);
                    setCenterView('3d');
                  }}
                />

                {/* Classroom Interactive Overlays */}
                {shadeVisible && (
                  <ScreenShadeOverlay
                    lang={lang}
                    containerRef={viewportAreaRef}
                    onClose={() => setShadeVisible(false)}
                  />
                )}

                {rulerVisible && (
                  <MathRulerWidget lang={lang} onClose={() => setRulerVisible(false)} />
                )}

                {axesWidget && (
                  <InteractiveAxesWidget
                    mode={axesWidget.mode}
                    boardTheme={boardSurface}
                    lang={lang}
                    initialPos={axesWidget.pos}
                    onStampToBoard={(dataUrl, mode) => {
                      handleInsertImageToBoard(
                        dataUrl,
                        mode === 'axes2d' ? '(Oxy)' : '(Oxyz 3D)',
                      );
                      setAxesWidget(null);
                    }}
                    onOpenIn3D={(dataUrl) => {
                      setHologramImageUrl(dataUrl);
                      setAxesWidget(null);
                      setQuick3DMode('hologram');
                      setCenterView('3d');
                    }}
                    onClose={() => setAxesWidget(null)}
                  />
                )}

                {detectedEquation && (
                  <EquationActionBar
                    equation={detectedEquation}
                    lang={lang}
                    onPlotGraph={handlePlotEquationGraph}
                    onShow3D={handleShowEquation3D}
                    onClose={() => setDetectedEquation(null)}
                  />
                )}

                {/* Bottom-Right AI Math & Last Shape Status Badge */}
                {!isFullscreen && (
                  <div className="pointer-events-none absolute bottom-3 right-3 z-10 hidden items-center gap-2 rounded-full border border-white/15 bg-slate-900/75 px-3 py-1 text-[11px] text-white backdrop-blur-md sm:flex">
                    <span className="font-medium text-violet-300">
                      {aiMathStatus ||
                        (aiMathEnabled ? copy.classroomBar.aiMathOn : copy.classroomBar.aiMathOff)}
                    </span>
                    <span className="text-white/30">|</span>
                    <span>
                      {copy.classroomBar.lastShape}{' '}
                      {lastDetectedShape?.label || copy.classroomBar.noShapeYet}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <ThreeDViewport
                blueprint={current3DModel}
                quickMode={quick3DMode}
                onChangeQuickMode={setQuick3DMode}
                detectedShape={lastDetectedShape}
                hologramImageUrl={hologramImageUrl}
                equationPlotFn={equationPlotFn}
                onUpdateBlueprint={(next) => setCurrent3DModel(next)}
                onSnapshotToBoard={(dataUrl, title) => handleInsertImageToBoard(dataUrl, title)}
                theme={theme}
                lang={lang}
              />
            )}

            {toastMsg && (
              <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full border border-emerald-500/60 bg-slate-900/95 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md">
                {toastMsg}
              </div>
            )}

            {/* === FULLSCREEN FLOATING HUD CONTROLS === */}
            {isFullscreen && (
              <>
                {/* Top-Left Floating Quick Toolbar */}
                <div className="absolute left-3 top-3 z-30 flex max-w-[calc(100vw-200px)] flex-wrap items-center gap-1 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-1.5 text-white shadow-xl backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setLeftOpen((v) => !v)}
                    title={copy.tools.select}
                    className={`rounded-xl p-1.5 transition ${
                      leftOpen ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </button>
                  <div className="mx-0.5 h-5 w-px bg-slate-700" />
                  {(
                    [
                      { id: 'select', label: copy.tools.select, icon: <MousePointer2 className="h-4 w-4" /> },
                      { id: 'pan', label: copy.tools.pan, icon: <Hand className="h-4 w-4" /> },
                      { id: 'pen', label: copy.tools.pen, icon: <Pen className="h-4 w-4" /> },
                      { id: 'highlighter', label: copy.tools.highlighter, icon: <Highlighter className="h-4 w-4" /> },
                      { id: 'eraser', label: copy.tools.eraser, icon: <Eraser className="h-4 w-4" /> },
                      { id: 'laser', label: copy.tools.laser, icon: <Wand2 className="h-4 w-4 text-rose-400" /> },
                      { id: 'text', label: copy.tools.text, icon: <TypeIcon className="h-4 w-4" /> },
                    ] as Array<{ id: ToolType; label: string; icon: React.ReactNode }>
                  ).map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      title={tool.label}
                      onClick={() => {
                        setActiveTool(tool.id);
                        setCenterView('2d');
                      }}
                      className={`rounded-xl p-1.5 transition ${
                        activeTool === tool.id && centerView === '2d'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {tool.icon}
                    </button>
                  ))}
                  <div className="mx-0.5 h-5 w-px bg-slate-700" />
                  <input
                    type="color"
                    value={activeColor}
                    onChange={(e) => setActiveColor(e.target.value)}
                    title={copy.color}
                    className="h-6 w-6 cursor-pointer rounded-md border border-slate-600 bg-transparent p-0"
                  />
                  <button
                    type="button"
                    onClick={cycleBoardSurface}
                    title={copy.boardThemes[boardSurface]}
                    className="rounded-xl p-1.5 text-emerald-400 hover:bg-slate-800"
                  >
                    <Palette className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => canvasRef.current?.triggerSolveRecentMath()}
                    title={copy.classroomBar.solveNow}
                    className="rounded-xl p-1.5 text-violet-300 hover:bg-slate-800"
                  >
                    <Calculator className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setGraphModalOpen(true)}
                    title={copy.classroomBar.graphAxes}
                    className="rounded-xl p-1.5 text-cyan-300 hover:bg-slate-800"
                  >
                    <TrendingUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setToolsModalOpen(true)}
                    title={copy.classroomBar.toolsModal}
                    className="rounded-xl p-1.5 text-rose-300 hover:bg-slate-800"
                  >
                    <Ruler className="h-4 w-4" />
                  </button>
                  <div className="mx-0.5 h-5 w-px bg-slate-700" />
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    title={copy.undo}
                    className="rounded-xl p-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-35"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    title={copy.redo}
                    className="rounded-xl p-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-35"
                  >
                    <Redo2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightOpen((v) => !v)}
                    title="AI Assistant"
                    className={`rounded-xl p-1.5 transition ${
                      rightOpen ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <PanelRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Top-Right Floating 2D/3D Switch & Exit Fullscreen Button */}
                <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-1.5 text-white shadow-xl backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setCenterView(centerView === '2d' ? '3d' : '2d')}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    {centerView === '2d' ? <Box className="h-3.5 w-3.5 text-amber-400" /> : <Layers className="h-3.5 w-3.5 text-cyan-400" />}
                    <span className="hidden sm:inline">
                      {centerView === '2d' ? copy.studio3d : copy.board2d}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-rose-500"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span>{copy.exitFullscreen}</span>
                  </button>
                </div>

                {/* Bottom-Center Floating Page & Razor-Sharp Zoom HUD */}
                {centerView === '2d' && (
                  <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-slate-700/70 bg-slate-900/90 px-2.5 py-1.5 text-white shadow-xl backdrop-blur-md">
                    <div className="flex items-center gap-1 overflow-x-auto max-w-[40vw]">
                      {pages.map((p, idx) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setActivePageIdx(idx);
                            setSelectedId(null);
                          }}
                          className={`shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium tabular-nums ${
                            idx === activePageIdx
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddPage}
                        title={copy.newPage}
                        className="rounded-lg bg-slate-800 p-1 text-slate-200 hover:bg-slate-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mx-1 h-4 w-px bg-slate-700" />
                    <button
                      type="button"
                      onClick={() => canvasRef.current?.zoomAroundCenter(zoom - 0.15)}
                      className="rounded-lg p-1 text-slate-200 hover:bg-slate-800"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-12 text-center font-mono text-xs tabular-nums text-slate-100">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => canvasRef.current?.zoomAroundCenter(zoom + 0.15)}
                      className="rounded-lg p-1 text-slate-200 hover:bg-slate-800"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => canvasRef.current?.fitToScreen()}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      <Maximize2 className="h-3 w-3" />
                      <span>{copy.zoomFit}</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom Page & Zoom Bar (Normal Mode) */}
          {!isFullscreen && centerView === '2d' && (
            <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {pages.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setActivePageIdx(idx);
                      setSelectedId(null);
                    }}
                    className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium tabular-nums ${
                      idx === activePageIdx
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {copy.page} {idx + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddPage}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {copy.newPage}
                </button>
                <button
                  type="button"
                  onClick={handleDeletePage}
                  title={copy.deletePage}
                  className="rounded-md border border-slate-200 p-1 text-slate-500 hover:text-red-600 dark:border-slate-700 dark:text-slate-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => canvasRef.current?.zoomAroundCenter(zoom - 0.15)}
                  className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => canvasRef.current?.zoomAroundCenter(zoom + 0.15)}
                  className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => canvasRef.current?.fitToScreen()}
                  title={copy.zoomFit}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                >
                  <Maximize2 className="h-3 w-3" />
                  <span className="hidden sm:inline">{copy.zoomFit}</span>
                </button>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT SIDEBAR: AI ASSISTANT (Floating drawer in Fullscreen mode) */}
        {rightOpen && (
          <div
            className={`z-30 h-full w-80 shrink-0 xl:w-96 ${
              isFullscreen
                ? 'absolute inset-y-0 right-0 shadow-2xl'
                : 'max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:shadow-xl'
            }`}
          >
            <RightAIPanel
              lang={lang}
              activeTab={aiTab}
              onChangeTab={setAiTab}
              getBoardPngBase64={getBoardPngBase64}
              currentItems={currentPage.items}
              onReplaceItems={(nextItems) => handleChangePageItems(nextItems, true)}
              onInsertText={(txt) => handleInsertTextToBoard(txt)}
              onInsertImage={handleInsertImageToBoard}
              current3DModel={current3DModel}
              onModel3DGenerated={(model) => {
                setCurrent3DModel(model);
                setQuick3DMode('blueprint');
              }}
              onOpen3DStudio={() => {
                setQuick3DMode('blueprint');
                setCenterView('3d');
              }}
            />
          </div>
        )}
      </div>

      {/* MODALS */}
      <GraphSpaceModal
        open={graphModalOpen}
        onClose={() => setGraphModalOpen(false)}
        lang={lang}
        boardTheme={boardSurface}
        activeColor={activeColor}
        onInsertGraphImage={(dataUrl, label) => handleInsertImageToBoard(dataUrl, label)}
        onOpenInteractiveAxes={(mode) => setAxesWidget({ mode })}
        onSolidInserted={(solidType) => {
          setLastDetectedShape({
            type: solidType,
            points: [],
            bounds: { x: 670, y: 370, width: 260, height: 260 },
            label: solidType,
          });
        }}
      />
      <ClassroomToolsModal
        open={toolsModalOpen}
        onClose={() => setToolsModalOpen(false)}
        lang={lang}
        spotlightEnabled={spotlightEnabled}
        onShowRuler={() => setRulerVisible(true)}
        onToggleShade={() => setShadeVisible((v) => !v)}
        onToggleSpotlight={() => {
          setSpotlightEnabled((v) => {
            const next = !v;
            showToast(
              next
                ? copy.teachingModal.spotlightOff
                : copy.teachingModal.spotlightOn,
            );
            return next;
          });
        }}
        onPickStudentNotice={(student) => {
          const msg = `${copy.teachingModal.pickedPrefix} ${student}`;
          showToast(msg);
          speakBrowser(lang === 'km' ? `សូមអញ្ជើញប្អូន ${student}` : `Calling on ${student}`);
        }}
        onInsertCalcText={(txt) => handleInsertTextToBoard(txt)}
      />
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        lang={lang}
        currentUser={user}
      />
      <ProjectsModal
        open={projectsModalOpen}
        onClose={() => setProjectsModalOpen(false)}
        lang={lang}
        userId={user?.uid || null}
        emailVerified={Boolean(user?.emailVerified)}
        currentBoardId={boardId}
        currentPages={pages}
        boards={boards}
        onCreateBoard={handleCreateNewBoard}
        onOpenBoard={handleOpenCloudBoard}
        onDeleteBoard={handleDeleteCloudBoard}
        onRestoreHistory={(restoredPages) => {
          pushUndo(pages);
          setPages(restoredPages.length > 0 ? restoredPages : [createDefaultPage(0)]);
          setActivePageIdx(0);
        }}
        onOpenAuth={() => setAuthModalOpen(true)}
      />
      <GuideModal
        open={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
        lang={lang}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WhiteboardWorkspace />
    </ErrorBoundary>
  );
}
