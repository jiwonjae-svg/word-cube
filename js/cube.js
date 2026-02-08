// cube.js - 3D Rubik's-style word cube with Three.js
// Handles rendering, interaction (orbit + slice rotation), and state management

import * as THREE from 'three';

const FACE_NAMES = ['F', 'B', 'U', 'D', 'L', 'R']; // Front, Back, Up, Down, Left, Right
const FACE_NORMALS = [
  new THREE.Vector3(0, 0, 1),   // F
  new THREE.Vector3(0, 0, -1),  // B
  new THREE.Vector3(0, 1, 0),   // U
  new THREE.Vector3(0, -1, 0),  // D
  new THREE.Vector3(-1, 0, 0),  // L
  new THREE.Vector3(1, 0, 0),   // R
];

// Map face index to axis perpendicular to that face
const FACE_AXIS = [2, 2, 1, 1, 0, 0]; // z, z, y, y, x, x
const FACE_SIGN = [1, -1, 1, -1, -1, 1]; // positive or negative side

export class WordCube {
  constructor(container, cubeSize = 3) {
    this.container = container;
    this.n = cubeSize;
    this.cubeWorldSize = 3; // The cube spans from -1.5 to 1.5
    this.tileSize = this.cubeWorldSize / this.n;
    this.gap = 0.04; // Gap between tiles

    // State: 6 faces, each NxN letters
    this.faceGrids = [];

    // Three.js objects
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.cubeGroup = null; // Main group for orbit rotation
    this.tileMeshes = [];  // All tile meshes [{mesh, faceIdx, row, col}]
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Texture cache
    this.textureCache = {};
    this.glowTextureCache = {};

    // Interaction state
    this.isDragging = false;
    this.isRotatingSlice = false;
    this.isOrbiting = false;
    this.dragStart = null;
    this.dragFace = -1;
    this.dragRow = -1;
    this.dragCol = -1;
    this.dragAxis = -1; // 0=x, 1=y, 2=z
    this.dragLayer = -1;
    this.sliceGroup = null; // Temp group for slice rotation animation
    this.animating = false;

    // Orbit state
    this.orbitQuat = new THREE.Quaternion();
    this.orbitTarget = new THREE.Quaternion();

    // Settings
    this.sensitivity = 5;
    this.invertRotation = false;
    this.clickFeedback = true;

    // Callbacks
    this.onRotationComplete = null;
    this.onTileClick = null;

    // Highlight state
    this.highlightedTiles = new Set();
    this.highlightAnimations = [];

    // Object pooling
    this.geometryPool = null;
    this.materialPool = [];

    this._init();
  }

  _init() {
    // Scene
    this.scene = new THREE.Scene();

    // Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 0, this.cubeWorldSize * 2.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 8, 10);
    this.scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-5, -3, -8);
    this.scene.add(backLight);

