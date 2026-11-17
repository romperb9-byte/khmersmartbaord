import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import {
  Box,
  Boxes,
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  RotateCcw,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import type {
  DetectedShapeInfo,
  Language,
  Model3DBlueprint,
  Model3DPart,
  Quick3DShapeMode,
  ThemeMode,
} from '../types/whiteboard';
import { t } from '../i18n/translations';
import { compileMathExpression, triggerDownload } from '../utils/exportUtils';

interface ThreeDViewportProps {
  blueprint: Model3DBlueprint | null;
  quickMode: Quick3DShapeMode;
  onChangeQuickMode: (mode: Quick3DShapeMode) => void;
  detectedShape: DetectedShapeInfo | null;
  hologramImageUrl: string | null;
  equationPlotFn: string | null;
  onUpdateBlueprint: (next: Model3DBlueprint) => void;
  onSnapshotToBoard: (dataUrl: string, title: string) => void;
  theme: ThemeMode;
  lang: Language;
}

const QUICK_FORMULAS: Record<
  Exclude<Quick3DShapeMode, 'blueprint'>,
  { titleKm: string; titleEn: string; vol: string; area: string }
> = {
  extrude: {
    titleKm: 'គំរូ 3D ដូចរូបដើម (Exact 3D Match)',
    titleEn: 'Exact Board Shape Extrude 3D',
    vol: 'V = A_face × depth',
    area: 'S = 2A_face + P × depth',
  },
  cube: {
    titleKm: 'គូប / ប្រអប់កែង (Cube / Box)',
    titleEn: 'Cube / Rectangular Prism',
    vol: 'V = a × b × h',
    area: 'S = 2(ab + bh + ah)',
  },
  sphere: {
    titleKm: 'ស្វ៊ែរ (Sphere)',
    titleEn: 'Sphere',
    vol: 'V = (4/3)πr³',
    area: 'S = 4πr²',
  },
  cylinder: {
    titleKm: 'ស៊ីឡាំង (Cylinder)',
    titleEn: 'Cylinder',
    vol: 'V = πr²h',
    area: 'S = 2πr(r + h)',
  },
  cone: {
    titleKm: 'កោណ (Cone)',
    titleEn: 'Cone',
    vol: 'V = (1/3)πr²h',
    area: 'S = πr(r + l)',
  },
  pyramid: {
    titleKm: 'ពីរ៉ាមីត (Pyramid)',
    titleEn: 'Square Pyramid',
    vol: 'V = (1/3) × A_base × h',
    area: 'S = A_base + A_lateral',
  },
  revolve: {
    titleKm: 'រូបបង្វិល 360° (Lathe 3D)',
    titleEn: '360° Lathe Solid of Revolution',
    vol: 'V = π ∫ [f(x)]² dx',
    area: "S = 2π ∫ f(x)√(1 + [f'(x)]²) dx",
  },
  hologram: {
    titleKm: 'ផ្ទាំងរូបភាព 3D ក្នុងលំហ',
    titleEn: '3D Hologram Board Card',
    vol: 'Texture-mapped 3D Slab',
    area: 'Inspect & Export GLB/OBJ',
  },
};

function buildPartGeometry(part: Model3DPart): THREE.BufferGeometry {
  const d = part.dimensions && part.dimensions.length >= 3 ? part.dimensions : [1, 1, 1];
  const d0 = Math.max(0.04, Math.abs(d[0] || 1));
  const d1 = Math.max(0.04, Math.abs(d[1] || 1));
  const d2 = Math.max(0.04, Math.abs(d[2] || 1));

  switch (part.geometry) {
    case 'sphere':
      return new THREE.SphereGeometry(d0, 28, 20);
    case 'cylinder':
      return new THREE.CylinderGeometry(
        Math.max(0.02, d[0] ?? 0.5),
        Math.max(0.02, d[1] ?? 0.5),
        d2,
        28,
      );
    case 'cone':
      return new THREE.ConeGeometry(d0, d1, 28);
    case 'torus':
      return new THREE.TorusGeometry(d0, Math.min(d0 * 0.48, d1 * 0.4 || 0.2), 16, 40);
    case 'capsule':
      return new THREE.CapsuleGeometry(d0, d1, 8, 16);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(d0, 0);
    case 'octahedron':
      return new THREE.OctahedronGeometry(d0, 0);
    case 'torusknot':
      return new THREE.TorusKnotGeometry(d0, Math.min(d0 * 0.35, d1 * 0.3 || 0.16), 64, 12);
    case 'box':
    default:
      return new THREE.BoxGeometry(d0, d1, d2);
  }
}

function buildQuickShapeGeometry(
  mode: Exclude<Quick3DShapeMode, 'blueprint'>,
  depth: number,
  detectedShape: DetectedShapeInfo | null,
  equationPlotFn: string | null,
): THREE.BufferGeometry {
  const b = detectedShape?.bounds || { x: 0, y: 0, width: 160, height: 140 };
  const aspect = Math.max(0.4, Math.min(2.4, (b.width || 160) / (b.height || 140)));

  if (mode === 'extrude') {
    if (detectedShape?.type === 'circle') {
      const geo = new THREE.SphereGeometry(1.15, 36, 28);
      geo.scale(aspect >= 1 ? 1.15 : aspect, aspect >= 1 ? 1 / aspect : 1.15, depth);
      return geo;
    }
    if (detectedShape?.type === 'rect') {
      return new THREE.BoxGeometry(
        1.8 * Math.min(1.4, aspect),
        1.8 / Math.min(1.4, aspect),
        1.2 * depth,
      );
    }
    if (detectedShape?.type === 'triangle') {
      const shape = new THREE.Shape();
      const hw = 1.1 * Math.min(1.4, aspect);
      const hh = 1.1 / Math.min(1.4, aspect);
      shape.moveTo(0, hh);
      shape.lineTo(hw, -hh);
      shape.lineTo(-hw, -hh);
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: 1.0 * depth, bevelEnabled: false });
    }
    if (detectedShape?.points && detectedShape.points.length >= 3) {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const scale = 2.2 / Math.max(b.width, b.height, 1);
      const shape = new THREE.Shape();
      detectedShape.points.forEach((p, idx) => {
        const sx = (p.x - cx) * scale;
        const sy = -(p.y - cy) * scale;
        if (idx === 0) shape.moveTo(sx, sy);
        else shape.lineTo(sx, sy);
      });
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: 0.9 * depth, bevelEnabled: false });
    }
    return new THREE.BoxGeometry(1.7, 1.7, 1.7 * depth);
  }

  if (mode === 'cube') return new THREE.BoxGeometry(1.7, 1.7, 1.7 * depth);
  if (mode === 'sphere') return new THREE.SphereGeometry(1.25, 36, 28);
  if (mode === 'cylinder') return new THREE.CylinderGeometry(0.95, 0.95, 2.0 * depth, 36);
  if (mode === 'cone') return new THREE.ConeGeometry(1.1, 2.2 * depth, 36);
  if (mode === 'pyramid') return new THREE.ConeGeometry(1.25, 2.1 * depth, 4);

  if (mode === 'revolve') {
    if (equationPlotFn && equationPlotFn.trim()) {
      try {
        const fn = compileMathExpression(equationPlotFn);
        const pts: THREE.Vector2[] = [];
        for (let x = -2.2; x <= 2.2; x += 0.16) {
          const yVal = fn(x);
          if (typeof yVal === 'number' && Number.isFinite(yVal)) {
            const r = Math.max(0.08, Math.min(2.2, Math.abs(yVal) * 0.45 + 0.15));
            pts.push(new THREE.Vector2(r, x * 0.65 * depth));
          }
        }
        if (pts.length >= 3) {
          return new THREE.LatheGeometry(pts, 40);
        }
      } catch {
        // Fallback to classic sine lathe
      }
    }
    const lathePts: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const tVal = (i / 16) * Math.PI;
      lathePts.push(
        new THREE.Vector2(Math.sin(tVal) * 0.95 + 0.15, (i / 16 - 0.5) * 2.2 * depth),
      );
    }
    return new THREE.LatheGeometry(lathePts, 36);
  }

  return new THREE.BoxGeometry(2.4, 1.7, 0.16 * depth);
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.14)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const DEFAULT_BLUEPRINT: Model3DBlueprint = {
  title: 'Geometric Architectural Pavilion',
  category: 'Sample Model',
  description:
    'Interactive PBR Three.js assembly. Generate any custom 3D model from text, sketch, or image in the AI 3D Generator panel.',
  parts: [
    {
      id: 'plinth',
      name: 'Stone Plinth',
      geometry: 'box',
      dimensions: [2.6, 0.24, 2.6],
      position: [0, 0.12, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#64748B',
      roughness: 0.78,
      metalness: 0.08,
    },
    {
      id: 'pillar_1',
      name: 'Column FL',
      geometry: 'cylinder',
      dimensions: [0.1, 0.12, 1.3],
      position: [-0.95, 0.89, 0.95],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#E2E8F0',
      roughness: 0.45,
      metalness: 0.1,
    },
    {
      id: 'pillar_2',
      name: 'Column FR',
      geometry: 'cylinder',
      dimensions: [0.1, 0.12, 1.3],
      position: [0.95, 0.89, 0.95],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#E2E8F0',
      roughness: 0.45,
      metalness: 0.1,
    },
    {
      id: 'pillar_3',
      name: 'Column BL',
      geometry: 'cylinder',
      dimensions: [0.1, 0.12, 1.3],
      position: [-0.95, 0.89, -0.95],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#E2E8F0',
      roughness: 0.45,
      metalness: 0.1,
    },
    {
      id: 'pillar_4',
      name: 'Column BR',
      geometry: 'cylinder',
      dimensions: [0.1, 0.12, 1.3],
      position: [0.95, 0.89, -0.95],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#E2E8F0',
      roughness: 0.45,
      metalness: 0.1,
    },
    {
      id: 'core_orb',
      name: 'Suspended Copper Core',
      geometry: 'dodecahedron',
      dimensions: [0.46, 0, 0],
      position: [0, 0.95, 0],
      rotation: [0.3, 0.5, 0],
      scale: [1, 1, 1],
      color: '#2563EB',
      roughness: 0.22,
      metalness: 0.82,
    },
    {
      id: 'roof_base',
      name: 'Canopy Frame',
      geometry: 'box',
      dimensions: [2.45, 0.14, 2.45],
      position: [0, 1.61, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#1E293B',
      roughness: 0.35,
      metalness: 0.65,
    },
    {
      id: 'spire',
      name: 'Roof Pyramid',
      geometry: 'cone',
      dimensions: [1.55, 0.85, 4],
      position: [0, 2.1, 0],
      rotation: [0, Math.PI / 4, 0],
      scale: [1, 1, 1],
      color: '#D97706',
      roughness: 0.3,
      metalness: 0.72,
    },
  ],
};

export const ThreeDViewport: React.FC<ThreeDViewportProps> = ({
  blueprint,
  quickMode,
  onChangeQuickMode,
  detectedShape,
  hologramImageUrl,
  equationPlotFn,
  onUpdateBlueprint,
  onSnapshotToBoard,
  theme,
  lang,
}) => {
  const copy = t(lang);
  const activeModel = blueprint || DEFAULT_BLUEPRINT;

  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const isSoftwareGlRef = useRef<boolean>(false);

  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [lightIntensity, setLightIntensity] = useState(1.6);
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframeOnly, setWireframeOnly] = useState(false);
  const [quickDepth, setQuickDepth] = useState(1.0);
  const [quickColor, setQuickColor] = useState('#10b981');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  // Initialize Three.js scene once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();
    isSoftwareGlRef.current = isSoftwareGl;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'WebGL unavailable');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(300, mount.clientWidth);
    const height = Math.max(240, mount.clientHeight);
    renderer.setSize(width, height);
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.set(4.2, 3.0, 4.8);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 1.5;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0.85, 0);
    controls.autoRotate = !isSoftwareGl && autoRotateRef.current;
    controls.autoRotateSpeed = 1.4;
    controlsRef.current = controls;

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.85);
    scene.add(hemi);
    hemiLightRef.current = hemi;

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.6);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 25;
    const d = 4;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.75);
    rimLight.position.set(-5, 4, -5);
    scene.add(rimLight);

    const gridHelper = new THREE.GridHelper(12, 24, 0x64748b, 0x334155);
    gridHelper.position.y = -0.002;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.25;
    scene.add(gridHelper);

    const shadowTex = createContactShadowTexture();
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 5.5),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.65,
      }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.002;
    scene.add(shadowPlane);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    const onLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost. Waiting for restore...');
    };
    const onRestored = () => {
      setWebglError(null);
      requestRenderRef.current();
    };
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    renderer.domElement.addEventListener('webglcontextrestored', onRestored);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty || (!isSoftwareGl && autoRotateRef.current)) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };
    requestRenderRef.current = requestRender;

    controls.addEventListener('change', requestRender);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(modelGroup.children, true);
      if (hits.length > 0 && hits[0].object.userData?.partId) {
        setSelectedPartId(String(hits[0].object.userData.partId));
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onResize = () => {
      if (!mount || disposed) return;
      const w = Math.max(300, mount.clientWidth);
      const h = Math.max(240, mount.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      envTex.dispose();
      shadowTex.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const bgHex = theme === 'dark' ? 0x0b1120 : 0xf1f5f9;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.042);
    requestRenderRef.current();
  }, [theme]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (controls) {
      controls.autoRotate = !isSoftwareGlRef.current && autoRotate;
    }
    if (keyLightRef.current) {
      keyLightRef.current.intensity = lightIntensity;
    }
    if (hemiLightRef.current) {
      hemiLightRef.current.intensity = lightIntensity * 0.55;
    }
    requestRenderRef.current();
  }, [autoRotate, lightIntensity]);

  // Rebuild 3D model meshes whenever blueprint, quickMode, wireframe, depth, color, or detectedShape changes
  useEffect(() => {
    const group = modelGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh | THREE.LineSegments;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else mesh.material.dispose();
        }
      });
    }

    group.position.set(0, 0, 0);

    if (quickMode === 'blueprint') {
      for (const part of activeModel.parts) {
        const geom = buildPartGeometry(part);
        const isSelected = part.id === selectedPartId;
        const opacity = part.opacity !== undefined ? Math.max(0.1, Math.min(1, part.opacity)) : 1;
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(part.color || '#3B82F6'),
          roughness: Math.max(0.05, Math.min(1, part.roughness ?? 0.5)),
          metalness: Math.max(0, Math.min(1, part.metalness ?? 0.15)),
          emissive: isSelected
            ? new THREE.Color('#1D4ED8')
            : part.emissive
              ? new THREE.Color(part.emissive)
              : new THREE.Color(0x000000),
          emissiveIntensity: isSelected ? 0.35 : part.emissiveIntensity ?? 0,
          transparent: opacity < 1,
          opacity,
          visible: !wireframeOnly,
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = part.name;
        mesh.userData.partId = part.id;
        mesh.position.set(
          part.position?.[0] ?? 0,
          part.position?.[1] ?? 0,
          part.position?.[2] ?? 0,
        );
        mesh.rotation.set(
          part.rotation?.[0] ?? 0,
          part.rotation?.[1] ?? 0,
          part.rotation?.[2] ?? 0,
        );
        mesh.scale.set(part.scale?.[0] ?? 1, part.scale?.[1] ?? 1, part.scale?.[2] ?? 1);
        mesh.castShadow = !isSoftwareGlRef.current;
        mesh.receiveShadow = !isSoftwareGlRef.current;

        if (wireframeOnly) {
          const edgesGeo = new THREE.EdgesGeometry(geom, 22);
          const edgeLines = new THREE.LineSegments(
            edgesGeo,
            new THREE.LineBasicMaterial({ color: part.color || '#38bdf8' }),
          );
          mesh.add(edgeLines);
        }
        group.add(mesh);
      }
    } else if (quickMode === 'hologram' && hologramImageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        const aspect = Math.max(0.4, Math.min(2.2, img.width / Math.max(1, img.height)));
        const geo = new THREE.BoxGeometry(2.6, 2.6 / aspect, 0.14 * quickDepth);
        const mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.35,
          metalness: 0.05,
        });
        const slab = new THREE.Mesh(geo, mat);
        slab.position.set(0, (2.6 / aspect) / 2 + 0.05, 0);
        slab.castShadow = !isSoftwareGlRef.current;
        group.add(slab);
        requestRenderRef.current();
      };
      img.src = hologramImageUrl;
    } else {
      const geom = buildQuickShapeGeometry(quickMode, quickDepth, detectedShape, equationPlotFn);
      geom.center();
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(quickColor),
        roughness: 0.28,
        metalness: 0.18,
        side: THREE.DoubleSide,
        visible: !wireframeOnly,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = !isSoftwareGlRef.current;
      mesh.receiveShadow = !isSoftwareGlRef.current;

      const edgesGeo = new THREE.EdgesGeometry(geom, 22);
      const edgeLines = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({ color: quickColor }),
      );
      edgeLines.visible = wireframeOnly;
      mesh.add(edgeLines);

      group.add(mesh);
    }

    const box = new THREE.Box3().setFromObject(group);
    if (!box.isEmpty()) {
      group.position.y = -box.min.y;
    }

    requestRenderRef.current();
  }, [
    activeModel,
    detectedShape,
    equationPlotFn,
    hologramImageUrl,
    quickColor,
    quickDepth,
    quickMode,
    selectedPartId,
    wireframeOnly,
  ]);

  const selectedPart =
    activeModel.parts.find((p) => p.id === selectedPartId) || activeModel.parts[0] || null;

  const updateSelectedPart = (patch: Partial<Model3DPart>) => {
    if (!selectedPart) return;
    const nextParts = activeModel.parts.map((p) =>
      p.id === selectedPart.id ? { ...p, ...patch } : p,
    );
    onUpdateBlueprint({ ...activeModel, parts: nextParts });
  };

  const handleResetCamera = () => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (cam && ctrl) {
      cam.position.set(4.2, 3.0, 4.8);
      ctrl.target.set(0, 0.85, 0);
      ctrl.update();
      requestRenderRef.current();
    }
  };

  const handleSnapshot = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const title =
      quickMode === 'blueprint'
        ? activeModel.title
        : lang === 'km'
          ? QUICK_FORMULAS[quickMode].titleKm
          : QUICK_FORMULAS[quickMode].titleEn;
    onSnapshotToBoard(dataUrl, title);
  };

  const handleExport = (format: 'glb' | 'gltf' | 'obj') => {
    const group = modelGroupRef.current;
    if (!group) return;
    const rawName = quickMode === 'blueprint' ? activeModel.title : `3d_${quickMode}`;
    const safeName = (rawName || 'ai_3d_model').replace(/[^a-zA-Z0-9_\-]+/g, '_');

    if (format === 'obj') {
      const exporter = new OBJExporter();
      const objText = exporter.parse(group);
      const blob = new Blob([objText], { type: 'text/plain;charset=utf-8' });
      triggerDownload(blob, `${safeName}.obj`);
      return;
    }

    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) {
          const blob = new Blob([result], { type: 'model/gltf-binary' });
          triggerDownload(blob, `${safeName}.glb`);
        } else {
          const jsonText = JSON.stringify(result, null, 2);
          const blob = new Blob([jsonText], { type: 'application/json' });
          triggerDownload(blob, `${safeName}.gltf`);
        }
      },
      (error) => {
        console.error('GLTF export failed:', error);
      },
      { binary: format === 'glb' },
    );
  };

  const quickFormula = quickMode !== 'blueprint' ? QUICK_FORMULAS[quickMode] : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-950">
      <div ref={mountRef} className="h-full w-full" />

      {/* Top-Left Minimal Model Info & Formulas */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-md rounded-xl border border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/95">
        {quickFormula ? (
          <>
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <Box className="h-3.5 w-3.5" />
              <span>{lang === 'km' ? 'គំរូធរណីមាត្រ 3D' : 'Board 3D Reconstruction'}</span>
            </div>
            <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {lang === 'km' ? quickFormula.titleKm : quickFormula.titleEn}
            </h3>
            <div className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
              <div>{quickFormula.vol}</div>
              <div>{quickFormula.area}</div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Box className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>{activeModel.category}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{activeModel.parts.length} parts</span>
            </div>
            <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeModel.title}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
              {activeModel.description}
            </p>
          </>
        )}
      </div>

      {/* Top-Right Quick Actions */}
      <div className="absolute right-4 top-4 z-10 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSnapshot}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <Camera className="h-3.5 w-3.5" />
          {copy.gen3d.snapshotToBoard}
        </button>
        <button
          type="button"
          onClick={() => handleExport('glb')}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" />
          {copy.gen3d.exportGlb}
        </button>
        <button
          type="button"
          onClick={() => handleExport('gltf')}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {copy.gen3d.exportGltf}
        </button>
        <button
          type="button"
          onClick={() => handleExport('obj')}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {copy.gen3d.exportObj}
        </button>
      </div>

      {webglError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/80 p-6 text-center text-sm text-white">
          {webglError}
        </div>
      )}

      {/* Collapsible Bottom Control Dock */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 w-[min(940px,95%)] -translate-x-1/2">
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {dockCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {!dockCollapsed && (
          <div className="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 p-3.5 shadow-md dark:border-slate-800 dark:bg-slate-900/95">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-center">
              {/* 3D Mode / Geometry Selector */}
              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {lang === 'km' ? 'ប្រភេទម៉ូដែល 3D' : '3D Mode / Solid'}
                </label>
                <select
                  value={quickMode}
                  onChange={(e) => onChangeQuickMode(e.target.value as Quick3DShapeMode)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="blueprint">
                    {lang === 'km' ? 'AI Multi-Part PBR Blueprint' : 'AI Multi-Part PBR Blueprint'}
                  </option>
                  <option value="extrude">
                    {lang === 'km' ? 'បំប្លែងពីរូបគូសផ្ទាល់ (Exact Match)' : 'Exact Board Shape Extrude'}
                  </option>
                  <option value="cube">{lang === 'km' ? 'គូប / ប្រអប់កែង (Cube)' : 'Cube / Box'}</option>
                  <option value="sphere">{lang === 'km' ? 'ស្វ៊ែរ (Sphere)' : 'Sphere'}</option>
                  <option value="cylinder">{lang === 'km' ? 'ស៊ីឡាំង (Cylinder)' : 'Cylinder'}</option>
                  <option value="cone">{lang === 'km' ? 'កោណ (Cone)' : 'Cone'}</option>
                  <option value="pyramid">{lang === 'km' ? 'ពីរ៉ាមីត (Pyramid)' : 'Pyramid'}</option>
                  <option value="revolve">{lang === 'km' ? 'បង្វិលខ្សែកោង 360° (Lathe)' : '360° Lathe Revolve'}</option>
                  {hologramImageUrl && (
                    <option value="hologram">
                      {lang === 'km' ? 'ផ្ទាំងរូបភាព 3D ក្នុងលំហ' : '3D Hologram Card'}
                    </option>
                  )}
                </select>
              </div>

              {quickMode === 'blueprint' ? (
                <>
                  {/* Part Selector */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {copy.gen3d.partsList}
                    </label>
                    <select
                      value={selectedPart?.id || ''}
                      onChange={(e) => setSelectedPartId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {activeModel.parts.map((part) => (
                        <option key={part.id} value={part.id}>
                          {part.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedPart && (
                    <>
                      <div className="md:col-span-1">
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {copy.gen3d.materialColor}
                        </label>
                        <input
                          type="color"
                          value={selectedPart.color}
                          onChange={(e) => updateSelectedPart({ color: e.target.value })}
                          className="mt-1 h-8 w-full cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 dark:border-slate-700"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{copy.gen3d.roughness}</span>
                          <span className="tabular-nums">{selectedPart.roughness.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={selectedPart.roughness}
                          onChange={(e) => updateSelectedPart({ roughness: Number(e.target.value) })}
                          className="mt-1.5 w-full accent-blue-600"
                        />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* Quick 3D Depth Slider */}
                  <div className="md:col-span-3">
                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{lang === 'km' ? 'កម្រាស់ 3D (Depth)' : '3D Depth'}</span>
                      <span className="tabular-nums">{quickDepth.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={3.0}
                      step={0.1}
                      value={quickDepth}
                      onChange={(e) => setQuickDepth(Number(e.target.value))}
                      className="mt-1.5 w-full accent-amber-500"
                    />
                  </div>

                  {/* Quick 3D Color */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {copy.gen3d.materialColor}
                    </label>
                    <input
                      type="color"
                      value={quickColor}
                      onChange={(e) => setQuickColor(e.target.value)}
                      className="mt-1 h-8 w-full cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 dark:border-slate-700"
                    />
                  </div>
                </>
              )}

              {/* Lighting, Wireframe, AutoRotate & Reset */}
              <div className="flex items-center justify-between gap-2 md:col-span-4">
                <div className="min-w-[70px] flex-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Sun className="h-3 w-3" />
                      {copy.gen3d.lightIntensity}
                    </span>
                    <span className="tabular-nums">{lightIntensity.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={3.0}
                    step={0.1}
                    value={lightIntensity}
                    onChange={(e) => setLightIntensity(Number(e.target.value))}
                    className="mt-1.5 w-full accent-blue-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setWireframeOnly((v) => !v)}
                  title={lang === 'km' ? 'គ្រោងឆ្អឹង (ជ្រុងស្អាត)' : 'Clean Edge Wireframe'}
                  className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2 py-1.5 text-xs font-medium ${
                    wireframeOnly
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300'
                      : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Boxes className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{lang === 'km' ? 'គ្រោង' : 'Edges'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoRotate((v) => !v)}
                  className={`shrink-0 whitespace-nowrap rounded-lg border px-2 py-1.5 text-xs font-medium ${
                    autoRotate
                      ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {copy.gen3d.autoRotate}
                </button>
                <button
                  type="button"
                  onClick={handleResetCamera}
                  title={copy.gen3d.resetCamera}
                  className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
