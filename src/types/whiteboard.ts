export type Language = 'km' | 'en';
export type ThemeMode = 'light' | 'dark';
export type BackgroundStyle = 'plain' | 'dots' | 'grid' | 'ruled';
export type BoardSurfaceTheme = 'chalkboard' | 'whiteboard' | 'blackboard';

export type ToolType =
  | 'select'
  | 'pan'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'laser'
  | 'line'
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'arrow'
  | 'axes2d'
  | 'axes3d'
  | 'smart_shape'
  | 'text';

export interface StrokePoint {
  x: number;
  y: number;
  p?: number; // pressure 0..1
}

export interface DetectedShapeInfo {
  type: 'line' | 'rect' | 'circle' | 'triangle' | 'arrow' | 'polygon' | 'axes2d' | 'axes3d' | 'cube' | 'cylinder' | 'cone' | 'pyramid' | 'sphere' | 'prism';
  points: StrokePoint[];
  bounds: { x: number; y: number; width: number; height: number };
  label: string;
}

export interface DetectedEquationResult {
  expression: string;
  answer: string;
  fraction: string;
  displayAnswer: string;
  isEquationOrFunction: boolean;
  plottableFn: string;
  suggested3D: string;
}

export type Quick3DShapeMode =
  | 'blueprint'
  | 'extrude'
  | 'cube'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'pyramid'
  | 'revolve'
  | 'hologram';

export interface BaseCanvasItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  opacity?: number;
}

export interface StrokeItem extends BaseCanvasItem {
  type: 'stroke';
  points: StrokePoint[];
  isHighlighter?: boolean;
}

export interface ShapeItem extends BaseCanvasItem {
  type: 'shape';
  shapeKind: 'line' | 'rect' | 'circle' | 'triangle' | 'arrow';
  fillColor?: string;
}

export interface TextItem extends BaseCanvasItem {
  type: 'text';
  text: string;
  fontSize: number;
  fontWeight?: 'normal' | 'bold';
}

export interface ImageItem extends BaseCanvasItem {
  type: 'image';
  dataUrl: string;
  label?: string;
}

export type CanvasItem = StrokeItem | ShapeItem | TextItem | ImageItem;

export interface WhiteboardPageData {
  id: string;
  pageIndex: number;
  title: string;
  items: CanvasItem[];
}

export interface WhiteboardProjectMeta {
  id: string;
  ownerId: string;
  title: string;
  pageCount: number;
  backgroundStyle: BackgroundStyle;
  thumbnailDataUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectHistorySnapshot {
  id: string;
  ownerId: string;
  boardId: string;
  summary: string;
  pageCount: number;
  itemCount: number;
  snapshotPages: WhiteboardPageData[];
  createdAt: string;
}

export type Geometry3DKind =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'capsule'
  | 'dodecahedron'
  | 'octahedron'
  | 'torusknot';

export interface Model3DPart {
  id: string;
  name: string;
  geometry: Geometry3DKind;
  dimensions: [number, number, number]; // e.g. [width, height, depth] or [radius, height, radialSegments]
  position: [number, number, number];
  rotation: [number, number, number]; // radians
  scale: [number, number, number];
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}

export interface Model3DBlueprint {
  title: string;
  category: string;
  description: string;
  parts: Model3DPart[];
}

export interface MathSolution {
  expression: string;
  answer: string;
  topic: string;
  steps: string[];
  explanation: string;
}

export interface TutorQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface TutorChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  diagramSvg?: string;
  timestamp: number;
}