    // Cube group
    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);

    // Create shared geometry
    const tileW = this.tileSize - this.gap;
    this.geometryPool = new THREE.BoxGeometry(tileW, tileW, 0.06);

    // Core cube (dark interior visible through gaps)
    const coreSize = this.cubeWorldSize - 0.02;
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.1
    });
    const coreGeo = new THREE.BoxGeometry(coreSize, coreSize, coreSize);
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    this.cubeGroup.add(coreMesh);
    this._coreGeo = coreGeo;
    this._coreMat = coreMat;

    // Set initial orbit rotation
    this.cubeGroup.rotation.set(Math.PI * 0.15, -Math.PI * 0.25, 0);
    this.orbitQuat.copy(this.cubeGroup.quaternion);
    this.orbitTarget.copy(this.orbitQuat);

    // Event listeners
    this._bindEvents();

    // Start render loop
    this._animate();

    // Resize handler
    this._resizeHandler = () => this._onResize();
    window.addEventListener('resize', this._resizeHandler);
  }

  // Initialize cube with face grids (6 arrays of NxN letters)
  setFaceGrids(grids) {
    this.faceGrids = grids.map(face => face.map(row => [...row]));
    this._rebuildTiles();
  }

  // Get current face grids
  getFaceGrids() {
    return this.faceGrids.map(face => face.map(row => [...row]));
  }

  // Create a high-resolution canvas texture for a tile letter
  _createTileTexture(letter, isHighlighted = false, glowColor = '#00ffd5') {
    const cacheKey = isHighlighted ? `${letter}_glow_${glowColor}` : letter;
    if (this.textureCache[cacheKey]) return this.textureCache[cacheKey];

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Background
    if (isHighlighted) {
      ctx.fillStyle = 'rgba(0, 255, 213, 0.15)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    }

    const r = size * 0.08;
    this._roundRect(ctx, 8, 8, size - 16, size - 16, r);
    ctx.fill();

    // Border
    ctx.strokeStyle = isHighlighted ? glowColor : 'rgba(200, 200, 220, 0.5)';
    ctx.lineWidth = isHighlighted ? 6 : 3;
    this._roundRect(ctx, 8, 8, size - 16, size - 16, r);
    ctx.stroke();

    // Glow effect for highlighted tiles
    if (isHighlighted) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 40;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 4;
      this._roundRect(ctx, 16, 16, size - 32, size - 32, r - 8);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Letter
    ctx.fillStyle = isHighlighted ? '#00ffd5' : '#1e293b';
    ctx.font = `bold ${size * 0.45}px 'Inter', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isHighlighted) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 20;
    }
    ctx.fillText(letter, size / 2, size / 2 - size * 0.04);
    ctx.shadowBlur = 0;

    // Underline
    ctx.strokeStyle = isHighlighted ? glowColor : '#94a3b8';
    ctx.lineWidth = size * 0.018;
    ctx.beginPath();
    ctx.moveTo(size * 0.25, size * 0.75);
    ctx.lineTo(size * 0.75, size * 0.75);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;

    this.textureCache[cacheKey] = texture;
    return texture;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Build/rebuild all tile meshes from current faceGrids
  _rebuildTiles() {
    // Remove existing tiles
    for (const obj of this.tileMeshes) {
      this.cubeGroup.remove(obj.mesh);
      if (obj.mesh.material) obj.mesh.material.dispose();
    }
    this.tileMeshes = [];

    const half = this.cubeWorldSize / 2;

    for (let fIdx = 0; fIdx < 6; fIdx++) {
      for (let r = 0; r < this.n; r++) {
        for (let c = 0; c < this.n; c++) {
          const letter = this.faceGrids[fIdx][r][c];
          const texture = this._createTileTexture(letter);

          const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.3,
            metalness: 0.05,
            transparent: true,
            opacity: 0.95,
          });

          const mesh = new THREE.Mesh(this.geometryPool, material);

          // Position on cube face
          const pos = this._getTilePosition(fIdx, r, c);
          mesh.position.copy(pos.position);
          mesh.quaternion.copy(pos.quaternion);

          // Store metadata
          mesh.userData = { faceIdx: fIdx, row: r, col: c, letter };

          this.cubeGroup.add(mesh);
          this.tileMeshes.push({ mesh, faceIdx: fIdx, row: r, col: c });
        }
      }
    }
  }

  // Calculate tile world position and rotation for a face/row/col
  _getTilePosition(faceIdx, row, col) {
    const half = this.cubeWorldSize / 2;
    const offset = (idx) => (idx - (this.n - 1) / 2) * this.tileSize;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();

    switch (faceIdx) {
      case 0: // Front (z = +half)
        position.set(offset(col), -offset(row), half);
        // No rotation needed (faces +z)
        break;
      case 1: // Back (z = -half)
        position.set(-offset(col), -offset(row), -half);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        break;
      case 2: // Up (y = +half)
        position.set(offset(col), half, offset(row));
        quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        break;
      case 3: // Down (y = -half)
        position.set(offset(col), -half, -offset(row));
        quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        break;
      case 4: // Left (x = -half)
        position.set(-half, -offset(row), -offset(col));
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        break;
      case 5: // Right (x = +half)
        position.set(half, -offset(row), offset(col));
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        break;
    }

    return { position, quaternion };
  }

  // Apply a slice rotation to the logical state
  rotateSlice(axis, layerIndex, direction, animate = true) {
    if (this.animating) return;

    // Get the world-space coordinate for this layer
    const layerCoord = (layerIndex - (this.n - 1) / 2) * this.tileSize;

    // Find all tiles in this slice
    const sliceTiles = this.tileMeshes.filter(t => {
      const p = t.mesh.position;
      const coord = axis === 0 ? p.x : axis === 1 ? p.y : p.z;
      return Math.abs(coord - layerCoord) < this.tileSize * 0.4;
    });

    if (sliceTiles.length === 0) return;

    if (animate) {
      this._animateSliceRotation(axis, layerCoord, direction, sliceTiles);
    } else {
      this._applySliceRotation(axis, direction, sliceTiles);
      this._updateStateFromMeshes();
    }
  }

  // Animate a 90-degree slice rotation
  _animateSliceRotation(axis, layerCoord, direction, sliceTiles) {
    this.animating = true;

    // Create temporary group
    this.sliceGroup = new THREE.Group();
    this.cubeGroup.add(this.sliceGroup);

    // Reparent slice tiles to temp group
    for (const t of sliceTiles) {
      this.cubeGroup.remove(t.mesh);
      this.sliceGroup.add(t.mesh);
    }

    // Animation
    const targetAngle = direction * (Math.PI / 2);
    const rotAxis = new THREE.Vector3(
      axis === 0 ? 1 : 0,
      axis === 1 ? 1 : 0,
      axis === 2 ? 1 : 0
    );

    const duration = 250; // ms
    const startTime = performance.now();
    const startQuat = this.sliceGroup.quaternion.clone();
    const endQuat = new THREE.Quaternion().setFromAxisAngle(rotAxis, targetAngle);

    const anim = () => {
      if (!this.renderer || !this.sliceGroup) { this.animating = false; return; }
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      this.sliceGroup.quaternion.copy(startQuat).slerp(endQuat, ease);

      if (t < 1) {
        requestAnimationFrame(anim);
      } else {
        // Finalize: apply rotation to each tile mesh and reparent
        this._finalizeSliceRotation(axis, rotAxis, targetAngle, sliceTiles);
      }
    };
    requestAnimationFrame(anim);
  }

  _finalizeSliceRotation(axis, rotAxis, angle, sliceTiles) {
    const rotMatrix = new THREE.Matrix4().makeRotationAxis(rotAxis, angle);

    for (const t of sliceTiles) {
      // Get world transform
      t.mesh.applyMatrix4(rotMatrix);

      // Round positions to tile grid
      t.mesh.position.x = Math.round(t.mesh.position.x / this.tileSize * 100) / 100 * this.tileSize;
      t.mesh.position.y = Math.round(t.mesh.position.y / this.tileSize * 100) / 100 * this.tileSize;
      t.mesh.position.z = Math.round(t.mesh.position.z / this.tileSize * 100) / 100 * this.tileSize;

      // Snap positions
      this._snapPosition(t.mesh);

      // Reparent to cube group
      this.sliceGroup.remove(t.mesh);
      this.cubeGroup.add(t.mesh);
    }

    // Remove temp group
    this.cubeGroup.remove(this.sliceGroup);
    this.sliceGroup = null;

    // Update logical state from mesh positions
    this._updateStateFromMeshes();

    this.animating = false;

    // Fire callback
    if (this.onRotationComplete) {
      this.onRotationComplete(this.getFaceGrids());
    }
  }

  // Snap mesh position to nearest valid tile position on a face
  _snapPosition(mesh) {
    const half = this.cubeWorldSize / 2;
    const p = mesh.position;
    const threshold = this.tileSize * 0.3;

    // Determine which face this tile is now on
    let faceIdx = -1;
    if (Math.abs(p.z - half) < threshold) faceIdx = 0;       // Front
    else if (Math.abs(p.z + half) < threshold) faceIdx = 1;   // Back
    else if (Math.abs(p.y - half) < threshold) faceIdx = 2;   // Up
    else if (Math.abs(p.y + half) < threshold) faceIdx = 3;   // Down
    else if (Math.abs(p.x + half) < threshold) faceIdx = 4;   // Left
    else if (Math.abs(p.x - half) < threshold) faceIdx = 5;   // Right

    if (faceIdx === -1) {
      // Fallback: find closest face
      let minDist = Infinity;
      const facePositions = [
        { idx: 0, coord: p.z, target: half },
        { idx: 1, coord: p.z, target: -half },
        { idx: 2, coord: p.y, target: half },
        { idx: 3, coord: p.y, target: -half },
        { idx: 4, coord: p.x, target: -half },
        { idx: 5, coord: p.x, target: half },
      ];
      for (const fp of facePositions) {
        const d = Math.abs(fp.coord - fp.target);
        if (d < minDist) { minDist = d; faceIdx = fp.idx; }
      }
    }

    // Snap to exact face position
    switch (faceIdx) {
      case 0: p.z = half; break;
      case 1: p.z = -half; break;
      case 2: p.y = half; break;
      case 3: p.y = -half; break;
      case 4: p.x = -half; break;
      case 5: p.x = half; break;
    }

    // Snap row/col coordinates to grid
    const snapCoord = (val) => {
      const idx = Math.round((val / this.tileSize) + (this.n - 1) / 2);
      const clampedIdx = Math.max(0, Math.min(this.n - 1, idx));
      return (clampedIdx - (this.n - 1) / 2) * this.tileSize;
    };

    switch (faceIdx) {
      case 0: // Front
        p.x = snapCoord(p.x);
        p.y = snapCoord(p.y);
        break;
      case 1: // Back
        p.x = snapCoord(p.x);
        p.y = snapCoord(p.y);
        break;
      case 2: // Up
        p.x = snapCoord(p.x);
        p.z = snapCoord(p.z);
        break;
      case 3: // Down
        p.x = snapCoord(p.x);
        p.z = snapCoord(p.z);
        break;
      case 4: // Left
        p.y = snapCoord(p.y);
        p.z = snapCoord(p.z);
        break;
      case 5: // Right
        p.y = snapCoord(p.y);
        p.z = snapCoord(p.z);
        break;
    }

    // Snap quaternion to nearest 90-degree rotation
    const pos = this._getTilePosition(faceIdx, 0, 0);
    mesh.quaternion.copy(pos.quaternion);
  }

  // Update logical state from mesh positions/letters
  _updateStateFromMeshes() {
    const half = this.cubeWorldSize / 2;

    // Reset grids
    for (let f = 0; f < 6; f++) {
      for (let r = 0; r < this.n; r++) {
        for (let c = 0; c < this.n; c++) {
          this.faceGrids[f][r][c] = '?';
        }
      }
    }

    for (const t of this.tileMeshes) {
      const p = t.mesh.position;
      const threshold = this.tileSize * 0.3;

      // Determine face
      let faceIdx = -1;
      if (Math.abs(p.z - half) < threshold) faceIdx = 0;
      else if (Math.abs(p.z + half) < threshold) faceIdx = 1;
      else if (Math.abs(p.y - half) < threshold) faceIdx = 2;
      else if (Math.abs(p.y + half) < threshold) faceIdx = 3;
      else if (Math.abs(p.x + half) < threshold) faceIdx = 4;
      else if (Math.abs(p.x - half) < threshold) faceIdx = 5;

      if (faceIdx === -1) continue;

      // Determine row/col on this face
      let row, col;
      const toIdx = (val) => Math.round((val / this.tileSize) + (this.n - 1) / 2);

      switch (faceIdx) {
        case 0: // Front
          col = toIdx(p.x);
          row = toIdx(-p.y);
          break;
        case 1: // Back
          col = toIdx(-p.x);
          row = toIdx(-p.y);
          break;
        case 2: // Up
          col = toIdx(p.x);
          row = toIdx(p.z);
          break;
        case 3: // Down
          col = toIdx(p.x);
          row = toIdx(-p.z);
          break;
        case 4: // Left
          col = toIdx(-p.z);
          row = toIdx(-p.y);
          break;
        case 5: // Right
          col = toIdx(p.z);
          row = toIdx(-p.y);
          break;
      }

      row = Math.max(0, Math.min(this.n - 1, row));
      col = Math.max(0, Math.min(this.n - 1, col));

      t.faceIdx = faceIdx;
      t.row = row;
      t.col = col;
      t.mesh.userData.faceIdx = faceIdx;
      t.mesh.userData.row = row;
      t.mesh.userData.col = col;

      this.faceGrids[faceIdx][row][col] = t.mesh.userData.letter;
    }
  }

  // Apply rotation without animation (for scrambling)
  _applySliceRotation(axis, direction, sliceTiles) {
    const rotAxis = new THREE.Vector3(
      axis === 0 ? 1 : 0,
      axis === 1 ? 1 : 0,
      axis === 2 ? 1 : 0
    );
    const angle = direction * (Math.PI / 2);
    const rotMatrix = new THREE.Matrix4().makeRotationAxis(rotAxis, angle);

    for (const t of sliceTiles) {
      t.mesh.applyMatrix4(rotMatrix);
      this._snapPosition(t.mesh);
    }
  }

  // Scramble the cube with given moves (no animation)
  async scramble(moves) {
    for (const move of moves) {
      const layerCoord = (move.layer - (this.n - 1) / 2) * this.tileSize;
      const sliceTiles = this.tileMeshes.filter(t => {
        const p = t.mesh.position;
        const coord = move.axis === 0 ? p.x : move.axis === 1 ? p.y : p.z;
        return Math.abs(coord - layerCoord) < this.tileSize * 0.4;
      });
      this._applySliceRotation(move.axis, move.direction, sliceTiles);
    }
    this._updateStateFromMeshes();
  }

  // Highlight specific tiles (neon glow + pop out)
  highlightTiles(tilesToHighlight) {
    // tilesToHighlight: [{faceIdx, row, col}]
    // Clear previous highlights
    this.clearHighlights();

    const highlightSet = new Set(tilesToHighlight.map(t => `${t.faceIdx}-${t.row}-${t.col}`));

    for (const t of this.tileMeshes) {
      const key = `${t.faceIdx}-${t.row}-${t.col}`;
      if (highlightSet.has(key)) {
        const letter = t.mesh.userData.letter;
        const glowTexture = this._createTileTexture(letter, true);
        t.mesh.material.map = glowTexture;
        t.mesh.material.emissive = new THREE.Color(0x00ffd5);
        t.mesh.material.emissiveIntensity = 0.3;
        t.mesh.material.needsUpdate = true;

        this.highlightedTiles.add(key);

        // Pop-out animation
        this._animatePopOut(t.mesh);
      }
    }
  }

  clearHighlights() {
    for (const t of this.tileMeshes) {
      const key = `${t.faceIdx}-${t.row}-${t.col}`;
      if (this.highlightedTiles.has(key)) {
        const letter = t.mesh.userData.letter;
        const normalTexture = this._createTileTexture(letter, false);
        t.mesh.material.map = normalTexture;
        t.mesh.material.emissive = new THREE.Color(0x000000);
        t.mesh.material.emissiveIntensity = 0;
        t.mesh.material.needsUpdate = true;
      }
    }
    this.highlightedTiles.clear();
  }

  // Pop-out animation for found word tiles
  _animatePopOut(mesh) {
    const normal = FACE_NORMALS[mesh.userData.faceIdx].clone();
    const originalPos = mesh.position.clone();
    const popDistance = this.tileSize * 0.3;
    const popPos = originalPos.clone().add(normal.multiplyScalar(popDistance));

    const duration = 600;
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);

      if (t < 0.4) {
        // Pop out
        const ease = t / 0.4;
        const smooth = ease * ease * (3 - 2 * ease);
        mesh.position.lerpVectors(originalPos, popPos, smooth);
      } else {
        // Pop back
        const ease = (t - 0.4) / 0.6;
        const smooth = ease * ease * (3 - 2 * ease);
        mesh.position.lerpVectors(popPos, originalPos, smooth);
      }

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        mesh.position.copy(originalPos);
      }
    };
    requestAnimationFrame(animate);
  }

  // ===== Event Handling =====
  _bindEvents() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => this._onWheel(e));

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this._onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, button: 0 });
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this._onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this._onMouseUp({});
    }, { passive: false });
  }

  _getMousePos(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      px: event.clientX,
      py: event.clientY
    };
  }

  _onMouseDown(event) {
    if (this.animating) return;

    const pos = this._getMousePos(event);
    this.dragStart = { x: pos.px, y: pos.py };
    this.isDragging = false;
    this.isRotatingSlice = false;
    this.isOrbiting = false;

    // Raycast to check if clicked on a tile
    if (event.button === 0 || event.button === undefined) { // Left click or touch
      this.mouse.set(pos.x, pos.y);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      const tileMeshList = this.tileMeshes.map(t => t.mesh);
      const intersects = this.raycaster.intersectObjects(tileMeshList);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        this.dragFace = hitMesh.userData.faceIdx;
        this.dragRow = hitMesh.userData.row;
        this.dragCol = hitMesh.userData.col;
        this.isDragging = true;

        // Click feedback
        if (this.clickFeedback) {
          hitMesh.scale.set(0.92, 0.92, 0.92);
          setTimeout(() => hitMesh.scale.set(1, 1, 1), 100);
          if (navigator.vibrate) navigator.vibrate(10);
        }
      } else {
        // No tile hit - orbit mode
        this.isOrbiting = true;
      }
    } else {
      // Right click - orbit
      this.isOrbiting = true;
    }
  }

  _onMouseMove(event) {
    if (!this.dragStart) return;

    const pos = this._getMousePos(event);
    const dx = pos.px - this.dragStart.x;
    const dy = pos.py - this.dragStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 8) return; // Dead zone

    const sens = this.sensitivity / 5;
    const inv = this.invertRotation ? -1 : 1;

    if (this.isDragging && !this.isRotatingSlice) {
      // Determine rotation axis based on drag direction relative to face
      this.isRotatingSlice = true;
      this._determineSliceRotation(dx, dy, sens, inv);
    } else if (this.isOrbiting) {
      // Orbit rotation
      const rotSpeed = 0.006 * sens * inv;
      const xAngle = -dy * rotSpeed;
      const yAngle = -dx * rotSpeed;

      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), xAngle);
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yAngle);

      this.cubeGroup.quaternion.premultiply(qy).premultiply(qx);

      this.dragStart = { x: pos.px, y: pos.py };
    }
  }

  _determineSliceRotation(dx, dy, sens, inv) {
    const face = this.dragFace;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    let axis, layer, direction;

    // Determine based on face and drag direction
    // Horizontal drag → rotate the row, Vertical drag → rotate the column
    if (absX > absY) {
      // Horizontal drag
      direction = dx > 0 ? 1 : -1;
      direction *= inv;

      switch (face) {
        case 0: // Front: horizontal → Y-axis rotation
          axis = 1; layer = this.dragRow;
          direction = -direction;
          break;
        case 1: // Back
          axis = 1; layer = this.dragRow;
          break;
        case 2: // Up: horizontal → Z-axis rotation
          axis = 2; layer = this.dragRow;
          break;
        case 3: // Down
          axis = 2; layer = this.dragRow;
          direction = -direction;
          break;
        case 4: // Left: horizontal → Y-axis rotation
          axis = 1; layer = this.dragRow;
          direction = -direction;
          break;
        case 5: // Right
          axis = 1; layer = this.dragRow;
          direction = -direction;
          break;
      }
    } else {
      // Vertical drag
      direction = dy > 0 ? 1 : -1;
      direction *= inv;

      switch (face) {
        case 0: // Front: vertical → X-axis rotation
          axis = 0; layer = this.dragCol;
          break;
        case 1: // Back
          axis = 0; layer = this.n - 1 - this.dragCol;
          direction = -direction;
          break;
        case 2: // Up: vertical → X-axis rotation
          axis = 0; layer = this.dragCol;
          break;
        case 3: // Down
          axis = 0; layer = this.dragCol;
          direction = -direction;
          break;
        case 4: // Left: vertical → Z-axis rotation
          axis = 2; layer = this.n - 1 - this.dragCol;
          break;
        case 5: // Right
          axis = 2; layer = this.dragCol;
          direction = -direction;
          break;
      }
    }

    this.rotateSlice(axis, layer, direction, true);
    this.isDragging = false;
  }

  _onMouseUp(event) {
    this.dragStart = null;
    this.isDragging = false;
    this.isRotatingSlice = false;
    this.isOrbiting = false;
    this.dragFace = -1;
  }

  _onWheel(event) {
    event.preventDefault();
    const zoomSpeed = 0.1;
    const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
    const newZ = this.camera.position.z * delta;
    this.camera.position.z = Math.max(3, Math.min(20, newZ));
  }

  // ===== Resize & Render =====
  _onResize() {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    if (!this.renderer) return;

    this.renderer.render(this.scene, this.camera);
    this._rafId = requestAnimationFrame(() => this._animate());
  }

  // Update settings
  setSettings(sensitivity, invertRotation, clickFeedback) {
    this.sensitivity = sensitivity;
    this.invertRotation = invertRotation;
    this.clickFeedback = clickFeedback;
  }

  // Cleanup
  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._resizeHandler);

    // Dispose geometries and materials
    for (const t of this.tileMeshes) {
      if (t.mesh.material) {
        if (t.mesh.material.map) t.mesh.material.map.dispose();
        t.mesh.material.dispose();
      }
    }
    if (this.geometryPool) this.geometryPool.dispose();
    if (this._coreGeo) this._coreGeo.dispose();
    if (this._coreMat) this._coreMat.dispose();

    // Dispose cached textures
    for (const key of Object.keys(this.textureCache)) {
      this.textureCache[key].dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.container.removeChild(this.renderer.domElement);
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }
}

// ===== Background Cube for Login Page =====
export class BackgroundCubes {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.cubes = [];
    this.running = true;

    const w = canvas.parentElement.clientWidth;
    const h = canvas.parentElement.clientHeight;

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    this.camera.position.z = 15;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(5, 8, 10);
    this.scene.add(dir);

    // Create several small cubes
    this._spawnCubes(6);

    this._resizeHandler = () => {
      const w = canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._resizeHandler);

    this._animate();
  }

  _spawnCubes(count) {
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (let i = 0; i < count; i++) {
      const size = 1 + Math.random() * 1.5;
      const n = 3; // mini cubes are always 3x3
      const group = new THREE.Group();

      // Create mini cube faces
      const tileSize = size / n;
      const half = size / 2;
      const gap = 0.03;

      for (let f = 0; f < 6; f++) {
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            const letter = ALPHABET[Math.floor(Math.random() * 26)];
            const canvasEl = this._miniTileTexture(letter, 128);
            const texture = new THREE.CanvasTexture(canvasEl);

            const mat = new THREE.MeshStandardMaterial({
              map: texture,
              roughness: 0.4,
              metalness: 0.05,
              transparent: true,
              opacity: 0.7
            });

            const geo = new THREE.BoxGeometry(tileSize - gap, tileSize - gap, 0.04);
            const mesh = new THREE.Mesh(geo, mat);

            const offset = (idx) => (idx - (n - 1) / 2) * tileSize;

            switch (f) {
              case 0: mesh.position.set(offset(c), -offset(r), half); break;
              case 1:
                mesh.position.set(-offset(c), -offset(r), -half);
                mesh.rotation.y = Math.PI;
                break;
              case 2:
                mesh.position.set(offset(c), half, offset(r));
                mesh.rotation.x = -Math.PI / 2;
                break;
              case 3:
                mesh.position.set(offset(c), -half, -offset(r));
                mesh.rotation.x = Math.PI / 2;
                break;
              case 4:
                mesh.position.set(-half, -offset(r), -offset(c));
                mesh.rotation.y = -Math.PI / 2;
                break;
              case 5:
                mesh.position.set(half, -offset(r), offset(c));
                mesh.rotation.y = Math.PI / 2;
                break;
            }

            group.add(mesh);
          }
        }
      }

      // Core
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.9,
        transparent: true,
        opacity: 0.5
      });
      group.add(new THREE.Mesh(new THREE.BoxGeometry(size - 0.02, size - 0.02, size - 0.02), coreMat));

      // Random position
      group.position.set(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 8
      );

      // Random initial rotation
      group.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      this.scene.add(group);
      this.cubes.push({
        group,
        rotSpeed: {
          x: (Math.random() - 0.5) * 0.01,
          y: (Math.random() - 0.5) * 0.01,
          z: (Math.random() - 0.5) * 0.005
        },
        opacity: 0.7,
        fadeDir: -1,
        fadeSpeed: 0.0003 + Math.random() * 0.0005,
        respawnTimer: 0
      });
    }
  }

  _miniTileTexture(letter, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(4, 4, size - 8, size - 8);

    ctx.fillStyle = '#475569';
    ctx.font = `bold ${size * 0.5}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, size / 2, size / 2);

    return canvas;
  }

  _animate() {
    if (!this.running) return;
    requestAnimationFrame(() => this._animate());

    for (const cube of this.cubes) {
      // Rotate
      cube.group.rotation.x += cube.rotSpeed.x;
      cube.group.rotation.y += cube.rotSpeed.y;
      cube.group.rotation.z += cube.rotSpeed.z;

      // Fade out and respawn
      cube.opacity += cube.fadeDir * cube.fadeSpeed;

      if (cube.opacity <= 0) {
        cube.opacity = 0;
        cube.fadeDir = 1;
        // Respawn at new position
        cube.group.position.set(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 8
        );
        cube.rotSpeed = {
          x: (Math.random() - 0.5) * 0.01,
          y: (Math.random() - 0.5) * 0.01,
          z: (Math.random() - 0.5) * 0.005
        };
      } else if (cube.opacity >= 0.7) {
        cube.opacity = 0.7;
        cube.fadeDir = -1;
      }

      // Update material opacities
      cube.group.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.opacity = cube.opacity;
        }
      });
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.running = false;
    window.removeEventListener('resize', this._resizeHandler);

    // Dispose all cube resources
    for (const cube of this.cubes) {
      cube.group.traverse(child => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      });
      this.scene.remove(cube.group);
    }
    this.cubes = [];

    this.renderer.dispose();
  }
}
