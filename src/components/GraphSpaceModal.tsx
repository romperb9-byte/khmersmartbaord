import React, { useState } from 'react';
import { TrendingUp, X } from 'lucide-react';
import type { BoardSurfaceTheme, Language } from '../types/whiteboard';
import { t } from '../i18n/translations';
import {
  generateFunctionGraphDataUrl,
  generateSpaceSolidDataUrl,
  generateUnitCircleDataUrl,
} from '../utils/exportUtils';

interface GraphSpaceModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  boardTheme: BoardSurfaceTheme;
  activeColor: string;
  onInsertGraphImage: (dataUrl: string, label: string) => void;
  onOpenInteractiveAxes: (mode: 'axes2d' | 'axes3d') => void;
  onSolidInserted?: (solidType: 'cube' | 'cylinder' | 'cone' | 'pyramid' | 'sphere' | 'prism') => void;
}

export const GraphSpaceModal: React.FC<GraphSpaceModalProps> = ({
  open,
  onClose,
  lang,
  boardTheme,
  activeColor,
  onInsertGraphImage,
  onOpenInteractiveAxes,
  onSolidInserted,
}) => {
  const copy = t(lang);
  const [fnInput, setFnInput] = useState('0.5*x^2 - 2');
  const [includeAxes, setIncludeAxes] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const handlePlot = () => {
    setErrorMsg(null);
    const trimmed = fnInput.trim();
    if (!trimmed) return;
    try {
      const dataUrl = generateFunctionGraphDataUrl(trimmed, includeAxes, boardTheme);
      if (dataUrl) {
        onInsertGraphImage(dataUrl, `y = ${trimmed}`);
        onClose();
      }
    } catch {
      setErrorMsg(copy.graphModal.invalidFormula);
    }
  };

  const handleUnitCircle = () => {
    const dataUrl = generateUnitCircleDataUrl(boardTheme);
    if (dataUrl) {
      onInsertGraphImage(dataUrl, copy.graphModal.unitCircleLabel);
      onClose();
    }
  };

  const handleInsertSolid = (solid: 'cube' | 'cylinder' | 'cone' | 'pyramid' | 'sphere' | 'prism') => {
    const dataUrl = generateSpaceSolidDataUrl(solid, activeColor);
    if (dataUrl) {
      onInsertGraphImage(dataUrl, copy.graphModal.solids[solid]);
      onSolidInserted?.(solid);
      onClose();
    }
  };

  const quickSamples = [
    { label: '2x + 1', val: '2*x + 1' },
    { label: '0.5x² - 2', val: '0.5*x^2 - 2' },
    { label: '0.25x³ - 1.5x', val: '0.25*x^3 - 1.5*x' },
    { label: '2sin(x)', val: '2*sin(x)' },
  ];

  const solids: Array<'cube' | 'cylinder' | 'cone' | 'pyramid' | 'sphere' | 'prism'> = [
    'cube',
    'cylinder',
    'cone',
    'pyramid',
    'sphere',
    'prism',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-base font-bold text-cyan-700 dark:text-cyan-300">
            <TrendingUp className="h-5 w-5" />
            {copy.graphModal.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-rose-600 hover:text-white dark:bg-slate-800 dark:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 1. Function Graph Plotter */}
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/70">
          <label className="block text-xs font-bold text-cyan-700 dark:text-cyan-300">
            {copy.graphModal.plotSection}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex flex-1 items-center rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
              <span className="mr-2 font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                y =
              </span>
              <input
                type="text"
                value={fnInput}
                onChange={(e) => setFnInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePlot();
                }}
                placeholder="2*x + 1, 0.5*x^2 - 2, 2*sin(x)"
                className="w-full bg-transparent py-2 font-mono text-sm text-slate-900 outline-none dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={handlePlot}
              className="shrink-0 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500"
            >
              {copy.graphModal.plotBtn}
            </button>
          </div>
          {errorMsg && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{errorMsg}</p>}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">{copy.graphModal.samples}</span>
            {quickSamples.map((s) => (
              <button
                key={s.val}
                type="button"
                onClick={() => setFnInput(s.val)}
                className="rounded-lg bg-slate-200 px-2 py-0.5 font-mono text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                {s.label}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={includeAxes}
                onChange={(e) => setIncludeAxes(e.target.checked)}
                className="accent-cyan-500"
              />
              {copy.graphModal.includeAxes}
            </label>
          </div>
        </div>

        {/* 2. Coordinate Axes Presets */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-emerald-700 dark:text-emerald-300">
            {copy.graphModal.axesSection}
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenInteractiveAxes('axes2d');
              }}
              className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <span className="font-mono text-sm text-cyan-600 dark:text-cyan-400">(Oxy)</span>
              <span>{copy.graphModal.axes2dLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenInteractiveAxes('axes3d');
              }}
              className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <span className="font-mono text-sm text-sky-600 dark:text-sky-400">(Oxyz)</span>
              <span>{copy.graphModal.axes3dLabel}</span>
            </button>
            <button
              type="button"
              onClick={handleUnitCircle}
              className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <span className="font-mono text-sm text-amber-600 dark:text-amber-400">sin/cos</span>
              <span>{copy.graphModal.unitCircleLabel}</span>
            </button>
          </div>
        </div>

        {/* 3. 3D Space Geometry Solids */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-amber-700 dark:text-amber-300">
            {copy.graphModal.solidsSection}
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
            {solids.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleInsertSolid(s)}
                className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-semibold hover:border-amber-500 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-amber-600/30"
              >
                {copy.graphModal.solids[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
