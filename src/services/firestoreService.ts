import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  BackgroundStyle,
  Language,
  ProjectHistorySnapshot,
  ThemeMode,
  WhiteboardPageData,
  WhiteboardProjectMeta,
} from '../types/whiteboard';

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'id_default';
}

// Strip undefined properties recursively before Firestore writes
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Timestamp)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export async function upsertUserProfile(
  user: User,
  preferredLanguage: Language,
  preferredTheme: ThemeMode,
): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid);
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  try {
    const existingSnap = await getDoc(ref);
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Whiteboard User').slice(0, 80);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        uid,
        displayName,
        ...(user.email ? { email: user.email.slice(0, 160) } : {}),
        preferredLanguage,
        preferredTheme,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName,
        ...(user.email ? { email: user.email.slice(0, 160) } : {}),
        preferredLanguage,
        preferredTheme,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserBoards(
  ownerId: string,
  onData: (boards: WhiteboardProjectMeta[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  const path = 'boards';
  const q = query(collection(db, path), where('ownerId', '==', sanitizeId(ownerId)), orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: WhiteboardProjectMeta[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId ?? ownerId),
          title: String(data.title ?? 'Untitled Whiteboard'),
          pageCount: Number(data.pageCount ?? 1),
          backgroundStyle: (data.backgroundStyle as BackgroundStyle) ?? 'dots',
          thumbnailDataUrl: typeof data.thumbnailDataUrl === 'string' ? data.thumbnailDataUrl : undefined,
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    },
  );
}

export async function saveBoardToFirestore(params: {
  boardId: string;
  ownerId: string;
  title: string;
  backgroundStyle: BackgroundStyle;
  pages: WhiteboardPageData[];
  thumbnailDataUrl?: string;
  isNew?: boolean;
}): Promise<void> {
  const boardId = sanitizeId(params.boardId);
  const ownerId = sanitizeId(params.ownerId);
  const boardPath = `boards/${boardId}`;
  const boardRef = doc(db, 'boards', boardId);

  const safeTitle = params.title.trim().slice(0, 120) || 'Untitled Whiteboard';
  const safePages = params.pages.slice(0, 20);

  try {
    const existingBoard = await getDoc(boardRef);
    const thumb =
      params.thumbnailDataUrl && params.thumbnailDataUrl.length <= 120000
        ? params.thumbnailDataUrl
        : undefined;

    if (!existingBoard.exists()) {
      await setDoc(boardRef, {
        ownerId,
        title: safeTitle,
        pageCount: safePages.length,
        backgroundStyle: params.backgroundStyle,
        ...(thumb ? { thumbnailDataUrl: thumb } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(boardRef, {
        title: safeTitle,
        pageCount: safePages.length,
        backgroundStyle: params.backgroundStyle,
        ...(thumb ? { thumbnailDataUrl: thumb } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    // Sync pages subcollection
    const existingPagesSnap = await getDocs(
      query(collection(db, 'boards', boardId, 'pages'), where('ownerId', '==', ownerId)),
    );
    const keepIds = new Set(safePages.map((p) => sanitizeId(p.id)));
    const batch = writeBatch(db);

    for (const oldDoc of existingPagesSnap.docs) {
      if (!keepIds.has(oldDoc.id)) {
        batch.delete(oldDoc.ref);
      }
    }

    safePages.forEach((page, idx) => {
      const pageId = sanitizeId(page.id);
      const pageRef = doc(db, 'boards', boardId, 'pages', pageId);
      const safeItems = stripUndefined(page.items.slice(0, 500));
      batch.set(pageRef, {
        ownerId,
        boardId,
        pageIndex: idx,
        title: (page.title || `Page ${idx + 1}`).slice(0, 80),
        items: safeItems,
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, boardPath);
  }
}

export async function loadBoardPages(boardId: string, ownerId: string): Promise<WhiteboardPageData[]> {
  const safeBoardId = sanitizeId(boardId);
  const path = `boards/${safeBoardId}/pages`;
  try {
    const q = query(
      collection(db, 'boards', safeBoardId, 'pages'),
      where('ownerId', '==', sanitizeId(ownerId)),
      orderBy('pageIndex', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d, idx) => {
      const data = d.data();
      return {
        id: d.id,
        pageIndex: typeof data.pageIndex === 'number' ? data.pageIndex : idx,
        title: String(data.title ?? `Page ${idx + 1}`),
        items: Array.isArray(data.items) ? data.items : [],
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function deleteBoardFromFirestore(boardId: string, ownerId: string): Promise<void> {
  const safeBoardId = sanitizeId(boardId);
  const safeOwner = sanitizeId(ownerId);
  const path = `boards/${safeBoardId}`;
  try {
    // Delete subcollections BEFORE parent board so Master Gate isBoardOwner(boardId) stays valid
    const pagesSnap = await getDocs(
      query(collection(db, 'boards', safeBoardId, 'pages'), where('ownerId', '==', safeOwner)),
    );
    const historySnap = await getDocs(
      query(collection(db, 'boards', safeBoardId, 'history'), where('ownerId', '==', safeOwner)),
    );

    const batch = writeBatch(db);
    pagesSnap.docs.forEach((d) => batch.delete(d.ref));
    historySnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    await deleteDoc(doc(db, 'boards', safeBoardId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveHistorySnapshot(params: {
  boardId: string;
  ownerId: string;
  summary: string;
  pages: WhiteboardPageData[];
}): Promise<void> {
  const boardId = sanitizeId(params.boardId);
  const ownerId = sanitizeId(params.ownerId);
  const historyId = `hist_${Date.now()}`;
  const path = `boards/${boardId}/history/${historyId}`;
  const safePages = stripUndefined(params.pages.slice(0, 20));
  const itemCount = safePages.reduce((sum, p) => sum + p.items.length, 0);

  try {
    await setDoc(doc(db, 'boards', boardId, 'history', historyId), {
      ownerId,
      boardId,
      summary: params.summary.slice(0, 160),
      pageCount: safePages.length,
      itemCount,
      snapshotPages: safePages,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function loadBoardHistory(
  boardId: string,
  ownerId: string,
): Promise<ProjectHistorySnapshot[]> {
  const safeBoardId = sanitizeId(boardId);
  const path = `boards/${safeBoardId}/history`;
  try {
    const q = query(
      collection(db, 'boards', safeBoardId, 'history'),
      where('ownerId', '==', sanitizeId(ownerId)),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ownerId: String(data.ownerId ?? ownerId),
        boardId: safeBoardId,
        summary: String(data.summary ?? 'Snapshot'),
        pageCount: Number(data.pageCount ?? 1),
        itemCount: Number(data.itemCount ?? 0),
        snapshotPages: Array.isArray(data.snapshotPages) ? data.snapshotPages : [],
        createdAt: timestampToIso(data.createdAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
