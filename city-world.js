import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MODEL_URL = '/assets/models/new-york-city.glb';
const FOG_COLOR = 0x07111d;
const FOG_DENSITY = 0.0021;
const RAIN_COUNT = 3200;
const RAIN_VOLUME = Object.freeze({ width: 120, height: 72, depth: 120 });
const PERFORMANCE_UPDATE_INTERVAL = 500;
const DYNAMIC_RESOLUTION_SAMPLE_INTERVAL = 2000;
const DYNAMIC_RESOLUTION_COOLDOWN = 5000;
const DPR_LEVELS = Object.freeze([0.75, 1, 1.25, 1.5, 2]);

export const CITY_QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({ maxDpr: 0.75 }),
  medium: Object.freeze({ maxDpr: 1 }),
  high: Object.freeze({ maxDpr: 1.5 }),
  ultra: Object.freeze({ maxDpr: 2 }),
});

class LightingSystem {
  constructor(scene) {
    this.scene = scene;
    this.mode = null;
    this.ambientLight = new THREE.AmbientLight(0x7890ad, 0.62);
    this.directionalLight = new THREE.DirectionalLight(0xa9c8ff, 1.65);
    this.directionalLight.position.set(-0.65, 1.5, 0.8);
    this.scene.add(this.ambientLight, this.directionalLight);
    this.setMode('night');
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'night') return;
    this.ambientLight.color.setHex(0x7890ad);
    this.ambientLight.intensity = 0.62;
    this.directionalLight.color.setHex(0xa9c8ff);
    this.directionalLight.intensity = 1.65;
  }

  dispose() {
    this.scene.remove(this.ambientLight, this.directionalLight);
  }
}

class WeatherSystem {
  constructor(scene, camera, onWeatherChange) {
    this.scene = scene;
    this.camera = camera;
    this.onWeatherChange = onWeatherChange;
    this.type = 'clear';
    this.count = RAIN_COUNT;
    this.volume = RAIN_VOLUME;
    this.positions = new Float32Array(this.count * 3);
    this.speeds = new Float32Array(this.count);
    this.lengths = new Float32Array(this.count);
    this.alphas = new Float32Array(this.count);
    this.rain = this.createRainMesh();
    this.scene.add(this.rain);
    this.setWeather('rain');
  }

