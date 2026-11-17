import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, RotateCcw, RotateCw, Sparkles, TrendingUp, X } from 'lucide-react';
import type { BoardSurfaceTheme, DetectedEquationResult, Language } from '../types/whiteboard';
import { t } from '../i18n/translations';

// === 1. Draggable & Rotatable Math Ruler (cm) ===
interface MathRulerWidgetProps {
  lang: Language;
  onClose: () => void;
}

export const MathRulerWidget: React.FC<MathRulerWidgetProps> = ({ lang, onClose }) => {
  const copy = t(lang);
  const [pos, setPos] = useState({ x: 96, y: 110 });
  const [angle, setAngle] = useState(0);
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.dragging) return;
      setPos({
        x: Math.max(0, e.clientX - dragRef.current.offsetX),
        y: Math.max(0, e.clientY - dragRef.current.offsetY),
      });
    };
    const onUp = () => {
      dragRef.current.dragging = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return (
    <div
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.stopPropagation();
        dragRef.current = {
          dragging: true,
          offsetX: e.clientX - pos.x,
          offsetY: e.clientY - pos.y,
        };
      }}
      style={{
        left: pos.x,
        top: pos.y,
        width: 380,
        height: 66,
        transform: `rotate(${angle}deg)`,
      }}
      className="absolute z-20 flex cursor-move select-none flex-col justify-between rounded-xl border-2 border-amber-600 bg-amber-100/90 px-3 py-1.5 shadow-xl backdrop-blur-sm"
    >
      <div className="flex items-center justify-between text-[10px] font-bold text-amber-950">
        <span>{copy.teachingModal.ruler}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAngle((a) => (a - 15) % 360)}
            className="rounded bg-amber-300 px-1.5 py-0.5 hover:bg-amber-400"
            title="-15°"
          >
            ↺
          </button>
          <button
            type="button"
            onClick={() => setAngle((a) => (a + 15) % 360)}
            className="rounded bg-amber-300 px-1.5 py-0.5 hover:bg-amber-400"
            title="+15°"
          >
            ↻
          </button>
          <button
            type="button"
            onClick={() => setAngle(0)}
            className="rounded bg-amber-200 px-1.5 py-0.5 hover:bg-amber-300"
            title="0°"
          >
            <RotateCcw className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-rose-600 px-1.5 py-0.5 text-white hover:bg-rose-700"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex h-5 w-full items-start justify-between border-t border-amber-900 font-mono text-[9px] text-amber-950">
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} className="flex flex-col items-center">
            <span className="h-2 w-px bg-amber-950" />
            <span>{i}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

// === 2. Draggable Screen Shade Cover ===
interface ScreenShadeOverlayProps {
  lang: Language;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export const ScreenShadeOverlay: React.FC<ScreenShadeOverlayProps> = ({
  lang,
  containerRef,
  onClose,
}) => {
  const copy = t(lang);
  const [heightPx, setHeightPx] = useState(260);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = Math.max(68, Math.min(rect.height - 32, e.clientY - rect.top));
      setHeightPx(next);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [containerRef]);

  return (
    <div
      style={{ height: heightPx }}
      className="absolute inset-x-0 top-0 z-20 flex flex-col items-center justify-end border-b-4 border-amber-500 bg-slate-900/95 pb-2.5 shadow-2xl"
    >
      <p className="mb-1 text-xs font-semibold text-amber-300">{copy.teachingModal.shadeHint}</p>
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          draggingRef.current = true;
        }}
        className="h-2.5 w-28 cursor-ns-resize rounded-full bg-amber-400 hover:bg-amber-300"
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
      >
        {copy.teachingModal.closeShade}
      </button>
    </div>
  );
};

// === 3. Interactive Rotatable Coordinate Axes Widget (Oxy & Oxyz) ===
interface InteractiveAxesWidgetProps {
  mode: 'axes2d' | 'axes3d';
  boardTheme: BoardSurfaceTheme;
  lang: Language;
  initialPos?: { x: number; y: number };
  onStampToBoard: (dataUrl: string, mode: 'axes2d' | 'axes3d') => void;
  onOpenIn3D: (dataUrl: string) => void;
  onClose: () => void;
}

function drawAxesArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  headLen = 10,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

