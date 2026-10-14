// terrain.js — Interactive 3D Mountain Landscape & Topographic Visualization
// Terra Incognita SEO Intelligence Platform

// Palette tokens
export const COLORS = {
  canvasDark: 0x181816,
  canvasLight: 0xf4f1ea,
  stoneBase: 0x6e6b64,
  stoneMid: 0x938f86,
  stoneLight: 0xd6d0c4,
  limestonePeak: 0xfbf9f5,
  forestGreen: 0x2e5b42,
  forestGreenHex: '#2e5b42',
  copperVein: 0x3d7871,
  copperVeinHex: '#3d7871',
  amberWarning: 0xb87333,
  amberWarningHex: '#b87333',
  criticalRed: 0x8f2d2d,
  criticalRedHex: '#8f2d2d',
  gridLines: 0xc4beaf
};

export class MountainViewer {
  constructor(containerId, options = {}) {
    this.container = typeof containerId === 'string' && typeof document !== 'undefined'
      ? document.getElementById(containerId)
      : containerId;

    const hasMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
    this.options = {
      interactive: true,
      reducedMotion: hasMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onMarkerSelect: null,
      ...options
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.terrainMesh = null;
    this.contourMesh = null;
    this.markersGroup = null;
    this.beaconMeshes = [];
    this.hoveredBeacon = null;
    this.selectedBeacon = null;

    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.rotationSpeed = 0.005;
    this.targetRotation = { x: 0.45, y: -0.65 };
    this.currentRotation = { x: 0.45, y: -0.65 };
    this.targetZoom = 70;
    this.currentZoom = 70;
    this.isScanning = false;
    this.scanProgress = 0;
    this.currentData = null;
    this.animationFrameId = null;

    this.init();
  }

  hasWebGL() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch {
      return false;
    }
  }

  init() {
    if (!this.container) return;

    if (!this.hasWebGL() || typeof THREE === 'undefined') {
      this.render2DFallback();
      return;
    }

    this.setupThreeScene();
    this.buildTerrain(null);
    this.bindEvents();
    this.animate();
  }

