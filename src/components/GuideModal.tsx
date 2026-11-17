import React from 'react';
import { BookOpen, Box, Calculator, GraduationCap, HelpCircle, PenTool, X } from 'lucide-react';
import type { Language } from '../types/whiteboard';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
}

export const GuideModal: React.FC<GuideModalProps> = ({ open, onClose, lang }) => {
  if (!open) return null;

  const isKm = lang === 'km';

  const sections = isKm
    ? [
        {
          icon: <PenTool className="h-4 w-4 text-blue-600" />,
          title: '១. ការសរសេរ និងគូរលើក្ដារខៀន (Smart Whiteboard)',
          items: [
            'ប្រើ Mouse, Touch ឬ Stylus ដើម្បីសរសេរអក្សរខ្មែរ អង់គ្លេស ឬគូររូបដោយដៃសេរី។',
            'ឧបករណ៍ "គូររាង AI" នឹងកែរង្វង់ ការ៉េ ត្រីកោណ ឬព្រួញដែលគូរមិនត្រង់ឱ្យស្អាតដោយស្វ័យប្រវត្តិ។',
            'ចុច Ctrl + Wheel ដើម្បីពង្រីក/បង្រួម ឬចុច Space + អូស ដើម្បីរំកិលផ្ទៃក្ដារខៀន។',
            'បន្ថែមទំព័រថ្មីនៅរបារខាងក្រោម ហើយទាញយកជា PNG, JPG ឬ PDF គ្រប់ទំព័រ។',
          ],
        },
        {
          icon: <BookOpen className="h-4 w-4 text-blue-600" />,
          title: '២. មុខងារ AI អាន និងសរសេរ (OCR, STT & TTS)',
          items: [
            'ចុច "អានអក្សរលើក្ដារខៀន (OCR)" ដើម្បីបម្លែងអក្សរសរសេរដៃខ្មែរ/អង់គ្លេសទៅជាអត្ថបទឌីជីថល។',
            'ប្រើ Mic ដើម្បីនិយាយជាអក្សរ ឬចុច "អានជាសំឡេង" ដើម្បីស្ដាប់អត្ថបទ។',
            'អាចកែអក្ខរាវិរុទ្ធ បកប្រែ ខ្មែរ ↔ អង់គ្លេស សង្ខេប និងពន្យល់មេរៀន។',
          ],
        },
        {
          icon: <Box className="h-4 w-4 text-blue-600" />,
          title: '៣. AI Auto 3D Generator និងស្ទូឌីយោ 3D',
          items: [
            'បម្លែងអត្ថបទ គំនូរព្រាងលើក្ដារខៀន ឬរូបភាព 2D ទៅជាម៉ូដែល 3D ពហុផ្នែក។',
            'បង្វិល ពង្រីក កែពណ៌ ភាពរលោង និងពន្លឺស្ទូឌីយោនៅក្នុងផ្ទាំង 3D។',
            'ទាញយកម៉ូដែលជាឯកសារ .GLB, .GLTF ឬ .OBJ ពិតប្រាកដ ឬថតដាក់លើក្ដារខៀន។',
          ],
        },
        {
          icon: <Calculator className="h-4 w-4 text-blue-600" />,
          title: '៤. គណនា AI និងគ្រូបង្រៀន AI',
          items: [
            'សរសេរសមីការលើក្ដារខៀន ហើយចុច "អានសមីការលើក្ដារខៀន" ដើម្បីមើលដំណោះស្រាយជាជំហានៗ។',
            'សួរគ្រូបង្រៀន AI បង្កើតលំហាត់ប្រឡង (មានផ្ដល់ពិន្ទុ) និងគំនូសតាងមេរៀន។',
          ],
        },
      ]
    : [
        {
          icon: <PenTool className="h-4 w-4 text-blue-600" />,
          title: '1. Smart Whiteboard Canvas',
          items: [
            'Draw freely with Mouse, Touch, or pressure-sensitive Stylus.',
            'Use AI Smart Shape to auto-snap hand-drawn circles, rectangles, triangles, lines, and arrows.',
            'Hold Space + Drag (or Pan tool) to move around; Ctrl + Scroll to zoom smoothly.',
            'Manage multiple pages and export cleanly to PNG, JPG, or multi-page PDF.',
          ],
        },
        {
          icon: <BookOpen className="h-4 w-4 text-blue-600" />,
          title: '2. AI Read & Write (OCR, Voice STT & TTS)',
          items: [
            'Click "Read Board Text (OCR)" to extract Khmer & English handwriting from your canvas.',
            'Use Speech-to-Text (Mic) to dictate notes or Text-to-Speech to hear results aloud.',
            'Proofread spelling, translate KM ↔ EN, summarize lessons, or simplify concepts.',
          ],
        },
        {
          icon: <Box className="h-4 w-4 text-blue-600" />,
          title: '3. AI Auto 3D Generator & 3D Studio',
          items: [
            'Generate multi-part PBR 3D assemblies from Text, your Whiteboard Sketch, or a 2D Image.',
            'Orbit, zoom, customize part colors/roughness/metalness, adjust lighting, and snapshot onto the board.',
            'Export real .GLB, .GLTF, and .OBJ 3D files directly from the 3D Studio.',
          ],
        },
        {
          icon: <Calculator className="h-4 w-4 text-blue-600" />,
          title: '4. AI Calculator & AI Tutor',
          items: [
            'Type equations or click "Solve from Whiteboard" to solve handwritten math step-by-step.',
            'Chat with AI Tutor by subject & student level, generate graded quizzes, and insert lesson diagrams.',
          ],
        },
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {isKm
                ? 'ការណែនាំប្រើប្រាស់ Smart AI Whiteboard'
                : 'Quick Start Guide — Smart AI Whiteboard'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {sections.map((sec) => (
            <div
              key={sec.title}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-center gap-2">
                {sec.icon}
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {sec.title}
                </h3>
              </div>
              <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {sec.items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          ))}

          <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
            <GraduationCap className="h-4 w-4 shrink-0 text-blue-600" />
            <span>
              {isKm
                ? 'គន្លឹះ៖ ចូលប្រើប្រាស់ដោយ Google ឬ Email ដើម្បីរក្សាទុកក្ដារខៀនដោយស្វ័យប្រវត្តិ (Auto Save) និងមើលប្រវត្តិគម្រោង។'
                : 'Tip: Sign in with Google or Email to enable automatic Cloud Auto-Save and versioned Project History.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