  createRainMesh() {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, 0, 0,
      1, 0, 0,
      1, 1, 0,
      -1, 0, 0,
      1, 1, 0,
      -1, 1, 0,
    ], 3));

    for (let index = 0; index < this.count; index += 1) {
      this.speeds[index] = THREE.MathUtils.randFloat(25, 54);
      this.lengths[index] = THREE.MathUtils.randFloat(0.7, 2.6);
      this.alphas[index] = THREE.MathUtils.randFloat(0.14, 0.55);
      this.respawnParticle(index, true);
    }

    const positionAttribute = new THREE.InstancedBufferAttribute(this.positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('instancePosition', positionAttribute);
    geometry.setAttribute('instanceSpeed', new THREE.InstancedBufferAttribute(this.speeds, 1));
    geometry.setAttribute('instanceLength', new THREE.InstancedBufferAttribute(this.lengths, 1));
    geometry.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(this.alphas, 1));
    geometry.instanceCount = this.count;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uFogColor: { value: new THREE.Color(FOG_COLOR) },
        uFogDensity: { value: FOG_DENSITY },
      },
      vertexShader: `
        attribute vec3 instancePosition;
        attribute float instanceSpeed;
        attribute float instanceLength;
        attribute float instanceAlpha;

        varying vec2 vRainUv;
        varying float vAlpha;
        varying float vViewDistance;

        void main() {
          vec3 rainDirection = normalize(vec3(0.14, -1.0, 0.035));
          vec3 toCamera = normalize(cameraPosition - instancePosition);
          vec3 side = cross(rainDirection, toCamera);
          side /= max(length(side), 0.001);

          float viewDistance = distance(cameraPosition, instancePosition);
          float nearFactor = 1.0 - smoothstep(22.0, 120.0, viewDistance);
          float visibleLength = instanceLength * mix(0.34, 1.15, nearFactor);
          visibleLength += instanceSpeed * 0.003 * nearFactor;
          float width = mix(0.01, 0.037, nearFactor);

          vec3 worldPosition = instancePosition;
          worldPosition += rainDirection * position.y * visibleLength;
          worldPosition += side * position.x * width;

          vRainUv = position.xy;
          vAlpha = instanceAlpha * mix(0.18, 0.78, nearFactor);
          vViewDistance = viewDistance;
          gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uFogColor;
        uniform float uFogDensity;

        varying vec2 vRainUv;
        varying float vAlpha;
        varying float vViewDistance;

        void main() {
          float edge = 1.0 - smoothstep(0.42, 1.0, abs(vRainUv.x));
          float tipFade = smoothstep(0.0, 0.1, vRainUv.y)
            * (1.0 - smoothstep(0.82, 1.0, vRainUv.y));
          float alpha = vAlpha * edge * tipFade;
          if (alpha < 0.01) discard;

          vec3 rainColor = vec3(0.58, 0.76, 0.95);
          float fogFactor = 1.0 - exp(
            -uFogDensity * uFogDensity * vViewDistance * vViewDistance
          );
          rainColor = mix(rainColor, uFogColor, clamp(fogFactor, 0.0, 0.88));
          gl_FragColor = vec4(rainColor, alpha);
        }
      `,
    });

    const rain = new THREE.Mesh(geometry, material);
    rain.frustumCulled = false;
    rain.renderOrder = 8;
    return rain;
  }

  respawnParticle(index, randomizeHeight) {
    const offset = index * 3;
    const bottom = Math.max(0.15, this.camera.position.y - this.volume.height * 0.44);
    const top = bottom + this.volume.height;
    this.positions[offset] = this.camera.position.x
      + THREE.MathUtils.randFloatSpread(this.volume.width);
    this.positions[offset + 1] = randomizeHeight
      ? THREE.MathUtils.randFloat(bottom, top)
      : THREE.MathUtils.randFloat(top - 8, top);
    this.positions[offset + 2] = this.camera.position.z
      + THREE.MathUtils.randFloatSpread(this.volume.depth);
  }

  setWeather(type) {
    this.type = type;
    this.rain.visible = type === 'rain';
    if (this.onWeatherChange) this.onWeatherChange(type);
  }

  update(deltaTime) {
    if (this.type !== 'rain') return;

    const halfWidth = this.volume.width * 0.5;
    const halfDepth = this.volume.depth * 0.5;
    const bottom = Math.max(0.15, this.camera.position.y - this.volume.height * 0.44);
    const top = bottom + this.volume.height;

    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 3;
      const speed = this.speeds[index];
      this.positions[offset] += speed * 0.14 * deltaTime;
      this.positions[offset + 1] -= speed * deltaTime;
      this.positions[offset + 2] += speed * 0.035 * deltaTime;

      const outsideHorizontalVolume = Math.abs(this.positions[offset] - this.camera.position.x) > halfWidth
        || Math.abs(this.positions[offset + 2] - this.camera.position.z) > halfDepth;
      const outsideVerticalVolume = this.positions[offset + 1] < bottom
        || this.positions[offset + 1] > top;

      if (outsideHorizontalVolume) {
        this.respawnParticle(index, true);
      } else if (outsideVerticalVolume) {
        this.respawnParticle(index, false);
      }
    }

    this.rain.geometry.getAttribute('instancePosition').needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.rain);
    this.rain.geometry.dispose();
    this.rain.material.dispose();
  }
}

class WalkController {
  constructor(camera, canvas, orbitControls, onExitRequest) {
    this.camera = camera;
    this.canvas = canvas;
    this.orbitControls = orbitControls;
    this.onExitRequest = onExitRequest;
    this.enabled = false;
    this.modelReady = false;
    this.walkHeight = 2.4;
    this.yaw = 0;
    this.pitch = 0;
    this.bounds = null;
    this.spawn = new THREE.Vector3();
    this.keys = new Set();
    this.savedOrbitPosition = new THREE.Vector3();
    this.savedOrbitQuaternion = new THREE.Quaternion();
    this.savedOrbitTarget = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.movement = new THREE.Vector3();
    this.lookDirection = new THREE.Vector3();

    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);

    document.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  configureForModel(box) {
    this.bounds = {
      minX: box.min.x - 8,
      maxX: box.max.x + 8,
      minZ: box.min.z - 8,
      maxZ: box.max.z + 8,
    };
    this.spawn.set(0, this.walkHeight, box.max.z - 2);
    this.modelReady = true;
  }