  setupThreeScene() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 450;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xf4f1ea, 0.007);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 1, 1000);
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.outline = 'none';

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff8ee, 1.0);
    sunLight.position.set(60, 100, 50);
    this.scene.add(sunLight);

    const copperRimLight = new THREE.DirectionalLight(0x4a8880, 0.6);
    copperRimLight.position.set(-60, 40, -50);
    this.scene.add(copperRimLight);

    this.markersGroup = new THREE.Group();
    this.scene.add(this.markersGroup);
  }

  updateCameraPosition() {
    if (!this.camera) return;
    const r = this.currentZoom;
    const theta = this.currentRotation.y;
    const phi = this.currentRotation.x;

    this.camera.position.x = r * Math.sin(theta) * Math.cos(phi);
    this.camera.position.y = r * Math.sin(phi);
    this.camera.position.z = r * Math.cos(theta) * Math.cos(phi);
    this.camera.lookAt(0, 4, 0);
  }

  buildTerrain(data) {
    if (!this.scene || typeof THREE === 'undefined') return;

    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      if (this.terrainMesh.geometry) this.terrainMesh.geometry.dispose();
    }
    if (this.contourMesh) {
      this.scene.remove(this.contourMesh);
      if (this.contourMesh.geometry) this.contourMesh.geometry.dispose();
    }

    const totalScore = data && data.scores ? (data.scores.total || 0) : 50;
    const peakScale = (totalScore / 100);
    const baseHeight = 4 + (peakScale * 18); // 4 to 22 height

    const size = 90;
    const segments = 46;
    const geom = new THREE.PlaneGeometry(size, size, segments, segments);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position;
    const colors = [];
    const cPeak = new THREE.Color(COLORS.limestonePeak);
    const cCopper = new THREE.Color(COLORS.copperVein);
    const cGreen = new THREE.Color(COLORS.forestGreen);
    const cStone = new THREE.Color(COLORS.stoneMid);
    const cBase = new THREE.Color(COLORS.stoneBase);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const distFromCenter = Math.sqrt(x * x + z * z);
      const normDist = Math.min(1, distFromCenter / (size * 0.48));

      // Procedural mountain elevation with ridges
      const centralPeak = Math.exp(-Math.pow(distFromCenter / 18, 1.8)) * baseHeight;
      const eastRidge = Math.exp(-Math.pow(Math.abs(z - 0.5 * x) / 8, 2)) * Math.exp(-Math.pow(x / 30, 2)) * (baseHeight * 0.7);
      const westRidge = Math.exp(-Math.pow(Math.abs(z + 0.6 * x) / 9, 2)) * Math.exp(-Math.pow(x / 32, 2)) * (baseHeight * 0.65);
      const microNoise = (Math.sin(x * 0.28) * Math.cos(z * 0.28) * 1.5) + (Math.sin(x * 0.12 + 1) * Math.cos(z * 0.15) * 2.2);

      let y = (centralPeak + eastRidge + westRidge + microNoise) * (1 - Math.pow(normDist, 2.5));
      if (y < 0) y = 0;

      pos.setY(i, y);

      // Elevation color gradient
      const relElevation = Math.min(1, y / 24);
      const vertexColor = new THREE.Color();
      if (relElevation > 0.7) {
        vertexColor.copy(cPeak).lerp(cCopper, (relElevation - 0.7) * 0.5);
      } else if (relElevation > 0.4) {
        vertexColor.copy(cStone).lerp(cGreen, 0.35);
      } else {
        vertexColor.copy(cBase).lerp(cStone, relElevation / 0.4);
      }

      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
    }

    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    const terrainMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide
    });

    this.terrainMesh = new THREE.Mesh(geom, terrainMaterial);
    this.scene.add(this.terrainMesh);

    // Topographic wireframe contours
    const wireMat = new THREE.MeshBasicMaterial({
      color: COLORS.copperVein,
      wireframe: true,
      transparent: true,
      opacity: 0.14
    });
    this.contourMesh = new THREE.Mesh(geom.clone(), wireMat);
    this.contourMesh.position.y += 0.08;
    this.scene.add(this.contourMesh);

    this.populateMarkers(data);
  }

  getElevationAt(x, z) {
    if (!this.terrainMesh) return 0;
    const geom = this.terrainMesh.geometry;
    const pos = geom.attributes.position;
    let closestDist = Infinity;
    let elevation = 0;

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const d = (vx - x) * (vx - x) + (vz - z) * (vz - z);
      if (d < closestDist) {
        closestDist = d;
        elevation = pos.getY(i);
      }
    }
    return elevation;
  }

  populateMarkers(data) {
    if (!this.markersGroup || typeof THREE === 'undefined') return;

    while (this.markersGroup.children.length > 0) {
      const obj = this.markersGroup.children[0];
      this.markersGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    this.beaconMeshes = [];

    const issues = (data && data.issues) ? data.issues : this.getDefaultPreviewIssues();

    const REGION_COORDS = {
      'summit': { x: 0, z: 2 },
      'ridge-east': { x: 14, z: 8 },
      'ridge-west': { x: -15, z: 10 },
      'terrace-north': { x: 5, z: -16 },
      'plateau-south': { x: -6, z: 18 },
      'base-valley': { x: -18, z: -14 },
      'watershed-east': { x: 22, z: -8 }
    };

    issues.forEach((issue, idx) => {
      const coords = REGION_COORDS[issue.terrainRegion] || {
        x: Math.cos((idx / issues.length) * Math.PI * 2) * 16,
        z: Math.sin((idx / issues.length) * Math.PI * 2) * 16
      };

      const y = this.getElevationAt(coords.x, coords.z);

      let colorHex = COLORS.forestGreen;
      if (!issue.passed) {
        colorHex = issue.severity === 'Critical' ? COLORS.criticalRed : COLORS.amberWarning;
      }

      const pillarHeight = 3.5;
      const geom = new THREE.CylinderGeometry(0.7, 0.9, pillarHeight, 6);
      const mat = new THREE.MeshLambertMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: issue.passed ? 0.15 : 0.45
      });

      const pillar = new THREE.Mesh(geom, mat);
      pillar.position.set(coords.x, y + pillarHeight / 2, coords.z);
      pillar.userData = { issue, originalColor: colorHex, originalScale: 1.0 };

      const ringGeom = new THREE.RingGeometry(1.0, 1.3, 6);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.y = pillarHeight / 2 + 0.4;
      pillar.add(ring);

      this.markersGroup.add(pillar);
      this.beaconMeshes.push(pillar);
    });
  }

  getDefaultPreviewIssues() {
    return [
      { id: 'summit', name: 'Site Summit Health', category: 'onPage', passed: true, severity: 'Passed', status: 'Optimal', terrainRegion: 'summit', fix: 'Ready for scanning' },
      { id: 'https-security', name: 'HTTPS Protocol', category: 'technical', passed: true, severity: 'Passed', status: 'Secure', terrainRegion: 'base-valley', fix: 'Awaiting survey scan' },
      { id: 'viewport-mobile', name: 'Mobile Viewport', category: 'technical', passed: true, severity: 'Passed', status: 'Optimal', terrainRegion: 'ridge-west', fix: 'Awaiting survey scan' },
      { id: 'content-depth', name: 'Content Density', category: 'content', passed: false, severity: 'Improvement', status: 'Survey ready', terrainRegion: 'plateau-south', fix: 'Input URL to evaluate' },
      { id: 'link-architecture', name: 'Link Architecture', category: 'links', passed: true, severity: 'Passed', status: 'Awaiting data', terrainRegion: 'watershed-east', fix: 'Input URL to evaluate' }
    ];
  }

  bindEvents() {
    if (!this.renderer || typeof window === 'undefined') return;
    const el = this.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        const deltaX = e.clientX - this.previousMousePosition.x;
        const deltaY = e.clientY - this.previousMousePosition.y;

        this.targetRotation.y += deltaX * this.rotationSpeed;
        this.targetRotation.x = Math.max(0.15, Math.min(1.2, this.targetRotation.x + deltaY * this.rotationSpeed));

        this.previousMousePosition = { x: e.clientX, y: e.clientY };
      } else {
        this.handlePointerHover(e);
      }
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    el.addEventListener('click', (e) => {
      this.handlePointerClick(e);
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetZoom = Math.max(35, Math.min(120, this.targetZoom + e.deltaY * 0.05));
    }, { passive: false });

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.handleResize());
      ro.observe(this.container);
    }
  }

  handleResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight || 450;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  handlePointerHover(e) {
    if (!this.renderer || !this.camera || this.beaconMeshes.length === 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    const intersects = raycaster.intersectObjects(this.beaconMeshes, false);

    if (intersects.length > 0) {
      const beacon = intersects[0].object;
      if (this.hoveredBeacon !== beacon) {
        this.unhighlightBeacon(this.hoveredBeacon);
        this.hoveredBeacon = beacon;
        this.highlightBeacon(beacon);
        this.renderer.domElement.style.cursor = 'pointer';
        this.updateHudTooltip(beacon.userData.issue, e.clientX, e.clientY);
      }
    } else {
      if (this.hoveredBeacon) {
        this.unhighlightBeacon(this.hoveredBeacon);
        this.hoveredBeacon = null;
        this.renderer.domElement.style.cursor = 'default';
        this.hideHudTooltip();
      }
    }
  }

  handlePointerClick(e) {
    if (!this.renderer || !this.camera) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    const intersects = raycaster.intersectObjects(this.beaconMeshes, false);

    if (intersects.length > 0) {
      const beacon = intersects[0].object;
      this.selectBeacon(beacon);
    }
  }

  highlightBeacon(beacon) {
    if (!beacon) return;
    beacon.scale.set(1.3, 1.3, 1.3);
    if (beacon.material) beacon.material.emissiveIntensity = 0.8;
  }

  unhighlightBeacon(beacon) {
    if (!beacon || beacon === this.selectedBeacon) return;
    beacon.scale.set(1, 1, 1);
    if (beacon.material) beacon.material.emissiveIntensity = beacon.userData.issue.passed ? 0.15 : 0.45;
  }

  selectBeacon(beacon) {
    if (this.selectedBeacon) {
      this.selectedBeacon.scale.set(1, 1, 1);
    }
    this.selectedBeacon = beacon;
    beacon.scale.set(1.4, 1.4, 1.4);

    const issue = beacon.userData.issue;
    this.displayInspector(issue);

    if (typeof this.options.onMarkerSelect === 'function') {
      this.options.onMarkerSelect(issue);
    }
  }

  updateHudTooltip(issue, clientX, clientY) {
    if (typeof document === 'undefined') return;
    let tooltip = document.getElementById('terrain-hud-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'terrain-hud-tooltip';
      tooltip.className = 'fixed z-50 pointer-events-none px-3 py-1.5 rounded-lg bg-stone-900/90 text-stone-100 text-xs font-mono shadow-lg border border-stone-700 backdrop-blur transition-opacity duration-150';
      document.body.appendChild(tooltip);
    }

    const statusTag = issue.passed
      ? `<span class="text-emerald-400 font-semibold">[PASSED]</span>`
      : `<span class="text-amber-400 font-semibold">[${issue.severity || 'ATTENTION'}]</span>`;

    tooltip.innerHTML = `${statusTag} <strong>${issue.name}</strong> — ${issue.status || issue.passedStatus}`;
    tooltip.style.left = `${clientX + 14}px`;
    tooltip.style.top = `${clientY + 14}px`;
    tooltip.style.opacity = '1';
  }

  hideHudTooltip() {
    if (typeof document === 'undefined') return;
    const tooltip = document.getElementById('terrain-hud-tooltip');
    if (tooltip) tooltip.style.opacity = '0';
  }

  displayInspector(issue) {
    if (typeof document === 'undefined') return;
    const inspector = document.getElementById('terrain-inspector-card');
    if (!inspector) return;

    const isHealthy = issue.passed;
    const statusBadge = isHealthy
      ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-700/60">● Healthy Strata</span>`
      : `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-700/60">▲ ${issue.severity || 'Deficit'}</span>`;

    inspector.innerHTML = `
      <div class="flex items-start justify-between gap-4 mb-2">
        <div>
          <div class="text-[11px] font-mono tracking-wider text-stone-400 uppercase">${issue.terrainRegion || 'GEOLOGICAL REGION'}</div>
          <h4 class="text-base font-serif font-bold text-stone-900 dark:text-stone-100">${issue.name}</h4>
        </div>
        <div>${statusBadge}</div>
      </div>
      <p class="text-xs text-stone-600 dark:text-stone-300 mb-3">${issue.status || issue.passedStatus || 'Diagnostic signal recorded.'}</p>
      <div class="p-2.5 rounded bg-stone-200/50 dark:bg-stone-900/60 border border-stone-300/60 dark:border-stone-800 text-xs font-mono text-stone-700 dark:text-stone-400 mb-3">
        <strong class="text-stone-900 dark:text-stone-200">Recommended Action:</strong> ${issue.fix || 'No corrective action required.'}
      </div>
      <div class="flex items-center justify-between pt-1 border-t border-stone-200 dark:border-stone-800 text-xs">
        <button id="inspect-jump-btn" class="text-xs font-medium text-copper-700 dark:text-copper-400 hover:underline flex items-center gap-1">
          Jump to Audit finding &rarr;
        </button>
        <button id="inspect-close-btn" class="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">
          Dismiss
        </button>
      </div>
    `;

    inspector.classList.remove('hidden');

    const jumpBtn = inspector.querySelector('#inspect-jump-btn');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        if (typeof window !== 'undefined' && window.switchTab) window.switchTab('recommendations');
        const targetEl = document.getElementById(`rec-${issue.id}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.classList.add('ring-2', 'ring-copper-500');
          setTimeout(() => targetEl.classList.remove('ring-2', 'ring-copper-500'), 2500);
        }
      });
    }

    const closeBtn = inspector.querySelector('#inspect-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        inspector.classList.add('hidden');
      });
    }
  }

  resetView() {
    this.targetRotation = { x: 0.45, y: -0.65 };
    this.targetZoom = 70;
  }

  setPreset(preset) {
    if (preset === 'summit') {
      this.targetRotation = { x: 0.85, y: 0.0 };
      this.targetZoom = 55;
    } else if (preset === 'ridge') {
      this.targetRotation = { x: 0.25, y: -1.45 };
      this.targetZoom = 65;
    } else if (preset === 'ortho') {
      this.targetRotation = { x: 1.25, y: 0.0 };
      this.targetZoom = 80;
    } else {
      this.resetView();
    }
  }

  updateData(data) {
    this.currentData = data;
    this.buildTerrain(data);
  }

  render2DFallback() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-stone-100 dark:bg-stone-900 border border-stone-300 dark:border-stone-800 rounded-xl">
        <svg class="w-32 h-32 mb-4 text-stone-500" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10 80 Q 30 20 50 40 T 90 80" fill="rgba(61,120,113,0.1)" stroke="currentColor"/>
          <path d="M20 80 Q 40 35 55 50 T 80 80" stroke="currentColor" stroke-dasharray="2 2"/>
          <circle cx="50" cy="40" r="3" fill="#2e5b42"/>
          <circle cx="35" cy="55" r="3" fill="#b87333"/>
          <circle cx="65" cy="60" r="3" fill="#8f2d2d"/>
        </svg>
        <h4 class="font-serif font-bold text-base text-stone-800 dark:text-stone-200 mb-1">Topographic Elevation Profile (2D Fallback)</h4>
        <p class="text-xs text-stone-600 dark:text-stone-400 max-w-sm mb-4">Interactive 3D WebGL is unavailable or reduced-motion is requested. Real SEO findings are active below in the survey telemetry.</p>
      </div>
    `;
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.08;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.08;
    this.currentZoom += (this.targetZoom - this.currentZoom) * 0.08;

    if (!this.isDragging && !this.options.reducedMotion) {
      this.targetRotation.y += 0.0008;
    }

    this.updateCameraPosition();

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}

// Global browser attachment
if (typeof window !== 'undefined') {
  window.MountainViewer = MountainViewer;
  window.TerraMountain = { MountainViewer, COLORS };
}

export default { MountainViewer, COLORS };
