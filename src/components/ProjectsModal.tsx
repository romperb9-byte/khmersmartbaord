import React, { useEffect, useState } from 'react';
import { FolderOpen, History, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type {
  Language,
  ProjectHistorySnapshot,
  WhiteboardPageData,
  WhiteboardProjectMeta,
} from '../types/whiteboard';
import { t } from '../i18n/translations';
import { loadBoardHistory, saveHistorySnapshot } from '../services/firestoreService';

interface ProjectsModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  userId: string | null;
  emailVerified: boolean;
  currentBoardId: string;
  currentPages: WhiteboardPageData[];
  boards: WhiteboardProjectMeta[];
  onCreateBoard: (title: string) => void;
  onOpenBoard: (board: WhiteboardProjectMeta) => void;
  onDeleteBoard: (boardId: string) => void;
  onRestoreHistory: (pages: WhiteboardPageData[]) => void;
  onOpenAuth: () => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  open,
  onClose,
  lang,
  userId,
  emailVerified,
  currentBoardId,
  currentPages,
  boards,
  onCreateBoard,
  onOpenBoard,
  onDeleteBoard,
  onRestoreHistory,
  onOpenAuth,
}) => {
  const copy = t(lang);
  const [newTitle, setNewTitle] = useState('');
  const [historyList, setHistoryList] = useState<ProjectHistorySnapshot[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingSnap, setSavingSnap] = useState(false);

  const canSync = Boolean(userId && emailVerified);

  useEffect(() => {
    if (!open || !canSync || !userId) return;
    const existsInCloud = boards.some((b) => b.id === currentBoardId);
    if (!existsInCloud) {
      setHistoryList([]);
      return;
    }
    setLoadingHistory(true);
    loadBoardHistory(currentBoardId, userId)
      .then((list) => setHistoryList(list))
      .catch((err) => console.error(err))
      .finally(() => setLoadingHistory(false));
  }, [boards, canSync, currentBoardId, open, userId]);

  if (!open) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim() || copy.untitledBoard;
    onCreateBoard(title);
    setNewTitle('');
    onClose();
  };

  const handleSaveSnapshot = async () => {
    if (!userId || !canSync) return;
    setSavingSnap(true);
    try {
      await saveHistorySnapshot({
        boardId: currentBoardId,
        ownerId: userId,
        summary: `Manual save (${currentPages.length} pages)`,
        pages: currentPages,
      });
      const updated = await loadBoardHistory(currentBoardId, userId);
      setHistoryList(updated);
    } finally {
      setSavingSnap(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {copy.projectsModal.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Create New Whiteboard */}
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={copy.projectsModal.boardTitlePlaceholder}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              {copy.projectsModal.newBoard}
            </button>
          </form>

          {!canSync ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-800 dark:bg-slate-950">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {copy.projectsModal.signInPrompt}
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                {copy.signIn}
              </button>
            </div>
          ) : (
            <>
              {/* Saved Cloud Boards */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {copy.projectsModal.savedBoards}
                </h3>
                {boards.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {copy.projectsModal.emptyBoards}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {boards.map((board) => {
                      const isCurrent = board.id === currentBoardId;
                      return (
                        <div
                          key={board.id}
                          className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                            isCurrent
                              ? 'border-blue-500 bg-blue-50/40 dark:border-blue-700 dark:bg-blue-950/30'
                              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'
                          }`}
                        >
                          <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                            {board.thumbnailDataUrl ? (
                              <img
                                src={board.thumbnailDataUrl}
                                alt={board.title}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                                {board.pageCount}p
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {board.title}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {board.pageCount} {copy.page} ·{' '}
                              {board.updatedAt
                                ? new Date(board.updatedAt).toLocaleDateString()
                                : ''}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenBoard(board);
                                  onClose();
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-800 dark:bg-blue-600"
                              >
                                <FolderOpen className="h-3 w-3" />
                                {copy.projectsModal.open}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteBoard(board.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                              >
                                <Trash2 className="h-3 w-3" />
                                {copy.projectsModal.delete}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Current Project History */}
              <div className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <History className="h-4 w-4 text-blue-600" />
                    {copy.projectsModal.historyTitle}
                  </h3>
                  <button
                    type="button"
                    disabled={savingSnap}
                    onClick={handleSaveSnapshot}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {savingSnap && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {copy.projectsModal.saveSnapshot}
                  </button>
                </div>

                {loadingHistory ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading history...
                  </div>
                ) : historyList.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'km'
                      ? 'មិនទាន់មានកំណែប្រវត្តិសម្រាប់ក្ដារខៀននេះទេ។'
                      : 'No saved version snapshots for this board yet.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {historyList.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950"
                      >
                        <div>
                          <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                            {entry.summary}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {new Date(entry.createdAt).toLocaleString()} · {entry.pageCount}p ·{' '}
                            {entry.itemCount} items
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onRestoreHistory(entry.snapshotPages);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {copy.projectsModal.restore}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
