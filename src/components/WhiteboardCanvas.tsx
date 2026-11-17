import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Box, Check, Layers, RotateCw, Trash2, X } from 'lucide-react';
import type {
  BackgroundStyle,
  BoardSurfaceTheme,
  CanvasItem,
  DetectedShapeInfo,
  Language,
  ShapeItem,
  StrokeItem,
  StrokePoint,
  TextItem,
  ThemeMode,
  ToolType,
} from '../types/whiteboard';
import {
  BOARD_HEIGHT,
  BOARD_SURFACE_CONFIG,
  BOARD_WIDTH,
  drawBackgroundPattern,
  drawCanvasItem,
} from '../utils/exportUtils';
import { recognizeShapeAI } from '../services/aiClient';
import { t } from '../i18n/translations';

export interface MathRegionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  eqRightX: number;
  eqCenterY: number;
  digitHeight: number;
}

export interface WhiteboardCanvasHandle {
  getBoardPngBase64: () => string;
  captureRegionPngBase64: (box?: { x: number; y: number; width: number; height: number }) => string;
  fitToScreen: () => void;
  zoomAroundCenter: (nextZoom: number) => void;
  triggerSolveRecentMath: () => void;
}

interface WhiteboardCanvasProps {
  items: CanvasItem[];
  onChangeItems: (nextItems: CanvasItem[], commitHistory?: boolean) => void;
  activeTool: ToolType;
  activeColor: string;
  strokeWidth: number;
  backgroundStyle: BackgroundStyle;
  boardTheme: BoardSurfaceTheme;
  theme: ThemeMode;
  lang: Language;
  zoom: number;
  onChangeZoom: (nextZoom: number) => void;
  isFullscreen?: boolean;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  autoShapeEnabled: boolean;
  aiMathEnabled: boolean;
  spotlightEnabled: boolean;
  onShapeRecognized?: (label: string, info?: DetectedShapeInfo) => void;
  onLastShapeChange?: (info: DetectedShapeInfo) => void;
  onTriggerMathRegionSolve?: (region: MathRegionBox, imageBase64: string) => void;
  onOpenInteractiveAxes?: (mode: 'axes2d' | 'axes3d', pos?: { x: number; y: number }) => void;
  onSendTo3DStudio?: (
    mode: 'extrude' | 'revolve' | 'hologram',
    info: DetectedShapeInfo,
    hologramImageUrl?: string,
  ) => void;
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; startClientX: number; startClientY: number; startPanX: number; startPanY: number }
  | { kind: 'draw_stroke'; item: StrokeItem }
  | { kind: 'draw_shape'; item: ShapeItem; startX: number; startY: number }
  | { kind: 'draw_axes_box'; mode: 'axes2d' | 'axes3d'; startX: number; startY: number; curX: number; curY: number }
  | { kind: 'laser' }
  | { kind: 'erase'; erasedIds: Set<string> }
  | { kind: 'move_item'; id: string; startBoardX: number; startBoardY: number; origItem: CanvasItem }
  | {
      kind: 'resize_item';
      id: string;
      handle: 'nw' | 'ne' | 'sw' | 'se';
      startBoardX: number;
      startBoardY: number;
      origBox: { x: number; y: number; width: number; height: number };
      origItem: CanvasItem;
    };

function getItemBounds(item: CanvasItem): { x: number; y: number; width: number; height: number } {
  if (item.type === 'shape' && (item.shapeKind === 'line' || item.shapeKind === 'arrow')) {
    const minX = Math.min(item.x, item.x + item.width);
    const minY = Math.min(item.y, item.y + item.height);
    const maxX = Math.max(item.x, item.x + item.width);
    const maxY = Math.max(item.y, item.y + item.height);
    return {
      x: minX,
      y: minY,
      width: Math.max(16, maxX - minX),
      height: Math.max(16, maxY - minY),
    };
  }
  return {
    x: item.width >= 0 ? item.x : item.x + item.width,
    y: item.height >= 0 ? item.y : item.y + item.height,
    width: Math.max(16, Math.abs(item.width)),
    height: Math.max(16, Math.abs(item.height)),
  };
}

function hitTestItem(item: CanvasItem, bx: number, by: number): boolean {
  const pad = Math.max(10, item.strokeWidth + 6);
  if (item.type === 'stroke') {
    const b = getItemBounds(item);
    if (bx < b.x - pad || bx > b.x + b.width + pad || by < b.y - pad || by > b.y + b.height + pad) {
      return false;
    }
    return item.points.some((p) => Math.hypot(p.x - bx, p.y - by) <= pad);
  }
  const b = getItemBounds(item);
  return (
    bx >= b.x - pad &&
    bx <= b.x + b.width + pad &&
    by >= b.y - pad &&
    by <= b.y + b.height + pad
  );
}

