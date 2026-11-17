import { jsPDF } from 'jspdf';
import type {
  BackgroundStyle,
  BoardSurfaceTheme,
  CanvasItem,
  ThemeMode,
  WhiteboardPageData,
} from '../types/whiteboard';

export const BOARD_WIDTH = 1600;
export const BOARD_HEIGHT = 1000;

export const BOARD_SURFACE_CONFIG: Record<
  BoardSurfaceTheme,
  { bg: string; defaultPen: string; gridColor: string; dotColor: string; axisColor: string }
> = {
  chalkboard: {
    bg: '#143d29',
    defaultPen: '#ffffff',
    gridColor: 'rgba(255, 255, 255, 0.12)',
    dotColor: 'rgba(255, 255, 255, 0.24)',
    axisColor: '#38bdf8',
  },
  whiteboard: {
    bg: '#ffffff',
    defaultPen: '#0f172a',
    gridColor: 'rgba(100, 116, 139, 0.16)',
    dotColor: 'rgba(100, 116, 139, 0.28)',
    axisColor: '#0284c7',
  },
  blackboard: {
    bg: '#0f172a',
    defaultPen: '#fde047',
    gridColor: 'rgba(148, 163, 184, 0.14)',
    dotColor: 'rgba(148, 163, 184, 0.25)',
    axisColor: '#38bdf8',
  },
};

export function svgMarkupToDataUrl(svgMarkup: string): string {
  const encoded = btoa(unescape(encodeURIComponent(svgMarkup)));
  return `data:image/svg+xml;base64,${encoded}`;
}

export function normalizeKhmerDigits(str: string): string {
  const kh = '០១២៣៤៥៦៧៨៩';
  return str.replace(/[០-៩]/g, (d) => String(kh.indexOf(d)));
}

export function decimalToFraction(val: number): string {
  if (!Number.isFinite(val)) return String(val);
  if (Number.isInteger(val)) return String(val);
  const sign = val < 0 ? -1 : 1;
  const absVal = Math.abs(val);
  const tolerance = 1.0e-6;
  let h1 = 1;
  let h2 = 0;
  let k1 = 0;
  let k2 = 1;
  let b = absVal;
  let iter = 0;
  do {
    const a = Math.floor(b);
    let aux = h1;
    h1 = a * h1 + h2;
    h2 = aux;
    aux = k1;
    k1 = a * k1 + k2;
    k2 = aux;
    if (Math.abs(b - a) < 1e-12) break;
    b = 1 / (b - a);
    iter++;
  } while (Math.abs(absVal - h1 / k1) > absVal * tolerance && k1 <= 1000 && iter < 32);
  const num = sign * h1;
  return k1 === 1 ? String(num) : `${num}/${k1}`;
}

export function compileMathExpression(exprStr: string): (x: number) => number {
  const normalized = normalizeKhmerDigits(exprStr.trim())
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**')
    .replace(/(\d)(x)/gi, '$1*$2')
    .replace(/(x)(\()/gi, '$1*$2')
    .replace(/(\))(\()/g, '$1*$2')
    .replace(/(\))(x)/gi, '$1*$2');

  if (!/^[0-9xX+\-*/().,\s_a-zA-Z*]+$/.test(normalized)) {
    throw new Error('Unsupported characters in formula');
  }

  // Safely bind standard Math functions without using `with`
  const fn = new Function(
    'x',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'sqrt',
    'abs',
    'log',
    'exp',
    'pow',
    'floor',
    'ceil',
    'round',
    'min',
    'max',
    'pi',
    'PI',
    'e',
    'E',
    `"use strict"; return (${normalized});`,
  ) as (...args: unknown[]) => number;

  return (x: number) =>
    fn(
      x,
      Math.sin,
      Math.cos,
      Math.tan,
      Math.asin,
      Math.acos,
      Math.atan,
      Math.sqrt,
      Math.abs,
      Math.log,
      Math.exp,
      Math.pow,
      Math.floor,
      Math.ceil,
      Math.round,
      Math.min,
      Math.max,
      Math.PI,
      Math.PI,
      Math.E,
      Math.E,
    );
}