  enable() {
    if (this.enabled || !this.modelReady) return false;
    this.savedOrbitPosition.copy(this.camera.position);
    this.savedOrbitQuaternion.copy(this.camera.quaternion);
    this.savedOrbitTarget.copy(this.orbitControls.target);
    this.enabled = true;
    this.keys.clear();
    this.orbitControls.enabled = false;
    this.camera.position.copy(this.spawn);
    this.camera.lookAt(0, this.walkHeight, 0);
    this.camera.getWorldDirection(this.lookDirection);
    this.yaw = Math.atan2(-this.lookDirection.x, -this.lookDirection.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(this.lookDirection.y, -1, 1));
    this.applyRotation();
    return true;
  }

  disable(restoreOrbit) {
    if (!this.enabled) return;
    this.enabled = false;
    this.keys.clear();
    if (restoreOrbit !== false) {
      this.camera.position.copy(this.savedOrbitPosition);
      this.camera.quaternion.copy(this.savedOrbitQuaternion);
      this.orbitControls.target.copy(this.savedOrbitTarget);
    }
    this.orbitControls.enabled = true;
    this.orbitControls.update();
  }

  handleMouseMove(event) {
    if (!this.enabled) return;
    this.yaw -= event.movementX * 0.0021;
    this.pitch -= event.movementY * 0.0021;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      THREE.MathUtils.degToRad(-82),
      THREE.MathUtils.degToRad(82),
    );
    this.applyRotation();
  }

  handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (this.enabled && key === 'escape' && document.pointerLockElement !== this.canvas) {
      event.preventDefault();
      if (this.onExitRequest) this.onExitRequest();
      return;
    }
    if (!this.enabled || !['w', 'a', 's', 'd', 'shift'].includes(key)) return;
    event.preventDefault();
    this.keys.add(key);
  }

  handleKeyUp(event) {
    this.keys.delete(event.key.toLowerCase());
  }

  handleBlur() {
    this.keys.clear();
  }

  applyRotation() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  update(deltaTime) {
    if (!this.enabled || !this.bounds) return;

    const forwardInput = Number(this.keys.has('w')) - Number(this.keys.has('s'));
    const sideInput = Number(this.keys.has('d')) - Number(this.keys.has('a'));
    if (forwardInput === 0 && sideInput === 0) return;

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.movement.copy(this.forward).multiplyScalar(forwardInput);
    this.movement.addScaledVector(this.right, sideInput).normalize();
    const speed = this.keys.has('shift') ? 18 : 6.5;
    this.camera.position.addScaledVector(this.movement, speed * deltaTime);
    this.camera.position.x = THREE.MathUtils.clamp(
      this.camera.position.x,
      this.bounds.minX,
      this.bounds.maxX,
    );
    this.camera.position.y = this.walkHeight;
    this.camera.position.z = THREE.MathUtils.clamp(
      this.camera.position.z,
      this.bounds.minZ,
      this.bounds.maxZ,
    );
  }

  dispose() {
    document.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}

export class CityWorld {
  constructor(options) {
    const settings = options || {};
    if (!settings.canvas) throw new Error('CityWorld requires a canvas');

    this.canvas = settings.canvas;
    this.onProgress = settings.onProgress;
    this.onStatus = settings.onStatus;
    this.onStats = settings.onStats;
    this.onModeChange = settings.onModeChange;
    this.onWeatherChange = settings.onWeatherChange;
    this.onExitRequest = settings.onExitRequest;
    this.qualityPresetName = CITY_QUALITY_PRESETS[settings.qualityPreset]
      ? settings.qualityPreset
      : 'high';
    this.dynamicResolution = settings.dynamicResolution !== false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.camera.rotation.order = 'YXZ';
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.screenSpacePanning = true;
    this.lightingSystem = new LightingSystem(this.scene);
    this.weatherSystem = new WeatherSystem(
      this.scene,
      this.camera,
      this.onWeatherChange,
    );
    this.walkController = new WalkController(
      this.camera,
      this.canvas,
      this.controls,
      this.onExitRequest,
    );
    this.clock = new THREE.Clock(false);
    this.mode = 'orbit';
    this.active = false;
    this.initialized = false;
    this.disposed = false;
    this.animationFrameId = null;
    this.initPromise = null;
    this.loadedModel = null;
    this.helperGroup = null;
    this.modelStats = null;
    this.boundsInfo = null;
    this.modelLoadCount = 0;
    this.pixelRatioLevels = [];
    this.pixelRatioLevelIndex = 0;
    this.currentPixelRatio = 1;
    this.statsFrameCount = 0;
    this.statsElapsed = 0;
    this.statsFrameTimeTotal = 0;
    this.lastFrameTimestamp = 0;
    this.lastStats = { fps: 0, frameTime: 0 };
    this.dynamicFrameCount = 0;
    this.dynamicElapsed = 0;
    this.lowFpsSamples = 0;
    this.highFpsSamples = 0;
    this.lastResolutionAdjustment = 0;
    this.handleResize = this.resize.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.renderFrame = this.renderFrame.bind(this);
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.configurePixelRatioLevels(true);
    this.resize();
  }