function generateOutlinePoints(
  kind: 'line' | 'rect' | 'circle' | 'triangle' | 'arrow',
  x: number,
  y: number,
  w: number,
  h: number,
): StrokePoint[] {
  if (kind === 'rect') {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  if (kind === 'triangle') {
    return [
      { x: x + w / 2, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  if (kind === 'circle') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = Math.abs(w) / 2;
    const ry = Math.abs(h) / 2;
    const pts: StrokePoint[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return pts;
  }
  return [
    { x, y },
    { x: x + w, y: y + h },
  ];
}

function itemToDetectedShape(item: CanvasItem): DetectedShapeInfo {
  const b = getItemBounds(item);
  if (item.type === 'shape') {
    return {
      type: item.shapeKind,
      points: generateOutlinePoints(item.shapeKind, item.x, item.y, item.width, item.height),
      bounds: b,
      label: item.shapeKind,
    };
  }
  if (item.type === 'stroke') {
    return {
      type: 'polygon',
      points: item.points,
      bounds: b,
      label: 'polygon',
    };
  }
  return {
    type: 'rect',
    points: generateOutlinePoints('rect', b.x, b.y, b.width, b.height),
    bounds: b,
    label: item.type === 'image' ? item.label || 'image' : 'text',
  };
}

function recognizeFreehandShapeLocal(
  pts: StrokePoint[],
): { shapeKind: 'circle' | 'rect' | 'triangle' | 'line'; bounds: { x: number; y: number; width: number; height: number } } | null {
  if (pts.length < 10) return null;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    pathLen = 0;
  for (let i = 0; i < pts.length; i++) {
    minX = Math.min(minX, pts[i].x);
    maxX = Math.max(maxX, pts[i].x);
    minY = Math.min(minY, pts[i].y);
    maxY = Math.max(maxY, pts[i].y);
    if (i > 0) {
      pathLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 28 && h < 28) return null;

  const startEndDist = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y);
  const diag = Math.hypot(w, h);

  // Only recognize closed shapes automatically for pen so handwriting letters/digits stay intact
  if (startEndDist < Math.max(36, diag * 0.25) && pathLen > 105) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = w / 2 || 1;
    const ry = h / 2 || 1;
    let radialErr = 0;
    for (const p of pts) {
      const nx = (p.x - cx) / rx;
      const ny = (p.y - cy) / ry;
      radialErr += Math.abs(Math.hypot(nx, ny) - 1);
    }
    radialErr /= pts.length;

    if (radialErr < 0.16) {
      return { shapeKind: 'circle', bounds: { x: minX, y: minY, width: w, height: h } };
    }

    const rectPerim = 2 * (w + h);
    if (pathLen > rectPerim * 0.86 && pathLen < rectPerim * 1.18) {
      return { shapeKind: 'rect', bounds: { x: minX, y: minY, width: w, height: h } };
    }
    if (pathLen >= rectPerim * 0.65 && pathLen <= rectPerim * 0.85) {
      return { shapeKind: 'triangle', bounds: { x: minX, y: minY, width: w, height: h } };
    }
  }
  return null;
}

function summarizeStrokeForAI(points: StrokePoint[]): string {
  if (points.length < 2) return 'single point';
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let pathLen = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (i > 0) {
      pathLen += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    }
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const startEndDist = Math.hypot(
    points[points.length - 1].x - points[0].x,
    points[points.length - 1].y - points[0].y,
  );
  const isClosed = startEndDist < Math.max(w, h) * 0.28;
  return `points=${points.length}, aspectRatio=${(w / h).toFixed(2)}, closed=${isClosed}, straightness=${(
    startEndDist / Math.max(1, pathLen)
  ).toFixed(2)}`;
}

function renderStrokeThumbnailBase64(stroke: StrokeItem): string {
  const b = getItemBounds(stroke);
  const size = 180;
  const pad = 20;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  const scale = (size - pad * 2) / Math.max(20, b.width, b.height);
  const ox = (size - b.width * scale) / 2;
  const oy = (size - b.height * scale) / 2;

  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  stroke.points.forEach((p, idx) => {
    const px = ox + (p.x - b.x) * scale;
    const py = oy + (p.y - b.y) * scale;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  return off.toDataURL('image/png');
}

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasHandle, WhiteboardCanvasProps>(
  function WhiteboardCanvas(
    {
      items,
      onChangeItems,
      activeTool,
      activeColor,
      strokeWidth,
      backgroundStyle,
      boardTheme,
      theme,
      lang,
      zoom,
      onChangeZoom,
      isFullscreen = false,
      selectedId,
      onSelectId,
      autoShapeEnabled,
      aiMathEnabled,
      spotlightEnabled,
      onShapeRecognized,
      onLastShapeChange,
      onTriggerMathRegionSolve,
      onOpenInteractiveAxes,
      onSendTo3DStudio,
    },
    ref,
  ) {
    const copy = t(lang);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const dragRef = useRef<DragMode>({ kind: 'none' });
    const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const pinchRef = useRef<{
      dist: number;
      zoom: number;
      midX: number;
      midY: number;
      panX: number;
      panY: number;
    } | null>(null);
    const [viewSize, setViewSize] = useState({ width: 1200, height: 760 });
    const [pan, setPan] = useState({ x: 40, y: 28 });
    const [draftItem, setDraftItem] = useState<CanvasItem | null>(null);
    const [axesPreviewBox, setAxesPreviewBox] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>(null);
    const [spacePressed, setSpacePressed] = useState(false);
    const [textEditor, setTextEditor] = useState<{
      x: number;
      y: number;
      value: string;
      editingId?: string;
    } | null>(null);
    const [smartShapeLoading, setSmartShapeLoading] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
      screenX: number;
      screenY: number;
      targetItem: CanvasItem;
    } | null>(null);

    // Laser trail & Spotlight refs (screen space)
    const laserTrailRef = useRef<Array<{ x: number; y: number; time: number }>>([]);
    const spotlightPosRef = useRef<{ x: number; y: number }>({ x: 420, y: 280 });
    const spotlightEnabledRef = useRef(spotlightEnabled);
    spotlightEnabledRef.current = spotlightEnabled;

    // Handwritten Math '=' detection tracking
    const recentMathStrokesRef = useRef<
      Array<{ bounds: { x: number; y: number; width: number; height: number }; time: number }>
    >([]);
    const mathTimerRef = useRef<number | null>(null);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const updateSize = () => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setViewSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
        }
      };
      updateSize();
      const ro = new ResizeObserver(() => updateSize());
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const fitToScreen = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const pad = isFullscreen ? 8 : 32;
      const nextZoom = Math.min(
        (rect.width - pad) / BOARD_WIDTH,
        (rect.height - pad) / BOARD_HEIGHT,
        2.5,
      );
      const clamped = Math.max(0.25, Math.min(5, Number(nextZoom.toFixed(2))));
      onChangeZoom(clamped);
      setPan({
        x: Math.round((rect.width - BOARD_WIDTH * clamped) / 2),
        y: Math.round((rect.height - BOARD_HEIGHT * clamped) / 2),
      });
    }, [isFullscreen, onChangeZoom]);

    const zoomAroundPoint = useCallback(
      (nextZoomRaw: number, cx: number, cy: number) => {
        const nextZoom = Math.max(0.25, Math.min(5, Number(nextZoomRaw.toFixed(2))));
        const boardX = (cx - pan.x) / zoom;
        const boardY = (cy - pan.y) / zoom;
        setPan({
          x: Math.round(cx - boardX * nextZoom),
          y: Math.round(cy - boardY * nextZoom),
        });
        onChangeZoom(nextZoom);
      },
      [onChangeZoom, pan.x, pan.y, zoom],
    );

    const zoomAroundCenter = useCallback(
      (nextZoomRaw: number) => {
        zoomAroundPoint(nextZoomRaw, viewSize.width / 2, viewSize.height / 2);
      },
      [viewSize.height, viewSize.width, zoomAroundPoint],
    );

    useEffect(() => {
      const timer = window.setTimeout(() => {
        fitToScreen();
      }, 60);
      return () => window.clearTimeout(timer);
      // Re-fit smoothly whenever fullscreen mode toggles or on initial mount
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFullscreen]);

    const captureRegionPngBase64 = useCallback(
      (box?: { x: number; y: number; width: number; height: number }) => {
        const off = document.createElement('canvas');
        const hiScale = box ? 2 : 1;
        off.width = BOARD_WIDTH * hiScale;
        off.height = BOARD_HEIGHT * hiScale;
        const ctx = off.getContext('2d');
        if (!ctx) return '';
        if (hiScale !== 1) ctx.scale(hiScale, hiScale);
        drawBackgroundPattern(ctx, BOARD_WIDTH, BOARD_HEIGHT, backgroundStyle, theme, boardTheme);
        for (const it of items) {
          drawCanvasItem(ctx, it, imageCacheRef.current);
        }
        if (!box) {
          return off.toDataURL('image/png');
        }
        const rx = Math.max(0, Math.floor(box.x));
        const ry = Math.max(0, Math.floor(box.y));
        const rw = Math.max(60, Math.min(BOARD_WIDTH - rx, Math.ceil(box.width)));
        const rh = Math.max(60, Math.min(BOARD_HEIGHT - ry, Math.ceil(box.height)));
        const snap = document.createElement('canvas');
        snap.width = rw * hiScale;
        snap.height = rh * hiScale;
        const sCtx = snap.getContext('2d');
        if (!sCtx) return off.toDataURL('image/png');
        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        sCtx.fillStyle = BOARD_SURFACE_CONFIG[boardTheme].bg;
        sCtx.fillRect(0, 0, snap.width, snap.height);
        sCtx.drawImage(
          off,
          rx * hiScale,
          ry * hiScale,
          rw * hiScale,
          rh * hiScale,
          0,
          0,
          snap.width,
          snap.height,
        );
        return snap.toDataURL('image/png');
      },
      [backgroundStyle, boardTheme, items, theme],
    );

    const computeRecentMathRegion = useCallback((): MathRegionBox | null => {
      const list = recentMathStrokesRef.current;
      if (list.length === 0) return null;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      let maxDigitH = 30;
      for (let i = 0; i < list.length; i++) {
        const b = list[i].bounds;
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
        if (i < list.length - 2) {
          maxDigitH = Math.max(maxDigitH, b.height);
        }
      }
      const lastTwo = list.slice(-2);
      const eqRightX = Math.max(...lastTwo.map((s) => s.bounds.x + s.bounds.width));
      const eqCenterY =
        lastTwo.reduce((acc, s) => acc + s.bounds.y + s.bounds.height / 2, 0) / lastTwo.length;

      return {
        x: Math.max(0, minX - 28),
        y: Math.max(0, minY - 28),
        width: Math.min(BOARD_WIDTH, maxX - minX + 56),
        height: Math.min(BOARD_HEIGHT, maxY - minY + 56),
        eqRightX,
        eqCenterY,
        digitHeight: Math.max(24, Math.min(72, maxDigitH)),
      };
    }, []);

    const triggerSolveRecentMath = useCallback(() => {
      const region = computeRecentMathRegion();
      if (region) {
        const img = captureRegionPngBase64(region);
        onTriggerMathRegionSolve?.(region, img);
        recentMathStrokesRef.current = [];
        return;
      }
      // Fallback: full board solve placed cleanly near center-right
      const fullImg = captureRegionPngBase64();
      onTriggerMathRegionSolve?.(
        {
          x: 0,
          y: 0,
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          eqRightX: BOARD_WIDTH * 0.56,
          eqCenterY: BOARD_HEIGHT * 0.45,
          digitHeight: 34,
        },
        fullImg,
      );
    }, [captureRegionPngBase64, computeRecentMathRegion, onTriggerMathRegionSolve]);

    useImperativeHandle(
      ref,
      () => ({
        getBoardPngBase64: () => captureRegionPngBase64(),
        captureRegionPngBase64,
        fitToScreen,
        zoomAroundCenter,
        triggerSolveRecentMath,
      }),
      [captureRegionPngBase64, fitToScreen, triggerSolveRecentMath, zoomAroundCenter],
    );

    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (
          e.code === 'Space' &&
          document.activeElement?.tagName !== 'TEXTAREA' &&
          document.activeElement?.tagName !== 'INPUT'
        ) {
          setSpacePressed(true);
        }
        if (
          (e.key === 'Delete' || e.key === 'Backspace') &&
          selectedId &&
          document.activeElement?.tagName !== 'TEXTAREA' &&
          document.activeElement?.tagName !== 'INPUT'
        ) {
          onChangeItems(
            items.filter((it) => it.id !== selectedId),
            true,
          );
          onSelectId(null);
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') setSpacePressed(false);
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    }, [items, onChangeItems, onSelectId, selectedId]);

    // Screen-space Overlay animation loop (Laser trail & Spotlight)
    useEffect(() => {
      let rafId = 0;
      const tick = () => {
        const overlay = overlayCanvasRef.current;
        const container = containerRef.current;
        if (overlay && container) {
          const w = container.clientWidth || 800;
          const h = container.clientHeight || 600;
          if (overlay.width !== w || overlay.height !== h) {
            overlay.width = w;
            overlay.height = h;
          }
          const oCtx = overlay.getContext('2d');
          if (oCtx) {
            oCtx.clearRect(0, 0, w, h);

            if (spotlightEnabledRef.current) {
              oCtx.save();
              oCtx.fillStyle = 'rgba(0, 0, 0, 0.72)';
              oCtx.fillRect(0, 0, w, h);
              oCtx.globalCompositeOperation = 'destination-out';
              const sp = spotlightPosRef.current;
              const grad = oCtx.createRadialGradient(sp.x, sp.y, 40, sp.x, sp.y, 145);
              grad.addColorStop(0, 'rgba(0,0,0,1)');
              grad.addColorStop(1, 'rgba(0,0,0,0)');
              oCtx.fillStyle = grad;
              oCtx.beginPath();
              oCtx.arc(sp.x, sp.y, 145, 0, Math.PI * 2);
              oCtx.fill();
              oCtx.restore();
            }

            const now = Date.now();
            const trail = laserTrailRef.current.filter((p) => now - p.time < 650);
            laserTrailRef.current = trail;
            if (trail.length > 1) {
              oCtx.save();
              for (let i = 1; i < trail.length; i++) {
                const alpha = 1 - (now - trail[i].time) / 650;
                oCtx.strokeStyle = `rgba(244, 63, 94, ${alpha})`;
                oCtx.lineWidth = Math.max(1, 6 * alpha);
                oCtx.lineCap = 'round';
                oCtx.beginPath();
                oCtx.moveTo(trail[i - 1].x, trail[i - 1].y);
                oCtx.lineTo(trail[i].x, trail[i].y);
                oCtx.stroke();
              }
              const tip = trail[trail.length - 1];
              oCtx.fillStyle = '#ffffff';
              oCtx.beginPath();
              oCtx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
              oCtx.fill();
              oCtx.restore();
            }
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, []);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const targetW = Math.max(1, Math.round(viewSize.width * dpr));
      const targetH = Math.max(1, Math.round(viewSize.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, targetW, targetH);

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Board drop shadow in viewport space
      ctx.save();
      ctx.shadowColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(15, 23, 42, 0.18)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = BOARD_SURFACE_CONFIG[boardTheme].bg;
      ctx.fillRect(pan.x, pan.y, BOARD_WIDTH * zoom, BOARD_HEIGHT * zoom);
      ctx.restore();

      // Native vector-sharp zoom transform: rasterizes strokes, text, shapes & images at dpr * zoom!
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      ctx.clip();

      drawBackgroundPattern(ctx, BOARD_WIDTH, BOARD_HEIGHT, backgroundStyle, theme, boardTheme);

      for (const item of items) {
        drawCanvasItem(ctx, item, imageCacheRef.current, () => redraw());
      }
      if (draftItem) {
        drawCanvasItem(ctx, draftItem, imageCacheRef.current);
      }

      if (axesPreviewBox) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.strokeRect(
          axesPreviewBox.x,
          axesPreviewBox.y,
          axesPreviewBox.width,
          axesPreviewBox.height,
        );
        ctx.restore();
      }

      if (selectedId) {
        const selected = items.find((it) => it.id === selectedId);
        if (selected) {
          const b = getItemBounds(selected);
          const pad = 6 / zoom;
          const handleSize = 10 / zoom;
          ctx.save();
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 2 / zoom;
          ctx.setLineDash([6 / zoom, 4 / zoom]);
          ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
          ctx.setLineDash([]);

          const corners = [
            { x: b.x - pad, y: b.y - pad },
            { x: b.x + b.width + pad, y: b.y - pad },
            { x: b.x - pad, y: b.y + b.height + pad },
            { x: b.x + b.width + pad, y: b.y + b.height + pad },
          ];
          for (const c of corners) {
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#2563EB';
            ctx.lineWidth = 2 / zoom;
            ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
          }
          ctx.restore();
        }
      }

      ctx.restore();

      // Subtle crisp outer border around board
      ctx.strokeStyle =
        theme === 'dark' ? 'rgba(51, 65, 85, 0.7)' : 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

      ctx.restore();
    }, [
      axesPreviewBox,
      backgroundStyle,
      boardTheme,
      draftItem,
      items,
      pan.x,
      pan.y,
      selectedId,
      theme,
      viewSize.height,
      viewSize.width,
      zoom,
    ]);

    useEffect(() => {
      redraw();
    }, [redraw]);

    const clientToBoard = (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    };

    const detectHandleHit = (
      box: { x: number; y: number; width: number; height: number },
      bx: number,
      by: number,
    ): 'nw' | 'ne' | 'sw' | 'se' | null => {
      const tol = 14 / zoom;
      const pts: Array<{ key: 'nw' | 'ne' | 'sw' | 'se'; x: number; y: number }> = [
        { key: 'nw', x: box.x - 6, y: box.y - 6 },
        { key: 'ne', x: box.x + box.width + 6, y: box.y - 6 },
        { key: 'sw', x: box.x - 6, y: box.y + box.height + 6 },
        { key: 'se', x: box.x + box.width + 6, y: box.y + box.height + 6 },
      ];
      for (const p of pts) {
        if (Math.hypot(p.x - bx, p.y - by) <= tol) return p.key;
      }
      return null;
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      setContextMenu(null);
      if (textEditor) {
        commitTextEditor();
        return;
      }
      if (e.button === 2) return; // Handled by onContextMenu

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger pinch-to-zoom support
      if (activePointersRef.current.size === 2) {
        const pts = Array.from(activePointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const rect = containerRef.current?.getBoundingClientRect();
        const midX = (pts[0].x + pts[1].x) / 2 - (rect?.left || 0);
        const midY = (pts[0].y + pts[1].y) / 2 - (rect?.top || 0);
        pinchRef.current = {
          dist: Math.max(10, dist),
          zoom,
          midX,
          midY,
          panX: pan.x,
          panY: pan.y,
        };
        dragRef.current = { kind: 'none' };
        setDraftItem(null);
        return;
      }

      if (e.button === 1 || activeTool === 'pan' || spacePressed || e.shiftKey) {
        dragRef.current = {
          kind: 'pan',
          startClientX: e.clientX,
          startClientY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        };
        return;
      }

      if (activeTool === 'laser') {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          laserTrailRef.current.push({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            time: Date.now(),
          });
        }
        dragRef.current = { kind: 'laser' };
        return;
      }

      const { x, y } = clientToBoard(e.clientX, e.clientY);

      if (activeTool === 'axes2d' || activeTool === 'axes3d') {
        dragRef.current = {
          kind: 'draw_axes_box',
          mode: activeTool,
          startX: x,
          startY: y,
          curX: x,
          curY: y,
        };
        setAxesPreviewBox({ x, y, width: 10, height: 10 });
        return;
      }

      if (activeTool === 'text') {
        setTextEditor({
          x: Math.max(20, Math.min(BOARD_WIDTH - 240, x)),
          y: Math.max(20, Math.min(BOARD_HEIGHT - 80, y)),
          value: '',
        });
        return;
      }

      if (activeTool === 'select') {
        if (selectedId) {
          const sel = items.find((it) => it.id === selectedId);
          if (sel) {
            const box = getItemBounds(sel);
            const handle = detectHandleHit(box, x, y);
            if (handle) {
              dragRef.current = {
                kind: 'resize_item',
                id: sel.id,
                handle,
                startBoardX: x,
                startBoardY: y,
                origBox: box,
                origItem: structuredClone(sel),
              };
              return;
            }
          }
        }

        const hit = [...items].reverse().find((it) => hitTestItem(it, x, y));
        if (hit) {
          onSelectId(hit.id);
          onLastShapeChange?.(itemToDetectedShape(hit));
          dragRef.current = {
            kind: 'move_item',
            id: hit.id,
            startBoardX: x,
            startBoardY: y,
            origItem: structuredClone(hit),
          };
        } else {
          onSelectId(null);
        }
        return;
      }

      if (activeTool === 'eraser') {
        const erasedIds = new Set<string>();
        const remaining = items.filter((it) => {
          if (hitTestItem(it, x, y)) {
            erasedIds.add(it.id);
            return false;
          }
          return true;
        });
        if (erasedIds.size > 0) {
          onChangeItems(remaining, false);
        }
        dragRef.current = { kind: 'erase', erasedIds };
        return;
      }

      if (activeTool === 'pen' || activeTool === 'highlighter' || activeTool === 'smart_shape') {
        const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.6;
        const stroke: StrokeItem = {
          id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'stroke',
          x,
          y,
          width: 1,
          height: 1,
          color: activeColor,
          strokeWidth: activeTool === 'highlighter' ? Math.max(14, strokeWidth * 3) : strokeWidth,
          isHighlighter: activeTool === 'highlighter',
          points: [{ x, y, p: pressure }],
        };
        dragRef.current = { kind: 'draw_stroke', item: stroke };
        setDraftItem(stroke);
        onSelectId(null);
        return;
      }

      if (
        activeTool === 'line' ||
        activeTool === 'rect' ||
        activeTool === 'circle' ||
        activeTool === 'triangle' ||
        activeTool === 'arrow'
      ) {
        const shape: ShapeItem = {
          id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'shape',
          shapeKind: activeTool,
          x,
          y,
          width: 1,
          height: 1,
          color: activeColor,
          strokeWidth,
        };
        dragRef.current = { kind: 'draw_shape', item: shape, startX: x, startY: y };
        setDraftItem(shape);
        onSelectId(null);
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointersRef.current.has(e.pointerId)) {
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pinchRef.current && activePointersRef.current.size >= 2) {
        const pts = Array.from(activePointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const ratio = dist / pinchRef.current.dist;
        const nextZoom = Math.max(
          0.25,
          Math.min(5, Number((pinchRef.current.zoom * ratio).toFixed(2))),
        );
        const rect = containerRef.current?.getBoundingClientRect();
        const curMidX = (pts[0].x + pts[1].x) / 2 - (rect?.left || 0);
        const curMidY = (pts[0].y + pts[1].y) / 2 - (rect?.top || 0);
        const boardX = (pinchRef.current.midX - pinchRef.current.panX) / pinchRef.current.zoom;
        const boardY = (pinchRef.current.midY - pinchRef.current.panY) / pinchRef.current.zoom;
        setPan({
          x: Math.round(curMidX - boardX * nextZoom),
          y: Math.round(curMidY - boardY * nextZoom),
        });
        onChangeZoom(nextZoom);
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && spotlightEnabledRef.current) {
        spotlightPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }

      const drag = dragRef.current;
      if (drag.kind === 'none') return;

      if (drag.kind === 'laser') {
        if (rect) {
          laserTrailRef.current.push({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            time: Date.now(),
          });
        }
        return;
      }

      if (drag.kind === 'pan') {
        setPan({
          x: drag.startPanX + (e.clientX - drag.startClientX),
          y: drag.startPanY + (e.clientY - drag.startClientY),
        });
        return;
      }

      const { x, y } = clientToBoard(e.clientX, e.clientY);

      if (drag.kind === 'draw_axes_box') {
        drag.curX = x;
        drag.curY = y;
        setAxesPreviewBox({
          x: Math.min(drag.startX, x),
          y: Math.min(drag.startY, y),
          width: Math.abs(x - drag.startX),
          height: Math.abs(y - drag.startY),
        });
        return;
      }

      if (drag.kind === 'erase') {
        const hit = items.filter((it) => hitTestItem(it, x, y));
        if (hit.length > 0) {
          hit.forEach((h) => drag.erasedIds.add(h.id));
          onChangeItems(
            items.filter((it) => !drag.erasedIds.has(it.id)),
            false,
          );
        }
        return;
      }

      if (drag.kind === 'draw_stroke') {
        const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.6;
        const pts = drag.item.points;
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) >= 1.5) {
          pts.push({ x, y, p: pressure });
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }
          drag.item.x = minX;
          drag.item.y = minY;
          drag.item.width = Math.max(4, maxX - minX);
          drag.item.height = Math.max(4, maxY - minY);
          setDraftItem({ ...drag.item, points: [...pts] });
        }
        return;
      }

      if (drag.kind === 'draw_shape') {
        const shape = drag.item;
        if (shape.shapeKind === 'line' || shape.shapeKind === 'arrow') {
          shape.x = drag.startX;
          shape.y = drag.startY;
          shape.width = x - drag.startX;
          shape.height = y - drag.startY;
        } else {
          shape.x = Math.min(drag.startX, x);
          shape.y = Math.min(drag.startY, y);
          shape.width = Math.max(4, Math.abs(x - drag.startX));
          shape.height = Math.max(4, Math.abs(y - drag.startY));
        }
        setDraftItem({ ...shape });
        return;
      }

      if (drag.kind === 'move_item') {
        const dx = x - drag.startBoardX;
        const dy = y - drag.startBoardY;
        const orig = drag.origItem;
        const updated = items.map((it) => {
          if (it.id !== drag.id) return it;
          if (orig.type === 'stroke') {
            return {
              ...orig,
              x: orig.x + dx,
              y: orig.y + dy,
              points: orig.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
            };
          }
          return { ...orig, x: orig.x + dx, y: orig.y + dy };
        });
        onChangeItems(updated, false);
        return;
      }

      if (drag.kind === 'resize_item') {
        const dx = x - drag.startBoardX;
        const dy = y - drag.startBoardY;
        const ob = drag.origBox;
        let nx = ob.x;
        let ny = ob.y;
        let nw = ob.width;
        let nh = ob.height;

        if (drag.handle.includes('e')) nw = Math.max(20, ob.width + dx);
        if (drag.handle.includes('s')) nh = Math.max(20, ob.height + dy);
        if (drag.handle.includes('w')) {
          const nextW = Math.max(20, ob.width - dx);
          nx = ob.x + (ob.width - nextW);
          nw = nextW;
        }
        if (drag.handle.includes('n')) {
          const nextH = Math.max(20, ob.height - dy);
          ny = ob.y + (ob.height - nextH);
          nh = nextH;
        }

        const sx = nw / Math.max(1, ob.width);
        const sy = nh / Math.max(1, ob.height);
        const orig = drag.origItem;

        const updated = items.map((it) => {
          if (it.id !== drag.id) return it;
          if (orig.type === 'stroke') {
            return {
              ...orig,
              x: nx,
              y: ny,
              width: nw,
              height: nh,
              points: orig.points.map((p) => ({
                ...p,
                x: nx + (p.x - ob.x) * sx,
                y: ny + (p.y - ob.y) * sy,
              })),
            };
          }
          if (orig.type === 'text') {
            const nextSize = Math.max(12, Math.min(96, Math.round(orig.fontSize * sy)));
            return {
              ...orig,
              x: nx,
              y: ny,
              width: nw,
              height: nh,
              fontSize: nextSize,
            };
          }
          return {
            ...orig,
            x: nx,
            y: ny,
            width: nw,
            height: nh,
          };
        });
        onChangeItems(updated, false);
      }
    };

    const trackStrokeForMathEquals = (stroke: StrokeItem) => {
      if (!aiMathEnabled) return;
      const bounds = getItemBounds(stroke);
      const now = Date.now();
      const cutoff = now - 25000;
      const list = recentMathStrokesRef.current.filter((s) => s.time >= cutoff);
      list.push({ bounds, time: now });
      recentMathStrokesRef.current = list;

      if (mathTimerRef.current) {
        window.clearTimeout(mathTimerRef.current);
      }

      if (list.length >= 2) {
        const s1 = list[list.length - 2].bounds;
        const s2 = list[list.length - 1].bounds;
        const isH1 = s1.width > 14 && s1.height < s1.width * 0.65;
        const isH2 = s2.width > 14 && s2.height < s2.width * 0.65;
        const alignedX =
          Math.abs(s1.x + s1.width / 2 - (s2.x + s2.width / 2)) < Math.max(s1.width, s2.width) * 0.85;
        const stackedY = Math.abs(s1.y - s2.y) > 3 && Math.abs(s1.y - s2.y) < 38;

        if (isH1 && isH2 && alignedX && stackedY) {
          mathTimerRef.current = window.setTimeout(() => {
            triggerSolveRecentMath();
          }, 650);
        }
      }
    };

    const handlePointerUp = async (e?: React.PointerEvent<HTMLDivElement>) => {
      if (e) {
        activePointersRef.current.delete(e.pointerId);
      } else {
        activePointersRef.current.clear();
      }
      if (activePointersRef.current.size < 2) {
        pinchRef.current = null;
      }
      const drag = dragRef.current;
      dragRef.current = { kind: 'none' };

      if (drag.kind === 'laser') return;

      if (drag.kind === 'draw_axes_box') {
        setAxesPreviewBox(null);
        const screenX = Math.max(30, Math.min(drag.startX, drag.curX) * zoom + pan.x);
        const screenY = Math.max(55, Math.min(drag.startY, drag.curY) * zoom + pan.y);
        onOpenInteractiveAxes?.(drag.mode, { x: screenX, y: screenY });
        return;
      }

      if (drag.kind === 'erase') {
        if (drag.erasedIds.size > 0) {
          onChangeItems([...items], true);
        }
        return;
      }

      if (drag.kind === 'move_item' || drag.kind === 'resize_item') {
        onChangeItems([...items], true);
        return;
      }

      if (drag.kind === 'draw_shape') {
        setDraftItem(null);
        if (Math.abs(drag.item.width) > 4 || Math.abs(drag.item.height) > 4) {
          const next = [...items, drag.item];
          onChangeItems(next, true);
          const info = itemToDetectedShape(drag.item);
          onLastShapeChange?.(info);
          onShapeRecognized?.(drag.item.shapeKind, info);
        }
        return;
      }

      if (drag.kind === 'draw_stroke') {
        const stroke = drag.item;
        setDraftItem(null);
        if (stroke.points.length < 2) return;

        // Fast local Auto-Shape for standard pen when enabled
        if (activeTool === 'pen' && autoShapeEnabled) {
          const localHit = recognizeFreehandShapeLocal(stroke.points);
          if (localHit) {
            const shapeItem: ShapeItem = {
              id: stroke.id,
              type: 'shape',
              shapeKind: localHit.shapeKind,
              x: localHit.bounds.x,
              y: localHit.bounds.y,
              width: Math.max(24, localHit.bounds.width),
              height: Math.max(24, localHit.bounds.height),
              color: stroke.color,
              strokeWidth: stroke.strokeWidth,
            };
            onChangeItems([...items, shapeItem], true);
            const info = itemToDetectedShape(shapeItem);
            onLastShapeChange?.(info);
            onShapeRecognized?.(localHit.shapeKind, info);
            return;
          }
        }

        const nextItems = [...items, stroke];
        onChangeItems(nextItems, true);

        const polyInfo = itemToDetectedShape(stroke);
        onLastShapeChange?.(polyInfo);

        if (activeTool === 'pen' && !stroke.isHighlighter) {
          trackStrokeForMathEquals(stroke);
        }

        if (activeTool === 'smart_shape' && stroke.points.length >= 4) {
          setSmartShapeLoading(true);
          try {
            const thumb = renderStrokeThumbnailBase64(stroke);
            const summary = summarizeStrokeForAI(stroke.points);
            const recognized = await recognizeShapeAI({
              imageBase64: thumb,
              pointsSummary: summary,
            });
            if (
              recognized.shapeKind &&
              recognized.shapeKind !== 'none' &&
              recognized.confidence >= 0.45
            ) {
              const b = getItemBounds(stroke);
              const first = stroke.points[0];
              const last = stroke.points[stroke.points.length - 1];
              const shapeItem: ShapeItem = {
                id: stroke.id,
                type: 'shape',
                shapeKind: recognized.shapeKind,
                x:
                  recognized.shapeKind === 'line' || recognized.shapeKind === 'arrow'
                    ? first.x
                    : b.x,
                y:
                  recognized.shapeKind === 'line' || recognized.shapeKind === 'arrow'
                    ? first.y
                    : b.y,
                width:
                  recognized.shapeKind === 'line' || recognized.shapeKind === 'arrow'
                    ? last.x - first.x
                    : Math.max(24, b.width),
                height:
                  recognized.shapeKind === 'line' || recognized.shapeKind === 'arrow'
                    ? last.y - first.y
                    : Math.max(24, b.height),
                color: stroke.color,
                strokeWidth: stroke.strokeWidth,
              };
              onChangeItems(
                nextItems.map((it) => (it.id === stroke.id ? shapeItem : it)),
                true,
              );
              const info = itemToDetectedShape(shapeItem);
              onLastShapeChange?.(info);
              onShapeRecognized?.(recognized.label || recognized.shapeKind, info);
            }
          } catch (err) {
            console.warn('Smart shape recognition skipped:', err);
          } finally {
            setSmartShapeLoading(false);
          }
        }
      }
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const { x, y } = clientToBoard(e.clientX, e.clientY);
      const hit =
        (selectedId ? items.find((it) => it.id === selectedId) : undefined) ||
        [...items].reverse().find((it) => hitTestItem(it, x, y)) ||
        items[items.length - 1];
      if (!hit) return;

      onSelectId(hit.id);
      const rect = containerRef.current?.getBoundingClientRect();
      const sx = rect ? Math.min(rect.width - 250, Math.max(12, e.clientX - rect.left)) : 60;
      const sy = rect ? Math.min(rect.height - 190, Math.max(12, e.clientY - rect.top)) : 60;
      setContextMenu({ screenX: sx, screenY: sy, targetItem: hit });
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        const rect = containerRef.current?.getBoundingClientRect();
        const cx = rect ? e.clientX - rect.left : viewSize.width / 2;
        const cy = rect ? e.clientY - rect.top : viewSize.height / 2;
        zoomAroundPoint(zoom * factor, cx, cy);
      } else {
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };

    const commitTextEditor = () => {
      if (!textEditor) return;
      const trimmed = textEditor.value.trim();
      if (trimmed) {
        const lines = trimmed.split('\n');
        const existing = textEditor.editingId
          ? items.find((it): it is TextItem => it.id === textEditor.editingId && it.type === 'text')
          : undefined;
        const fontSize = existing ? existing.fontSize : Math.max(18, strokeWidth * 5 + 10);
        const longestLine = Math.max(...lines.map((l) => l.length));
        const newItem: TextItem = {
          id: existing ? existing.id : `item_${Date.now()}`,
          type: 'text',
          x: textEditor.x,
          y: textEditor.y,
          width: Math.max(120, longestLine * fontSize * 0.62),
          height: Math.max(36, lines.length * fontSize * 1.4),
          color: existing ? existing.color : activeColor,
          strokeWidth,
          text: trimmed,
          fontSize,
          fontWeight: existing?.fontWeight,
        };
        if (existing) {
          onChangeItems(
            items.map((it) => (it.id === existing.id ? newItem : it)),
            true,
          );
        } else {
          onChangeItems([...items, newItem], true);
        }
        onSelectId(newItem.id);
      }
      setTextEditor(null);
    };

    const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (textEditor) return;
      const { x, y } = clientToBoard(e.clientX, e.clientY);
      const hitText = [...items]
        .reverse()
        .find((it): it is TextItem => it.type === 'text' && hitTestItem(it, x, y));
      if (hitText) {
        setTextEditor({
          x: hitText.x,
          y: hitText.y,
          value: hitText.text,
          editingId: hitText.id,
        });
      }
    };

    const selectedItem = selectedId ? items.find((it) => it.id === selectedId) : null;
    const selectedBounds = selectedItem ? getItemBounds(selectedItem) : null;

    const cursorClass =
      activeTool === 'pan' || spacePressed
        ? 'cursor-grab active:cursor-grabbing'
        : activeTool === 'select'
          ? 'cursor-default'
          : activeTool === 'text'
            ? 'cursor-text'
            : 'cursor-crosshair';

    return (
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        className={`relative h-full w-full overflow-hidden bg-slate-200 dark:bg-slate-950 select-none touch-none ${cursorClass}`}
      >
        <canvas
          ref={canvasRef}
          style={{ width: viewSize.width, height: viewSize.height }}
          className="block h-full w-full"
        />

        {/* Selected Item Delete Button (screen-space, razor-sharp at any zoom) */}
        {selectedItem && selectedBounds && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onChangeItems(
                items.filter((it) => it.id !== selectedItem.id),
                true,
              );
              onSelectId(null);
            }}
            style={{
              left: pan.x + (selectedBounds.x + selectedBounds.width) * zoom + 12,
              top: Math.max(8, pan.y + selectedBounds.y * zoom - 16),
            }}
            title="Delete selected item"
            className="absolute z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}

        {/* Inline Text Box Editor (screen-space, razor-sharp & high-contrast on any board) */}
        {textEditor && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              left: Math.max(12, Math.min(viewSize.width - 290, pan.x + textEditor.x * zoom)),
              top: Math.max(12, Math.min(viewSize.height - 160, pan.y + textEditor.y * zoom)),
            }}
            className={`absolute z-30 min-w-[270px] rounded-xl border border-blue-500 p-2.5 shadow-xl ${
              boardTheme === 'whiteboard'
                ? 'bg-white text-slate-900'
                : 'bg-slate-900/95 text-white'
            }`}
          >
            <textarea
              autoFocus
              rows={3}
              value={textEditor.value}
              onChange={(e) => setTextEditor({ ...textEditor, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitTextEditor();
                } else if (e.key === 'Escape') {
                  setTextEditor(null);
                }
              }}
              placeholder={copy.typeTextPlaceholder}
              className={`w-full resize-none bg-transparent text-base outline-none ${
                boardTheme === 'whiteboard' ? 'placeholder:text-slate-400' : 'placeholder:text-slate-400'
              }`}
              style={{
                color:
                  boardTheme === 'whiteboard' && activeColor.toLowerCase() === '#ffffff'
                    ? '#0f172a'
                    : boardTheme !== 'whiteboard' && activeColor.toLowerCase() === '#0f172a'
                      ? '#ffffff'
                      : activeColor,
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-500/25 pt-2">
              <span className="text-[10px] opacity-65">Enter = OK · Shift+Enter = ↵</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTextEditor(null)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium opacity-80 hover:bg-slate-500/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={commitTextEditor}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <Check className="h-3.5 w-3.5" />
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Screen-space Overlay Canvas for Laser Pointer & Spotlight */}
        <canvas
          ref={overlayCanvasRef}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        />

        {/* Right-Click Context Menu */}
        {contextMenu && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
            className="absolute z-40 w-60 space-y-1 rounded-2xl border border-slate-700 bg-slate-900/95 p-1.5 text-xs text-white shadow-2xl backdrop-blur-md"
          >
            <button
              type="button"
              onClick={() => {
                const info = itemToDetectedShape(contextMenu.targetItem);
                setContextMenu(null);
                onSendTo3DStudio?.('extrude', info);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold text-emerald-300 hover:bg-emerald-600/30"
            >
              <Box className="h-4 w-4" />
              {copy.classroomBar.contextExact3d}
            </button>
            <button
              type="button"
              onClick={() => {
                const info = itemToDetectedShape(contextMenu.targetItem);
                setContextMenu(null);
                onSendTo3DStudio?.('revolve', info);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold text-cyan-300 hover:bg-cyan-600/30"
            >
              <RotateCw className="h-4 w-4" />
              {copy.classroomBar.contextLathe3d}
            </button>
            <button
              type="button"
              onClick={() => {
                const info = itemToDetectedShape(contextMenu.targetItem);
                const snap = captureRegionPngBase64(info.bounds);
                setContextMenu(null);
                onSendTo3DStudio?.('hologram', info, snap);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold text-amber-300 hover:bg-amber-600/30"
            >
              <Layers className="h-4 w-4" />
              {copy.classroomBar.contextHologram3d}
            </button>
            <div className="my-1 border-t border-slate-700/80" />
            <button
              type="button"
              onClick={() => {
                const targetId = contextMenu.targetItem.id;
                setContextMenu(null);
                onChangeItems(
                  items.filter((it) => it.id !== targetId),
                  true,
                );
                onSelectId(null);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold text-rose-300 hover:bg-rose-600/30"
            >
              <Trash2 className="h-4 w-4" />
              {copy.classroomBar.contextDelete}
            </button>
          </div>
        )}

        {/* Smart Shape processing overlay */}
        {smartShapeLoading && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-blue-200 bg-white px-3.5 py-1.5 text-xs font-medium text-blue-700 shadow-sm dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300">
            AI Smart Shape...
          </div>
        )}
      </div>
    );
  },
);