function drawArrowHead(
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

export function drawCoordinateAxes2DOnCtx(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  lineWidth = 2,
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.font = 'bold 15px "Inter", "DM Sans", sans-serif';

  ctx.beginPath();
  ctx.moveTo(x + 8, cy);
  ctx.lineTo(x + w - 8, cy);
  ctx.moveTo(cx, y + h - 8);
  ctx.lineTo(cx, y + 8);
  ctx.stroke();
  drawArrowHead(ctx, x + 8, cy, x + w - 8, cy, 10);
  drawArrowHead(ctx, cx, y + h - 8, cx, y + 8, 10);

  const unit = 36;
  for (let gx = cx + unit; gx < x + w - 18; gx += unit) {
    ctx.beginPath();
    ctx.moveTo(gx, cy - 4);
    ctx.lineTo(gx, cy + 4);
    ctx.stroke();
  }
  for (let gx = cx - unit; gx > x + 18; gx -= unit) {
    ctx.beginPath();
    ctx.moveTo(gx, cy - 4);
    ctx.lineTo(gx, cy + 4);
    ctx.stroke();
  }
  for (let gy = cy - unit; gy > y + 18; gy -= unit) {
    ctx.beginPath();
    ctx.moveTo(cx - 4, gy);
    ctx.lineTo(cx + 4, gy);
    ctx.stroke();
  }
  for (let gy = cy + unit; gy < y + h - 18; gy += unit) {
    ctx.beginPath();
    ctx.moveTo(cx - 4, gy);
    ctx.lineTo(cx + 4, gy);
    ctx.stroke();
  }

  ctx.fillText('O', cx - 16, cy + 18);
  ctx.fillText('x', x + w - 16, cy + 18);
  ctx.fillText('y', cx + 10, y + 18);
  ctx.restore();
}

export function generateFunctionGraphDataUrl(
  fnStr: string,
  includeAxes: boolean,
  boardTheme: BoardSurfaceTheme,
): string {
  const fn = compileMathExpression(fnStr);
  // Test evaluate to catch syntax/runtime errors before rendering
  fn(1);

  const w = 520;
  const h = 400;
  const scale = 4;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.scale(scale, scale);

  const axisColor = boardTheme === 'whiteboard' ? '#475569' : '#94a3b8';
  const curveColor = boardTheme === 'whiteboard' ? '#0284c7' : '#38bdf8';

  if (includeAxes) {
    drawCoordinateAxes2DOnCtx(ctx, 12, 12, w - 24, h - 24, axisColor, 2);
  }

  const cx = w / 2;
  const cy = h / 2;
  const unit = 36;

  ctx.save();
  ctx.strokeStyle = curveColor;
  ctx.lineWidth = 3.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  for (let px = 20; px <= w - 20; px += 2) {
    const mathX = (px - cx) / unit;
    let mathY: number;
    try {
      mathY = fn(mathX);
    } catch {
      started = false;
      continue;
    }
    if (typeof mathY !== 'number' || !Number.isFinite(mathY)) {
      started = false;
      continue;
    }
    const py = cy - mathY * unit;
    if (py < 12 || py > h - 12) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  ctx.fillStyle = curveColor;
  ctx.font = 'bold 17px "JetBrains Mono", "Inter", sans-serif';
  ctx.fillText(`y = ${fnStr}`, 20, 30);
  ctx.restore();

  return c.toDataURL('image/png');
}

export function generateUnitCircleDataUrl(boardTheme: BoardSurfaceTheme): string {
  const w = 440;
  const h = 380;
  const scale = 4;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.scale(scale, scale);

  const axisColor = boardTheme === 'whiteboard' ? '#334155' : '#e2e8f0';
  const circleColor = boardTheme === 'whiteboard' ? '#d97706' : '#fbbf24';
  drawCoordinateAxes2DOnCtx(ctx, 14, 14, w - 28, h - 28, axisColor, 2);

  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.34;

  ctx.save();
  ctx.strokeStyle = circleColor;
  ctx.fillStyle = circleColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = 'bold 14px "Inter", sans-serif';
  ctx.fillText('1', cx + r + 8, cy - 6);
  ctx.fillText('-1', cx - r - 22, cy - 6);
  ctx.fillText('1', cx + 8, cy - r - 8);
  ctx.fillText('-1', cx + 8, cy + r + 16);
  ctx.fillText('sin / cos', 18, 28);
  ctx.restore();

  return c.toDataURL('image/png');
}

export function generateSpaceSolidDataUrl(
  solidType: 'cube' | 'cylinder' | 'cone' | 'pyramid' | 'sphere' | 'prism',
  strokeColor: string,
): string {
  const w = 260;
  const h = 260;
  const scale = 4;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.scale(scale, scale);

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (solidType === 'cube') {
    const s = 136;
    const off = 46;
    const fx = 36;
    const fy = 78;
    const bx = fx + off;
    const by = fy - off;
    ctx.strokeRect(fx, fy, s, s);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + s, by);
    ctx.lineTo(fx + s, fy);
    ctx.moveTo(bx + s, by);
    ctx.lineTo(bx + s, by + s);
    ctx.lineTo(fx + s, fy + s);
    ctx.stroke();
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by + s);
    ctx.lineTo(fx, fy + s);
    ctx.moveTo(bx, by + s);
    ctx.lineTo(bx + s, by + s);
    ctx.stroke();
  } else if (solidType === 'cylinder') {
    const cx = w / 2;
    const topY = 52;
    const botY = 208;
    const rx = 70;
    const ry = 22;
    ctx.beginPath();
    ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
    ctx.moveTo(cx - rx, topY);
    ctx.lineTo(cx - rx, botY);
    ctx.moveTo(cx + rx, topY);
    ctx.lineTo(cx + rx, botY);
    ctx.ellipse(cx, botY, rx, ry, 0, 0, Math.PI);
    ctx.stroke();
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.ellipse(cx, botY, rx, ry, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (solidType === 'cone') {
    const cx = w / 2;
    const apexY = 40;
    const botY = 208;
    const rx = 76;
    const ry = 24;
    ctx.beginPath();
    ctx.moveTo(cx, apexY);
    ctx.lineTo(cx - rx, botY);
    ctx.moveTo(cx, apexY);
    ctx.lineTo(cx + rx, botY);
    ctx.ellipse(cx, botY, rx, ry, 0, 0, Math.PI);
    ctx.stroke();
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.ellipse(cx, botY, rx, ry, 0, Math.PI, Math.PI * 2);
    ctx.moveTo(cx, apexY);
    ctx.lineTo(cx, botY);
    ctx.stroke();
  } else if (solidType === 'pyramid') {
    const apex = { x: 130, y: 36 };
    const p1 = { x: 46, y: 192 };
    const p2 = { x: 168, y: 218 };
    const p3 = { x: 222, y: 164 };
    const p4 = { x: 98, y: 146 };
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.moveTo(p4.x, p4.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
  } else if (solidType === 'sphere') {
    const cx = w / 2;
    const cy = h / 2;
    const r = 88;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.ellipse(cx, cy, r, r * 0.3, 0, 0, Math.PI);
    ctx.stroke();
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.3, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (solidType === 'prism') {
    const t1 = { x: 112, y: 34 };
    const t2 = { x: 52, y: 86 };
    const t3 = { x: 196, y: 86 };
    const b1 = { x: 112, y: 158 };
    const b2 = { x: 52, y: 212 };
    const b3 = { x: 196, y: 212 };
    ctx.beginPath();
    ctx.moveTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.moveTo(t2.x, t2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(b3.x, b3.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.stroke();
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(t1.x, t1.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b3.x, b3.y);
    ctx.stroke();
  }

  ctx.restore();
  return c.toDataURL('image/png');
}

export function drawBackgroundPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: BackgroundStyle,
  theme: ThemeMode,
  boardTheme?: BoardSurfaceTheme,
) {
  const effectiveSurface: BoardSurfaceTheme =
    boardTheme || (theme === 'dark' ? 'blackboard' : 'whiteboard');
  const palette = BOARD_SURFACE_CONFIG[effectiveSurface];

  ctx.save();
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  if (style === 'plain') {
    ctx.restore();
    return;
  }

  const lineColor = palette.gridColor;
  const dotColor = palette.dotColor;

  if (style === 'dots') {
    ctx.fillStyle = dotColor;
    const step = 32;
    for (let x = step; x < width; x += step) {
      for (let y = step; y < height; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (style === 'grid') {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    const step = 40;
    ctx.beginPath();
    for (let x = 0; x <= width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  } else if (style === 'ruled') {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    const step = 44;
    ctx.beginPath();
    for (let y = step * 2; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

export function drawCanvasItem(
  ctx: CanvasRenderingContext2D,
  item: CanvasItem,
  imageCache: Map<string, HTMLImageElement>,
  onImageLoaded?: () => void,
) {
  ctx.save();
  ctx.globalAlpha = item.opacity ?? 1;

  if (item.type === 'stroke') {
    const pts = item.points;
    if (pts.length === 0) {
      ctx.restore();
      return;
    }
    if (item.isHighlighter) {
      ctx.globalAlpha = 0.35;
    }
    ctx.strokeStyle = item.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (pts.length === 1) {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(1, item.strokeWidth / 2), 0, Math.PI * 2);
      ctx.fill();
    } else if (pts.length === 2) {
      const pressure = pts[1].p !== undefined ? 0.55 + pts[1].p * 0.9 : 1;
      ctx.lineWidth = Math.max(1, item.strokeWidth * pressure);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.stroke();
    } else {
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        const pPrev = i > 1 ? pts[i - 2] : p0;
        const mid0x = (pPrev.x + p0.x) / 2;
        const mid0y = (pPrev.y + p0.y) / 2;
        const mid1x = (p0.x + p1.x) / 2;
        const mid1y = (p0.y + p1.y) / 2;
        const pressure = p1.p !== undefined ? 0.55 + p1.p * 0.9 : 1;
        ctx.lineWidth = Math.max(1, item.strokeWidth * pressure);
        ctx.beginPath();
        ctx.moveTo(i === 1 ? p0.x : mid0x, i === 1 ? p0.y : mid0y);
        ctx.quadraticCurveTo(p0.x, p0.y, i === pts.length - 1 ? p1.x : mid1x, i === pts.length - 1 ? p1.y : mid1y);
        ctx.stroke();
      }
    }
  } else if (item.type === 'shape') {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const { x, y, width, height, shapeKind, fillColor } = item;
    if (fillColor) {
      ctx.fillStyle = fillColor;
    }

    if (shapeKind === 'rect') {
      if (fillColor) ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
    } else if (shapeKind === 'circle') {
      ctx.beginPath();
      ctx.ellipse(
        x + width / 2,
        y + height / 2,
        Math.abs(width) / 2,
        Math.abs(height) / 2,
        0,
        0,
        Math.PI * 2,
      );
      if (fillColor) ctx.fill();
      ctx.stroke();
    } else if (shapeKind === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(x + width / 2, y);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x, y + height);
      ctx.closePath();
      if (fillColor) ctx.fill();
      ctx.stroke();
    } else if (shapeKind === 'line') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y + height);
      ctx.stroke();
    } else if (shapeKind === 'arrow') {
      const x1 = x;
      const y1 = y;
      const x2 = x + width;
      const y2 = y + height;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(12, item.strokeWidth * 3.5);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle - Math.PI / 6),
        y2 - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle + Math.PI / 6),
        y2 - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
    }
  } else if (item.type === 'text') {
    ctx.fillStyle = item.color;
    const weight = item.fontWeight === 'bold' ? '700' : '500';
    ctx.font = `${weight} ${item.fontSize}px "Kantumruy Pro", "DM Sans", "Noto Sans Khmer", sans-serif`;
    ctx.textBaseline = 'top';

    const lines = item.text.split('\n');
    const lineHeight = item.fontSize * 1.4;
    lines.forEach((line, idx) => {
      ctx.fillText(line, item.x, item.y + idx * lineHeight);
    });
  } else if (item.type === 'image') {
    let img = imageCache.get(item.dataUrl);
    if (!img) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        onImageLoaded?.();
      };
      img.src = item.dataUrl;
      imageCache.set(item.dataUrl, img);
    }
    if (img.complete && img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, item.x, item.y, item.width, item.height);
    }
  }

  ctx.restore();
}

async function ensureImagesLoaded(items: CanvasItem[], imageCache: Map<string, HTMLImageElement>) {
  const promises: Promise<void>[] = [];
  for (const item of items) {
    if (item.type === 'image') {
      let img = imageCache.get(item.dataUrl);
      if (!img) {
        img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = item.dataUrl;
        imageCache.set(item.dataUrl, img);
      }
      if (!img.complete) {
        promises.push(
          new Promise((resolve) => {
            img!.onload = () => resolve();
            img!.onerror = () => resolve();
          }),
        );
      }
    }
  }
  await Promise.all(promises);
}

export async function renderPageToDataUrl(
  page: WhiteboardPageData,
  bgStyle: BackgroundStyle,
  theme: ThemeMode,
  format: 'image/png' | 'image/jpeg' = 'image/png',
  scale = 1,
  boardTheme?: BoardSurfaceTheme,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(BOARD_WIDTH * scale);
  canvas.height = Math.round(BOARD_HEIGHT * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cache = new Map<string, HTMLImageElement>();
  await ensureImagesLoaded(page.items, cache);

  ctx.scale(scale, scale);
  drawBackgroundPattern(ctx, BOARD_WIDTH, BOARD_HEIGHT, bgStyle, theme, boardTheme);
  for (const item of page.items) {
    drawCanvasItem(ctx, item, cache);
  }
  return canvas.toDataURL(format, 0.92);
}

export function triggerDownload(dataUrlOrBlob: string | Blob, filename: string) {
  const link = document.createElement('a');
  if (typeof dataUrlOrBlob === 'string') {
    link.href = dataUrlOrBlob;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    const url = URL.createObjectURL(dataUrlOrBlob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function exportBoardAsPdf(
  pages: WhiteboardPageData[],
  bgStyle: BackgroundStyle,
  theme: ThemeMode,
  title: string,
  boardTheme?: BoardSurfaceTheme,
) {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [BOARD_WIDTH, BOARD_HEIGHT],
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage([BOARD_WIDTH, BOARD_HEIGHT], 'landscape');
    const dataUrl = await renderPageToDataUrl(pages[i], bgStyle, theme, 'image/jpeg', 2, boardTheme);
    pdf.addImage(dataUrl, 'JPEG', 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  }

  const safeName = (title || 'whiteboard').replace(/[^a-zA-Z0-9_\-\u1780-\u17FF]+/g, '_');
  pdf.save(`${safeName}.pdf`);
}
