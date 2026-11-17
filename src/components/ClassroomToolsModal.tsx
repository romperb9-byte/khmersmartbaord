import React, { useState } from 'react';
import { Flashlight, PanelTop, Ruler, School, Users, X } from 'lucide-react';
import type { Language } from '../types/whiteboard';
import { t } from '../i18n/translations';
import { decimalToFraction, normalizeKhmerDigits } from '../utils/exportUtils';

interface ClassroomToolsModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  spotlightEnabled: boolean;
  onShowRuler: () => void;
  onToggleShade: () => void;
  onToggleSpotlight: () => void;
  onPickStudentNotice: (studentName: string) => void;
  onInsertCalcText: (text: string) => void;
}

const DEFAULT_ROSTER_KM = 'សុខា, ដារ៉ា, បុប្ផា, វិសាល, ចន្ទា, រតនា, សុភ័ក្រ, ម៉ាលីស, ពិសិដ្ឋ, កញ្ញា';
const DEFAULT_ROSTER_EN = 'Sokha, Dara, Bopha, Visal, Chantha, Ratana, Sopheak, Malis, Piseth, Kanha';

export const ClassroomToolsModal: React.FC<ClassroomToolsModalProps> = ({
  open,
  onClose,
  lang,
  spotlightEnabled,
  onShowRuler,
  onToggleShade,
  onToggleSpotlight,
  onPickStudentNotice,
  onInsertCalcText,
}) => {
  const copy = t(lang);
  const [rosterText, setRosterText] = useState(() =>
    lang === 'km' ? DEFAULT_ROSTER_KM : DEFAULT_ROSTER_EN,
  );
  const [calcInput, setCalcInput] = useState('');
  const [calcOutput, setCalcOutput] = useState<{
    decimal: string;
    fraction: string;
    display: string;
  } | null>(null);

  if (!open) return null;

  const evaluateSmartCalc = () => {
    const raw = calcInput.trim();
    if (!raw) return;
    const norm = normalizeKhmerDigits(raw).replace(/×/g, '*').replace(/÷/g, '/');
    if (!/^[0-9+\-*/().\s]+$/.test(norm)) {
      setCalcOutput({ decimal: '', fraction: '', display: copy.teachingModal.invalidCalc });
      return;
    }
    try {
      const val = Function(`"use strict"; return (${norm});`)() as unknown;
      if (typeof val === 'number' && Number.isFinite(val)) {
        const rounded = Math.round(val * 100000) / 100000;
        const frac = decimalToFraction(rounded);
        const display =
          frac !== String(rounded)
            ? `${copy.teachingModal.answerPrefix} ${rounded}  |  ${copy.teachingModal.fractionPrefix} ${frac}`
            : `${copy.teachingModal.answerPrefix} ${rounded}`;
        setCalcOutput({ decimal: String(rounded), fraction: frac, display });
      } else {
        setCalcOutput({ decimal: '', fraction: '', display: copy.teachingModal.invalidCalc });
      }
    } catch {
      setCalcOutput({ decimal: '', fraction: '', display: copy.teachingModal.invalidCalc });
    }
  };

  const handlePickRandomStudent = () => {
    const names = rosterText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    const chosen = names[Math.floor(Math.random() * names.length)];
    onClose();
    onPickStudentNotice(chosen);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-base font-bold text-rose-600 dark:text-rose-300">
            <School className="h-5 w-5" />
            {copy.teachingModal.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-rose-600 hover:text-white dark:bg-slate-800 dark:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <button
            type="button"
            onClick={() => {
              onShowRuler();
              onClose();
            }}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <Ruler className="h-5 w-5 shrink-0 text-amber-500" />
            <span>{copy.teachingModal.ruler}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onToggleShade();
              onClose();
            }}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <PanelTop className="h-5 w-5 shrink-0 text-sky-500" />
            <span>{copy.teachingModal.shade}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onToggleSpotlight();
              onClose();
            }}
            className={`flex items-center gap-2.5 rounded-xl border p-3 text-left font-semibold ${
              spotlightEnabled
                ? 'border-yellow-500 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700'
            }`}
          >
            <Flashlight className="h-5 w-5 shrink-0 text-yellow-500" />
            <span>
              {spotlightEnabled
                ? copy.teachingModal.spotlightOn
                : copy.teachingModal.spotlightOff}
            </span>
          </button>
          <button
            type="button"
            onClick={handlePickRandomStudent}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <Users className="h-5 w-5 shrink-0 text-emerald-500" />
            <span>{copy.teachingModal.randomStudent}</span>
          </button>
        </div>

        {/* Editable Class Roster */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            {copy.teachingModal.rosterLabel}
          </label>
          <input
            type="text"
            value={rosterText}
            onChange={(e) => setRosterText(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        {/* Smart Calculator with Khmer Digits & Fraction Support */}
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/80">
          <label className="block text-xs font-bold text-emerald-700 dark:text-emerald-300">
            {copy.teachingModal.calcTitle}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={calcInput}
              onChange={(e) => setCalcInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') evaluateSmartCalc();
              }}
              placeholder={copy.teachingModal.calcPlaceholder}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <button
              type="button"
              onClick={evaluateSmartCalc}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
            >
              {copy.teachingModal.calcBtn}
            </button>
          </div>
          {calcOutput && (
            <div className="min-h-[20px] font-mono text-xs font-semibold text-amber-700 dark:text-amber-300">
              {calcOutput.display}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!calcOutput?.decimal}
              onClick={() => {
                if (!calcOutput?.decimal) return;
                onInsertCalcText(`= ${calcOutput.decimal}`);
                onClose();
              }}
              className="flex-1 rounded-xl bg-slate-200 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-300 disabled:opacity-45 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              {copy.teachingModal.insertDecimal}
            </button>
            <button
              type="button"
              disabled={!calcOutput?.fraction}
              onClick={() => {
                if (!calcOutput?.fraction) return;
                onInsertCalcText(`= ${calcOutput.fraction}`);
                onClose();
              }}
              className="flex-1 rounded-xl bg-violet-600 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-45"
            >
              {copy.teachingModal.insertFraction}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