export const InteractiveAxesWidget: React.FC<InteractiveAxesWidgetProps> = ({
  mode,
  boardTheme,
  lang,
  initialPos,
  onStampToBoard,
  onOpenIn3D,
  onClose,
}) => {
  const copy = t(lang);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pos, setPos] = useState(initialPos || { x: 180, y: 90 });
  const [rot2D, setRot2D] = useState(0);
  const [rot3D, setRot3D] = useState({ yaw: -0.62, pitch: 0.42 });

  const moveDragRef = useRef<{ active: boolean; offsetX: number; offsetY: number }>({
    active: false,
    offsetX: 0,
    offsetY: 0,
  });
  const rotateDragRef = useRef<{ active: boolean; prevX: number; prevY: number }>({
    active: false,
    prevX: 0,
    prevY: 0,
  });

  const renderAxes = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = 360;
    c.height = 310;
    const aCtx = c.getContext('2d');
    if (!aCtx) return;

    aCtx.clearRect(0, 0, c.width, c.height);
    const cx = c.width / 2;
    const cy = c.height / 2;
    const axisColor = boardTheme === 'whiteboard' ? '#0284c7' : '#38bdf8';

    aCtx.save();
    aCtx.strokeStyle = axisColor;
    aCtx.fillStyle = axisColor;
    aCtx.lineWidth = 2.4;
    aCtx.font = 'bold 14px "Inter", sans-serif';

    if (mode === 'axes2d') {
      const len = Math.min(cx, cy) * 0.8;
      const cosA = Math.cos(rot2D);
      const sinA = Math.sin(rot2D);

      const x1 = cx - len * cosA;
      const y1 = cy - len * sinA;
      const x2 = cx + len * cosA;
      const y2 = cy + len * sinA;
      aCtx.beginPath();
      aCtx.moveTo(x1, y1);
      aCtx.lineTo(x2, y2);
      aCtx.stroke();
      drawAxesArrowHead(aCtx, x1, y1, x2, y2, 10);

      const yx1 = cx + len * sinA;
      const yy1 = cy - len * cosA;
      const yx2 = cx - len * sinA;
      const yy2 = cy + len * cosA;
      aCtx.beginPath();
      aCtx.moveTo(yx2, yy2);
      aCtx.lineTo(yx1, yy1);
      aCtx.stroke();
      drawAxesArrowHead(aCtx, yx2, yy2, yx1, yy1, 10);

      aCtx.fillText('O', cx - 15, cy + 16);
      aCtx.fillText('x', x2 + 6, y2 + 4);
      aCtx.fillText('y', yx1 + 6, yy1 - 4);
    } else {
      const len = Math.min(cx, cy) * 0.78;
      const cyaw = Math.cos(rot3D.yaw);
      const syaw = Math.sin(rot3D.yaw);
      const cp = Math.cos(rot3D.pitch);
      const sp = Math.sin(rot3D.pitch);

      const project3D = (vx: number, vy: number, vz: number) => {
        const rx = vx * cyaw - vy * syaw;
        const ry = vx * syaw + vy * cyaw;
        return {
          x: cx + ry * len,
          y: cy - vz * cp * len + rx * sp * len,
        };
      };

      const pO = project3D(0, 0, 0);
      const pX = project3D(1, 0, 0);
      const pY = project3D(0, 1, 0);
      const pZ = project3D(0, 0, 1);

      aCtx.save();
      aCtx.setLineDash([5, 5]);
      aCtx.globalAlpha = 0.45;
      aCtx.beginPath();
      const pNegX = project3D(-0.7, 0, 0);
      const pNegY = project3D(0, -0.7, 0);
      const pNegZ = project3D(0, 0, -0.7);
      aCtx.moveTo(pO.x, pO.y);
      aCtx.lineTo(pNegX.x, pNegX.y);
      aCtx.moveTo(pO.x, pO.y);
      aCtx.lineTo(pNegY.x, pNegY.y);
      aCtx.moveTo(pO.x, pO.y);
      aCtx.lineTo(pNegZ.x, pNegZ.y);
      aCtx.stroke();
      aCtx.restore();

      const drawRay = (endPt: { x: number; y: number }, rayColor: string, label: string) => {
        aCtx.strokeStyle = rayColor;
        aCtx.fillStyle = rayColor;
        aCtx.beginPath();
        aCtx.moveTo(pO.x, pO.y);
        aCtx.lineTo(endPt.x, endPt.y);
        aCtx.stroke();
        drawAxesArrowHead(aCtx, pO.x, pO.y, endPt.x, endPt.y, 10);
        aCtx.fillText(label, endPt.x + 6, endPt.y + 4);
      };

      drawRay(pX, '#f87171', 'x');
      drawRay(pY, '#4ade80', 'y');
      drawRay(pZ, '#38bdf8', 'z');

      aCtx.fillStyle = axisColor;
      aCtx.fillText('O', pO.x - 14, pO.y + 14);
    }

    aCtx.restore();
  }, [boardTheme, mode, rot2D, rot3D]);

  useEffect(() => {
    renderAxes();
  }, [renderAxes]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (moveDragRef.current.active) {
        setPos({
          x: Math.max(8, e.clientX - moveDragRef.current.offsetX),
          y: Math.max(44, e.clientY - moveDragRef.current.offsetY),
        });
      }
      if (rotateDragRef.current.active) {
        const dx = e.clientX - rotateDragRef.current.prevX;
        const dy = e.clientY - rotateDragRef.current.prevY;
        if (mode === 'axes2d') {
          setRot2D((r) => r + dx * 0.015);
        } else {
          setRot3D((prev) => ({
            yaw: prev.yaw + dx * 0.015,
            pitch: Math.max(-1.3, Math.min(1.3, prev.pitch + dy * 0.015)),
          }));
        }
        rotateDragRef.current.prevX = e.clientX;
        rotateDragRef.current.prevY = e.clientY;
      }
    };
    const onUp = () => {
      moveDragRef.current.active = false;
      rotateDragRef.current.active = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [mode]);

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{ left: pos.x, top: pos.y, width: 360, height: 310 }}
      className="absolute z-20 select-none rounded-2xl border-2 border-dashed border-cyan-400/85 bg-slate-900/25 backdrop-blur-[1px]"
    >
      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          moveDragRef.current = {
            active: true,
            offsetX: e.clientX - pos.x,
            offsetY: e.clientY - pos.y,
          };
        }}
        className="absolute -top-9 left-0 right-0 flex cursor-move items-center justify-between rounded-xl border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-[11px] text-white shadow-lg"
      >
        <span className="flex items-center gap-1 font-bold text-cyan-300">
          <RotateCw className="h-3.5 w-3.5" />
          {mode === 'axes2d' ? '(Oxy)' : '(Oxyz 3D)'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const dataUrl = canvasRef.current?.toDataURL('image/png') || '';
              if (dataUrl) onStampToBoard(dataUrl, mode);
            }}
            className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold hover:bg-emerald-500"
          >
            {copy.teachingModal.stampAxes}
          </button>
          <button
            type="button"
            onClick={() => {
              const dataUrl = canvasRef.current?.toDataURL('image/png') || '';
              if (dataUrl) onOpenIn3D(dataUrl);
            }}
            className="rounded bg-cyan-600 px-2 py-0.5 text-[10px] font-bold hover:bg-cyan-500"
          >
            3D
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] hover:bg-rose-500"
          >
            ✕
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          e.stopPropagation();
          rotateDragRef.current = { active: true, prevX: e.clientX, prevY: e.clientY };
        }}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center">
        <span className="rounded-full bg-black/65 px-2.5 py-0.5 text-[10px] text-white/95">
          {copy.teachingModal.dragAxesHint}
        </span>
      </div>
    </div>
  );
};