  init() {
    if (this.disposed) return Promise.reject(new Error('CityWorld has been disposed'));
    if (this.initialized) return Promise.resolve(this);
    if (this.initPromise) return this.initPromise;

    if (this.onStatus) this.onStatus('loading');
    this.initPromise = this.loadModel().then(() => {
      this.initialized = true;
      if (this.onStatus) this.onStatus('ready');
      this.renderOnce();
      return this;
    }).catch((error) => {
      this.initPromise = null;
      if (this.onStatus) this.onStatus('error', error);
      throw error;
    });
    return this.initPromise;
  }

  loadModel() {
    this.modelLoadCount += 1;
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        MODEL_URL,
        (gltf) => {
          if (this.disposed) {
            reject(new Error('CityWorld was disposed while loading'));
            return;
          }
          this.loadedModel = gltf.scene;
          this.scene.add(this.loadedModel);
          try {
            this.boundsInfo = this.fitModelToView(this.loadedModel);
            this.modelStats = this.collectModelStats(this.loadedModel);
            if (this.onStats) this.onStats(this.getStats());
            resolve(this.loadedModel);
          } catch (error) {
            reject(error);
          }
        },
        (event) => {
          if (!this.onProgress) return;
          if (event.total > 0) {
            this.onProgress({
              percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
              loaded: event.loaded,
              total: event.total,
            });
          } else {
            this.onProgress({ percent: null, loaded: event.loaded, total: 0 });
          }
        },
        reject,
      );
    });
  }

  collectModelStats(root) {
    let meshes = 0;
    let triangles = 0;
    const textures = new Set();

    root.traverse((object) => {
      if (!object.isMesh) return;
      meshes += 1;
      const geometry = object.geometry;
      if (geometry) {
        const triangleCount = geometry.index
          ? geometry.index.count / 3
          : (geometry.attributes.position?.count || 0) / 3;
        triangles += triangleCount * (object.isInstancedMesh ? object.count : 1);
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        Object.values(material).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
      });
    });

    return { meshes, triangles: Math.round(triangles), textures: textures.size };
  }

  fitModelToView(model) {
    model.updateWorldMatrix(true, true);
    const originalBox = new THREE.Box3().setFromObject(model);
    if (originalBox.isEmpty()) throw new Error('模型没有可见的包围盒');

    const originalCenter = originalBox.getCenter(new THREE.Vector3());
    model.position.sub(new THREE.Vector3(
      originalCenter.x,
      originalBox.min.y,
      originalCenter.z,
    ));
    model.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const distance = (sphere.radius / Math.sin(limitingFov / 2)) * 1.18;
    const target = new THREE.Vector3(0, size.y * 0.28, 0);
    const viewDirection = new THREE.Vector3(1, 0.68, 1).normalize();

    this.camera.near = Math.max(distance / 2000, 0.03);
    this.camera.far = Math.max(distance + sphere.radius * 6, distance * 4);
    this.camera.position.copy(target).addScaledVector(viewDirection, distance);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(target);
    this.controls.minDistance = Math.max(sphere.radius * 0.03, 0.01);
    this.controls.maxDistance = sphere.radius * 12;
    this.controls.update();

    const horizontalSize = Math.max(size.x, size.z);
    this.helperGroup = new THREE.Group();
    const grid = new THREE.GridHelper(horizontalSize * 1.35, 20, 0x34516d, 0x1c2b3c);
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    const axes = new THREE.AxesHelper(Math.max(horizontalSize, size.y) * 0.08);
    this.helperGroup.add(grid, axes);
    this.scene.add(this.helperGroup);
    this.walkController.configureForModel(box);

    return {
      originalCenter,
      size,
      centeredBox: box,
      cameraDistance: distance,
    };
  }

  setMode(mode) {
    const normalizedMode = mode === 'walk' ? 'walk' : 'orbit';
    if (normalizedMode === this.mode && (
      normalizedMode !== 'walk' || this.walkController.enabled
    )) return;

    this.mode = normalizedMode;
    if (this.mode === 'walk') {
      this.walkController.enable();
    } else {
      this.walkController.disable(true);
      this.controls.enabled = true;
    }
    if (this.onModeChange) this.onModeChange(this.mode);
  }

  start(options) {
    if (!this.initialized || this.disposed) return false;
    this.setMode(options?.mode || 'walk');
    if (this.active) {
      this.resumeRendering();
      return true;
    }
    this.active = true;
    this.resetPerformanceSampling();
    this.resize();
    this.resumeRendering();
    return true;
  }

  stop() {
    this.active = false;
    this.pauseRendering();
    this.walkController.disable(true);
    this.mode = 'orbit';
    if (this.onModeChange) this.onModeChange(this.mode);
  }

  renderFrame(now) {
    if (!this.active || this.disposed || document.hidden) {
      this.animationFrameId = null;
      return;
    }

    const deltaTime = Math.min(this.clock.getDelta(), 0.05);
    if (this.mode === 'walk') {
      this.walkController.update(deltaTime);
    } else {
      this.controls.update();
    }
    this.weatherSystem.update(deltaTime);
    this.renderer.render(this.scene, this.camera);
    this.updatePerformance(now);
    if (this.active && !this.disposed && !document.hidden) {
      this.animationFrameId = requestAnimationFrame(this.renderFrame);
    }
  }

  resetPerformanceSampling() {
    this.statsFrameCount = 0;
    this.statsElapsed = 0;
    this.statsFrameTimeTotal = 0;
    this.dynamicFrameCount = 0;
    this.dynamicElapsed = 0;
    this.lowFpsSamples = 0;
    this.highFpsSamples = 0;
    this.lastFrameTimestamp = 0;
  }

  updatePerformance(now) {
    if (this.lastFrameTimestamp === 0) {
      this.lastFrameTimestamp = now;
      return;
    }

    const frameTime = Math.min(now - this.lastFrameTimestamp, 250);
    this.lastFrameTimestamp = now;
    this.statsFrameCount += 1;
    this.statsElapsed += frameTime;
    this.statsFrameTimeTotal += frameTime;
    this.dynamicFrameCount += 1;
    this.dynamicElapsed += frameTime;

    if (this.statsElapsed >= PERFORMANCE_UPDATE_INTERVAL) {
      this.lastStats.fps = Math.round((this.statsFrameCount * 1000) / this.statsElapsed);
      this.lastStats.frameTime = this.statsFrameTimeTotal / this.statsFrameCount;
      if (this.onStats) this.onStats(this.getStats());
      this.statsFrameCount = 0;
      this.statsElapsed = 0;
      this.statsFrameTimeTotal = 0;
    }

    if (this.dynamicResolution && this.dynamicElapsed >= DYNAMIC_RESOLUTION_SAMPLE_INTERVAL) {
      const averageFps = (this.dynamicFrameCount * 1000) / this.dynamicElapsed;
      this.adjustDynamicResolution(averageFps, now);
      this.dynamicFrameCount = 0;
      this.dynamicElapsed = 0;
    }
  }

  adjustDynamicResolution(averageFps, now) {
    if (averageFps < 45) {
      this.lowFpsSamples += 1;
      this.highFpsSamples = 0;
    } else if (averageFps > 58) {
      this.highFpsSamples += 1;
      this.lowFpsSamples = 0;
    } else {
      this.lowFpsSamples = 0;
      this.highFpsSamples = 0;
    }

    if (now - this.lastResolutionAdjustment < DYNAMIC_RESOLUTION_COOLDOWN) return;
    if (this.lowFpsSamples >= 2 && this.pixelRatioLevelIndex > 0) {
      this.pixelRatioLevelIndex -= 1;
      this.applyPixelRatio(this.pixelRatioLevels[this.pixelRatioLevelIndex]);
      this.lowFpsSamples = 0;
      this.lastResolutionAdjustment = now;
    } else if (
      this.highFpsSamples >= 4
      && this.pixelRatioLevelIndex < this.pixelRatioLevels.length - 1
    ) {
      this.pixelRatioLevelIndex += 1;
      this.applyPixelRatio(this.pixelRatioLevels[this.pixelRatioLevelIndex]);
      this.highFpsSamples = 0;
      this.lastResolutionAdjustment = now;
    }
  }

  configurePixelRatioLevels(useHighestLevel) {
    const deviceDpr = Math.max(0.5, window.devicePixelRatio || 1);
    const maximumDpr = Math.min(
      deviceDpr,
      CITY_QUALITY_PRESETS[this.qualityPresetName].maxDpr,
    );
    this.pixelRatioLevels = DPR_LEVELS.filter((level) => level <= maximumDpr);
    if (this.pixelRatioLevels.length === 0) this.pixelRatioLevels.push(maximumDpr);

    if (useHighestLevel) {
      this.pixelRatioLevelIndex = this.pixelRatioLevels.length - 1;
    } else {
      let nextIndex = 0;
      for (let index = 0; index < this.pixelRatioLevels.length; index += 1) {
        if (this.pixelRatioLevels[index] <= this.currentPixelRatio) nextIndex = index;
      }
      this.pixelRatioLevelIndex = nextIndex;
    }
    this.applyPixelRatio(this.pixelRatioLevels[this.pixelRatioLevelIndex]);
  }

  applyPixelRatio(pixelRatio) {
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return;
    if (Math.abs(this.currentPixelRatio - pixelRatio) < 0.001) return;
    this.currentPixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
  }

  setQualityPreset(presetName) {
    if (!CITY_QUALITY_PRESETS[presetName]) return false;
    this.qualityPresetName = presetName;
    this.configurePixelRatioLevels(true);
    this.lowFpsSamples = 0;
    this.highFpsSamples = 0;
    this.lastResolutionAdjustment = performance.now();
    return true;
  }

  pauseRendering() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.clock.stop();
    this.lastFrameTimestamp = 0;
    this.walkController.handleBlur();
    if (this.onStats) this.onStats(this.getStats());
  }

  resumeRendering() {
    if (!this.active || this.disposed || document.hidden || this.animationFrameId !== null) return;
    this.clock.start();
    this.lastFrameTimestamp = 0;
    this.animationFrameId = requestAnimationFrame(this.renderFrame);
    if (this.onStats) this.onStats(this.getStats());
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.pauseRendering();
    } else if (this.active) {
      this.resumeRendering();
    }
  }

  renderOnce() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.configurePixelRatioLevels(false);
    this.renderer.setSize(width, height, false);
  }

  getStats(runtimeStats) {
    return Object.assign({
      meshes: this.modelStats?.meshes || 0,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      drawCalls: this.renderer.info.render.calls,
      fps: this.lastStats.fps,
      frameTime: this.lastStats.frameTime,
      pixelRatio: this.currentPixelRatio,
      qualityPreset: this.qualityPresetName,
      isRendering: this.animationFrameId !== null,
      worldActive: this.active,
      modelLoaded: Boolean(this.initialized && this.loadedModel),
      modelLoadCount: this.modelLoadCount,
      cameraPosition: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      rainCount: this.weatherSystem.count,
      rainVolume: this.weatherSystem.volume,
      fogDensity: FOG_DENSITY,
      bounds: this.boundsInfo,
    }, runtimeStats || {});
  }

  getDebugState() {
    return {
      active: this.active,
      isRendering: this.animationFrameId !== null,
      modelLoaded: Boolean(this.initialized && this.loadedModel),
      modelLoadCount: this.modelLoadCount,
      qualityPreset: this.qualityPresetName,
      dynamicResolution: this.dynamicResolution,
      pixelRatio: this.currentPixelRatio,
      stats: this.getStats(),
    };
  }

  disposeSceneResources() {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    this.scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach((material) => {
        if (!material) return;
        materials.add(material);
        Object.values(material).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
      });
    });
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.walkController.dispose();
    this.controls.dispose();
    this.weatherSystem.dispose();
    this.lightingSystem.dispose();
    this.disposeSceneResources();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.loadedModel = null;
    this.helperGroup = null;
  }
}

export const CITY_WORLD_CONFIG = Object.freeze({
  modelUrl: MODEL_URL,
  fogColor: FOG_COLOR,
  fogDensity: FOG_DENSITY,
  rainCount: RAIN_COUNT,
  rainVolume: RAIN_VOLUME,
});