// === 4. Floating AI Equation Action Bar ===
interface EquationActionBarProps {
  equation: DetectedEquationResult;
  lang: Language;
  onPlotGraph: (fnExpr: string) => void;
  onShow3D: (eq: DetectedEquationResult) => void;
  onClose: () => void;
}

export const EquationActionBar: React.FC<EquationActionBarProps> = ({
  equation,
  lang,
  onPlotGraph,
  onShow3D,
  onClose,
}) => {
  const copy = t(lang);
  const summary = `${equation.expression}  ⇒  ${equation.displayAnswer || equation.answer}`;
  const hasPlot = Boolean(equation.plottableFn && equation.plottableFn.trim());

  return (
    <div className="absolute right-4 top-4 z-30 w-72 space-y-2 rounded-2xl border-2 border-cyan-500 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:bg-slate-900/95">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-700 dark:text-cyan-300">
          <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          {copy.classroomBar.eqDetectedTitle}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
        {summary}
      </p>
      <div className="flex items-center gap-2">
        {hasPlot && (
          <button
            type="button"
            onClick={() => onPlotGraph(equation.plottableFn)}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-cyan-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-cyan-700"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            {copy.classroomBar.plotGraph}
          </button>
        )}
        <button
          type="button"
          onClick={() => onShow3D(equation)}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
        >
          <Box className="h-3.5 w-3.5" />
          {copy.classroomBar.open3d}
        </button>
      </div>
    </div>
  );
};
