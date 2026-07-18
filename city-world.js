import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MODEL_URL = '/assets/models/new-york-city.glb';
const NIGHT_SETTINGS_STORAGE_KEY = 'my-blog.city-world.night-rendering.v1';
const NIGHT_RENDER_DEFAULTS = Object.freeze({
  nightBackgroundColor: '#07111d',
  exposure: 1.05,
  fogDensityFactor: 1.45,
  moonIntensity: 1.35,
  moonColor: '#a9c8ff',
  ambientIntensity: 0.48,
  environmentIntensity: 0.28,
  existingEmissiveMultiplier: 1.35,
  fogEnabled: true,
  nightLightingEnabled: true,
});
const FOG_COLOR = Number.parseInt(NIGHT_RENDER_DEFAULTS.nightBackgroundColor.slice(1), 16);
const FOG_DENSITY = 0.0021;
const RAIN_SETTINGS_STORAGE_KEY = 'my-blog.city-world.rain-rendering.v2';
const RAIN_DEFAULTS = Object.freeze({
  enabled: true,
  intensity: 0.9,
  fallSpeed: 46,
  dropLength: 1.9,
  brightness: 1.25,
  dropWidth: 1.25,
  windX: 4.5,
  windZ: 1.2,
  volumeWidth: 120,
  volumeHeight: 72,
  volumeDepth: 120,
});
const RAIN_QUALITY_COUNTS = Object.freeze({
  low: 6000,
  medium: 12000,
  high: 20000,
  ultra: 32000,
});
const WET_SURFACE_STORAGE_KEY = 'my-blog.city-world.wet-surfaces.v1';
const WET_SURFACE_DEFAULTS = Object.freeze({
  enabled: true,
  wetness: 0.65,
  wetRoughnessTarget: 0.28,
  wetColorFactor: 0.88,
  clearcoat: 0.45,
  clearcoatRoughness: 0.22,
  autoWetnessFromRain: true,
  rainWetnessInfluence: 0.2,
});
const ROAD_NAME_PATTERN = /road|street|ground|asphalt|pavement|side[_\s-]?walk|curb|floor|lane|decal|stain/i;
const NON_ROAD_NAME_PATTERN = /roof|wall|facade|glass|window|door|foliage|bark|grass|lamp|sign|sky|solar|firescape|trash/i;
const PERFORMANCE_UPDATE_INTERVAL = 500;
const DYNAMIC_RESOLUTION_SAMPLE_INTERVAL = 2000;
const DYNAMIC_RESOLUTION_COOLDOWN = 5000;
const DPR_LEVELS = Object.freeze([0.75, 1, 1.25, 1.5, 2]);
const ANISOTROPY_MATERIAL_PATTERN = /streets|side[_\s-]?walks|curb|roof/i;

export const CITY_RENDER_SETTINGS = Object.freeze({
  toneMapping: 'aces',
  exposure: NIGHT_RENDER_DEFAULTS.exposure,
});

export const CITY_QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({
    maxDpr: 0.75,
    toneMapping: 'aces',
    exposure: 1.05,
    anisotropy: 1,
    environmentEnabled: false,
    environmentIntensityScale: 0,
    emissiveIntensityScale: 0.72,
    shaderWarmup: false,
  }),
  medium: Object.freeze({
    maxDpr: 1,
    toneMapping: 'aces',
    exposure: 1.05,
    anisotropy: 2,
    environmentEnabled: false,
    environmentIntensityScale: 0.72,
    emissiveIntensityScale: 0.88,
    shaderWarmup: true,
  }),
  high: Object.freeze({
    maxDpr: 1.5,
    toneMapping: 'aces',
    exposure: 1.05,
    anisotropy: 4,
    environmentEnabled: false,
    environmentIntensityScale: 1,
    emissiveIntensityScale: 1,
    shaderWarmup: true,
  }),
  ultra: Object.freeze({
    maxDpr: 2,
    toneMapping: 'aces',
    exposure: 1.05,
    anisotropy: 8,
    environmentEnabled: true,
    environmentIntensityScale: 1.18,
    emissiveIntensityScale: 1.08,
    shaderWarmup: true,
  }),
});

function resolveToneMapping(name) {
  const toneMappings = {
    agx: THREE.AgXToneMapping,
    aces: THREE.ACESFilmicToneMapping,
    neutral: THREE.NeutralToneMapping,
  };
  return Number.isFinite(toneMappings[name])
    ? toneMappings[name]
    : THREE.ACESFilmicToneMapping;
}

function loadNightSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NIGHT_SETTINGS_STORAGE_KEY));
    if (!parsed || typeof parsed !== 'object') return { ...NIGHT_RENDER_DEFAULTS };
    const settings = { ...NIGHT_RENDER_DEFAULTS };
    Object.keys(settings).forEach((key) => {
      if (typeof parsed[key] === typeof settings[key]) settings[key] = parsed[key];
    });
    return settings;
  } catch (error) {
    return { ...NIGHT_RENDER_DEFAULTS };
  }
}

function saveNightSettings(settings) {
  try {
    localStorage.setItem(NIGHT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('City night settings could not be saved.');
  }
}

function loadRainSettings() {
  try {
    const raw = localStorage.getItem(RAIN_SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') {
      return { settings: { ...RAIN_DEFAULTS }, restored: false };
    }
    const settings = { ...RAIN_DEFAULTS };
    Object.keys(settings).forEach((key) => {
      if (typeof parsed[key] === typeof settings[key]) settings[key] = parsed[key];
    });
    return { settings, restored: true };
  } catch (error) {
    return { settings: { ...RAIN_DEFAULTS }, restored: false };
  }
}

function saveRainSettings(settings) {
  try {
    localStorage.setItem(RAIN_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('City rain settings could not be saved.');
  }
}

function loadWetSurfaceSettings() {
  try {
    const raw = localStorage.getItem(WET_SURFACE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') {
      return {
        settings: { ...WET_SURFACE_DEFAULTS },
        selectedPaths: null,
      };
    }
    const settings = { ...WET_SURFACE_DEFAULTS };
    const ranges = {
      wetness: [0, 1],
      wetRoughnessTarget: [0.08, 1],
      wetColorFactor: [0.65, 1],
      clearcoat: [0, 1],
      clearcoatRoughness: [0.05, 0.6],
      rainWetnessInfluence: [0, 0.5],
    };
    Object.keys(settings).forEach((key) => {
      const value = parsed.settings?.[key];
      if (typeof settings[key] === 'boolean' && typeof value === 'boolean') {
        settings[key] = value;
      } else if (ranges[key] && Number.isFinite(value)) {
        settings[key] = Math.min(ranges[key][1], Math.max(ranges[key][0], value));
      }
    });
    return {
      settings,
      selectedPaths: Array.isArray(parsed.selectedPaths)
        ? parsed.selectedPaths.filter((path) => typeof path === 'string')
        : null,
    };
  } catch (error) {
    return {
      settings: { ...WET_SURFACE_DEFAULTS },
      selectedPaths: null,
    };
  }
}

function saveWetSurfaceSettings(settings, selectedPaths) {
  try {
    localStorage.setItem(WET_SURFACE_STORAGE_KEY, JSON.stringify({
      settings,
      selectedPaths: Array.from(selectedPaths),
    }));
  } catch (error) {
    console.warn('City wet surface settings could not be saved.');
  }
}

class LightingSystem {
  constructor(scene) {
    this.scene = scene;
    this.mode = null;
    this.ambientLight = new THREE.AmbientLight(0x7890ad, NIGHT_RENDER_DEFAULTS.ambientIntensity);
    this.directionalLight = new THREE.DirectionalLight(
      NIGHT_RENDER_DEFAULTS.moonColor,
      NIGHT_RENDER_DEFAULTS.moonIntensity,
    );
    this.directionalLight.position.set(-0.65, 1.5, 0.8);
    this.moonTarget = new THREE.Object3D();
    this.directionalLight.target = this.moonTarget;
    this.scene.add(this.ambientLight, this.directionalLight, this.moonTarget);
    this.setMode('night', NIGHT_RENDER_DEFAULTS);
  }

  setMode(mode, settings) {
    this.mode = mode;
    const enabled = mode === 'night' && settings.nightLightingEnabled;
    this.ambientLight.visible = enabled;
    this.directionalLight.visible = enabled;
    if (!enabled) return;
    this.ambientLight.color.setHex(0x7890ad);
    this.ambientLight.intensity = settings.ambientIntensity;
    this.directionalLight.color.set(settings.moonColor);
    this.directionalLight.intensity = settings.moonIntensity;
  }

  configureForBounds(box, diagonal) {
    const center = box.getCenter(new THREE.Vector3());
    const scale = Math.max(diagonal, 1);
    this.directionalLight.position.set(
      center.x - scale * 0.42,
      box.max.y + scale * 0.32,
      center.z + scale * 0.28,
    );
    this.moonTarget.position.copy(center);
    this.directionalLight.target.updateMatrixWorld();
  }

  dispose() {
    this.scene.remove(this.ambientLight, this.directionalLight, this.moonTarget);
  }

  getStats() {
    return {
      ambient: 1,
      hemisphere: 0,
      directional: 1,
      point: 0,
      spot: 0,
      ambientIntensity: this.ambientLight.intensity,
      moonIntensity: this.directionalLight.intensity,
      moonColor: `#${this.directionalLight.color.getHexString()}`,
      moonPosition: this.directionalLight.position.toArray(),
    };
  }
}

class EnvironmentLightingSystem {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmremGenerator = null;
    this.renderTarget = null;
    this.environmentTexture = null;
  }

  createEnvironment() {
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();
    const width = 32;
    const height = 16;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const vertical = y / (height - 1);
      const horizon = Math.max(0, 1 - Math.abs(vertical - 0.52) * 5.5);
      const ground = vertical > 0.56 ? (vertical - 0.56) / 0.44 : 0;
      const red = Math.round(7 + horizon * 34 - ground * 3);
      const green = Math.round(15 + horizon * 43 - ground * 8);
      const blue = Math.round(28 + horizon * 55 - ground * 13);
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = red;
        data[offset + 1] = green;
        data[offset + 2] = blue;
        data[offset + 3] = 255;
      }
    }

    const sourceTexture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    sourceTexture.colorSpace = THREE.SRGBColorSpace;
    sourceTexture.mapping = THREE.EquirectangularReflectionMapping;
    sourceTexture.needsUpdate = true;
    this.renderTarget = this.pmremGenerator.fromEquirectangular(sourceTexture);
    this.environmentTexture = this.renderTarget.texture;
    sourceTexture.dispose();
    this.pmremGenerator.dispose();
    this.pmremGenerator = null;
  }

  apply(enabled, intensity, materials) {
    if (enabled && !this.environmentTexture) this.createEnvironment();
    this.scene.environment = enabled ? this.environmentTexture : null;
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = intensity;
    materials?.forEach((material) => {
      if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
        material.envMapIntensity = intensity;
      }
    });
  }

  dispose() {
    if (this.scene.environment === this.environmentTexture) this.scene.environment = null;
    this.renderTarget?.dispose();
    this.pmremGenerator?.dispose();
    this.renderTarget = null;
    this.environmentTexture = null;
  }
}

class WetSurfaceSystem {
  constructor(root, modelBounds, qualityPreset, rainIntensity) {
    this.root = root;
    this.modelBounds = modelBounds;
    this.qualityPreset = qualityPreset;
    this.rainIntensity = rainIntensity;
    const stored = loadWetSurfaceSettings();
    this.settings = stored.settings;
    this.selectedPaths = new Set();
    this.candidates = [];
    this.candidatesByPath = new Map();
    this.materialUsage = new Map();
    this.records = new Map();
    this.defaultSelectedPaths = new Set();
    this.highlightedPath = null;
    this.highlightMaterials = [];
    this.highlightPreviousMaterial = null;
    this.sharedMaterialConflicts = 0;
    this.tempBox = new THREE.Box3();
    this.tempSize = new THREE.Vector3();
    this.tempNormal = new THREE.Vector3();
    this.normalMatrix = new THREE.Matrix3();
    this.analyzeCandidates();

    const initialPaths = stored.selectedPaths === null
      ? this.defaultSelectedPaths
      : new Set(stored.selectedPaths.filter((path) => this.candidatesByPath.has(path)));
    initialPaths.forEach((path) => this.selectSurface(path, true, false));
    this.applyWetness();
    if (stored.selectedPaths === null) this.save();
  }

  getStablePath(object) {
    const segments = [];
    let current = object;
    while (current && current !== this.root) {
      const siblings = current.parent?.children || [];
      const siblingIndex = siblings.indexOf(current);
      segments.push(`${current.name || current.type || 'node'}[${siblingIndex}]`);
      current = current.parent;
    }
    return `/${segments.reverse().join('/')}`;
  }

  collectMaterialUsage() {
    this.root.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        if (!this.materialUsage.has(material)) this.materialUsage.set(material, new Set());
        this.materialUsage.get(material).add(object);
      });
    });
  }

  getHorizontalRatio(mesh) {
    const normals = mesh.geometry?.attributes?.normal;
    if (!normals || normals.count === 0) return 0;
    this.normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const step = Math.max(1, Math.floor(normals.count / 192));
    let horizontal = 0;
    let sampled = 0;
    for (let index = 0; index < normals.count; index += step) {
      this.tempNormal.fromBufferAttribute(normals, index)
        .applyNormalMatrix(this.normalMatrix)
        .normalize();
      if (this.tempNormal.y > 0.72) horizontal += 1;
      sampled += 1;
    }
    return sampled > 0 ? horizontal / sampled : 0;
  }

  analyzeCandidates() {
    this.root.updateWorldMatrix(true, true);
    this.collectMaterialUsage();
    const modelSize = this.modelBounds.size;
    const modelArea = Math.max(modelSize.x * modelSize.z, 0.001);
    const bottomBand = Math.max(modelSize.y * 0.1, 0.5);

    this.root.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry) return;
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        .filter(Boolean);
      const pbrMaterials = materials.filter(
        (material) => material.isMeshStandardMaterial || material.isMeshPhysicalMaterial,
      );
      if (pbrMaterials.length === 0) return;

      this.tempBox.setFromObject(mesh);
      if (this.tempBox.isEmpty()) return;
      this.tempBox.getSize(this.tempSize);
      const xzArea = this.tempSize.x * this.tempSize.z;
      const areaRatio = xzArea / modelArea;
      const relativeBottom = this.tempBox.min.y - this.modelBounds.centeredBox.min.y;
      const horizontalRatio = this.getHorizontalRatio(mesh);
      const materialNames = materials.map((material) => material.name || '').join(' ');
      const searchableName = `${mesh.name || ''} ${materialNames}`;
      const hasRoadNameSignal = ROAD_NAME_PATTERN.test(searchableName);
      const hasNonRoadNameSignal = NON_ROAD_NAME_PATTERN.test(searchableName);
      const reasons = [];
      let score = 0;

      if (relativeBottom <= bottomBand) {
        score += 28;
        reasons.push('位于模型底部区域');
      }
      if (areaRatio >= 0.004) {
        score += 18;
        reasons.push('XZ 覆盖面积较大');
      }
      if (areaRatio >= 0.02) score += 12;
      if (horizontalRatio >= 0.68) {
        score += 28;
        reasons.push('主要为朝上的水平表面');
      } else if (horizontalRatio >= 0.4) {
        score += 12;
        reasons.push('包含较多水平表面');
      }
      if (hasRoadNameSignal) {
        score += 22;
        reasons.push('节点或材质名称包含道路辅助信号');
      }
      if (hasNonRoadNameSignal) {
        score -= 32;
        reasons.push('名称包含建筑或非道路信号');
      }
      if (this.tempSize.y > Math.max(this.tempSize.x, this.tempSize.z) * 0.8) {
        score -= 18;
        reasons.push('垂直尺寸偏大');
      }
      if (score < 38) return;

      const path = this.getStablePath(mesh);
      const sharedMaterial = materials.some(
        (material) => (this.materialUsage.get(material)?.size || 0) > 1,
      );
      const candidate = {
        path,
        mesh,
        meshName: mesh.name || '(未命名 Mesh)',
        materialName: materialNames || '(未命名材质)',
        materialType: Array.from(new Set(materials.map((material) => material.type))).join(', '),
        bounds: {
          min: this.tempBox.min.toArray(),
          max: this.tempBox.max.toArray(),
        },
        relativeBottom,
        xzArea,
        horizontalRatio,
        score,
        reasons,
        sharedMaterial,
        roughness: pbrMaterials[0].roughness,
        metalness: pbrMaterials[0].metalness,
        hasRoughnessMap: pbrMaterials.some((material) => Boolean(material.roughnessMap)),
        hasNormalMap: pbrMaterials.some((material) => Boolean(material.normalMap)),
      };
      this.candidates.push(candidate);
      this.candidatesByPath.set(path, candidate);
      const maximumMetalness = Math.max(...pbrMaterials.map(
        (material) => Number.isFinite(material.metalness) ? material.metalness : 0,
      ));
      if (score >= 70
        && relativeBottom <= bottomBand
        && hasRoadNameSignal
        && !hasNonRoadNameSignal
        && maximumMetalness < 0.5) {
        this.defaultSelectedPaths.add(path);
      }
      if (sharedMaterial) this.sharedMaterialConflicts += 1;
    });

    this.candidates.sort((a, b) => b.score - a.score || b.xzArea - a.xzArea);
    console.info('City wet surface candidate audit:', {
      candidates: this.candidates.length,
      highConfidence: this.defaultSelectedPaths.size,
      sharedMaterialConflicts: this.sharedMaterialConflicts,
    });
  }

  copyStandardToPhysical(source) {
    const target = new THREE.MeshPhysicalMaterial();
    THREE.Material.prototype.copy.call(target, source);
    target.name = `${source.name || 'material'}__wet`;
    target.color.copy(source.color);
    target.roughness = source.roughness;
    target.metalness = source.metalness;
    target.map = source.map;
    target.lightMap = source.lightMap;
    target.lightMapIntensity = source.lightMapIntensity;
    target.aoMap = source.aoMap;
    target.aoMapIntensity = source.aoMapIntensity;
    target.emissive.copy(source.emissive);
    target.emissiveIntensity = source.emissiveIntensity;
    target.emissiveMap = source.emissiveMap;
    target.bumpMap = source.bumpMap;
    target.bumpScale = source.bumpScale;
    target.normalMap = source.normalMap;
    target.normalMapType = source.normalMapType;
    if (source.normalScale) target.normalScale.copy(source.normalScale);
    target.displacementMap = source.displacementMap;
    target.displacementScale = source.displacementScale;
    target.displacementBias = source.displacementBias;
    target.roughnessMap = source.roughnessMap;
    target.metalnessMap = source.metalnessMap;
    target.alphaMap = source.alphaMap;
    target.envMap = source.envMap;
    if (source.envMapRotation) target.envMapRotation.copy(source.envMapRotation);
    target.envMapIntensity = source.envMapIntensity;
    target.wireframe = source.wireframe;
    target.wireframeLinewidth = source.wireframeLinewidth;
    target.flatShading = source.flatShading;
    target.fog = source.fog;
    return target;
  }

  createWetMaterial(source) {
    const usePhysical = (this.qualityPreset === 'high' || this.qualityPreset === 'ultra')
      && source.isMeshStandardMaterial;
    const material = usePhysical
      ? this.copyStandardToPhysical(source)
      : source.clone();
    material.name = `${source.name || 'material'}__wet`;
    return {
      material,
      source,
      originalColor: source.color?.clone() || null,
      originalRoughness: Number.isFinite(source.roughness) ? source.roughness : 1,
      originalMetalness: Number.isFinite(source.metalness) ? source.metalness : 0,
      originalEnvMapIntensity: Number.isFinite(source.envMapIntensity)
        ? source.envMapIntensity
        : 1,
      originalClearcoat: Number.isFinite(source.clearcoat) ? source.clearcoat : 0,
      originalClearcoatRoughness: Number.isFinite(source.clearcoatRoughness)
        ? source.clearcoatRoughness
        : 0,
    };
  }

  ensureRecord(path) {
    if (this.records.has(path)) return this.records.get(path);
    const candidate = this.candidatesByPath.get(path);
    if (!candidate) return null;
    const sourceMaterials = Array.isArray(candidate.mesh.material)
      ? candidate.mesh.material
      : [candidate.mesh.material];
    const materialStates = sourceMaterials.map((material) => this.createWetMaterial(material));
    const record = {
      path,
      mesh: candidate.mesh,
      originalMaterial: candidate.mesh.material,
      wetMaterial: Array.isArray(candidate.mesh.material)
        ? materialStates.map((state) => state.material)
        : materialStates[0].material,
      materialStates,
      active: false,
    };
    this.records.set(path, record);
    return record;
  }

  getEffectiveWetness() {
    if (!this.settings.enabled) return 0;
    const rainContribution = this.settings.autoWetnessFromRain
      ? this.rainIntensity * this.settings.rainWetnessInfluence
      : 0;
    return THREE.MathUtils.clamp(this.settings.wetness + rainContribution, 0, 1);
  }

  applyRecord(record, wetness) {
    if (!record.active) {
      record.mesh.material = record.originalMaterial;
      return;
    }
    if (wetness <= 0.0001) {
      record.mesh.material = record.originalMaterial;
      return;
    }
    record.mesh.material = record.wetMaterial;
    const qualityClearcoat = this.qualityPreset === 'ultra'
      ? 1.12
      : (this.qualityPreset === 'high' ? 1 : 0);
    record.materialStates.forEach((state) => {
      const material = state.material;
      material.roughness = THREE.MathUtils.lerp(
        state.originalRoughness,
        this.settings.wetRoughnessTarget,
        wetness,
      );
      material.metalness = state.originalMetalness;
      if (state.originalColor && material.color) {
        material.color.copy(state.originalColor).multiplyScalar(
          THREE.MathUtils.lerp(1, this.settings.wetColorFactor, wetness),
        );
      }
      if (Number.isFinite(material.envMapIntensity)) {
        material.envMapIntensity = state.originalEnvMapIntensity * (1 + wetness * 0.3);
      }
      if (material.isMeshPhysicalMaterial) {
        material.clearcoat = THREE.MathUtils.lerp(
          state.originalClearcoat,
          this.settings.clearcoat * qualityClearcoat,
          wetness,
        );
        material.clearcoatRoughness = THREE.MathUtils.lerp(
          state.originalClearcoatRoughness,
          this.settings.clearcoatRoughness,
          wetness,
        );
      }
    });
  }

  applyWetness() {
    const wetness = this.getEffectiveWetness();
    this.records.forEach((record) => this.applyRecord(record, wetness));
  }

  selectSurface(path, selected, persist = true) {
    this.clearHighlight();
    const candidate = this.candidatesByPath.get(path);
    if (!candidate) return false;
    const record = this.ensureRecord(path);
    record.active = Boolean(selected);
    if (selected) this.selectedPaths.add(path);
    else this.selectedPaths.delete(path);
    this.applyRecord(record, this.getEffectiveWetness());
    if (persist) this.save();
    return true;
  }

  replaceSelection(paths, persist = true) {
    this.clearHighlight();
    const nextPaths = new Set(Array.from(paths).filter((path) => this.candidatesByPath.has(path)));
    this.records.forEach((record, path) => {
      record.active = nextPaths.has(path);
      this.applyRecord(record, this.getEffectiveWetness());
    });
    nextPaths.forEach((path) => {
      const record = this.ensureRecord(path);
      record.active = true;
      this.applyRecord(record, this.getEffectiveWetness());
    });
    this.selectedPaths = nextPaths;
    if (persist) this.save();
  }

  autoSelect() {
    this.replaceSelection(this.defaultSelectedPaths, true);
    return this.getState();
  }

  restoreDefaultSelection() {
    this.replaceSelection(this.defaultSelectedPaths, true);
    return this.getState();
  }

  clearSelection() {
    this.replaceSelection([], true);
    return this.getState();
  }

  updateSettings(partialSettings, persist = true) {
    const next = { ...this.settings };
    const ranges = {
      wetness: [0, 1],
      wetRoughnessTarget: [0.08, 1],
      wetColorFactor: [0.65, 1],
      clearcoat: [0, 1],
      clearcoatRoughness: [0.05, 0.6],
      rainWetnessInfluence: [0, 0.5],
    };
    Object.entries(partialSettings || {}).forEach(([key, value]) => {
      if (!(key in next)) return;
      if (key === 'enabled' || key === 'autoWetnessFromRain') next[key] = Boolean(value);
      else if (ranges[key] && Number.isFinite(Number(value))) {
        next[key] = THREE.MathUtils.clamp(Number(value), ranges[key][0], ranges[key][1]);
      }
    });
    this.settings = next;
    this.applyWetness();
    if (persist) this.save();
    return this.getState();
  }

  setRainIntensity(intensity) {
    const nextIntensity = THREE.MathUtils.clamp(Number(intensity) || 0, 0, 1);
    if (Math.abs(nextIntensity - this.rainIntensity) < 0.02) return;
    this.rainIntensity = nextIntensity;
    if (this.settings.autoWetnessFromRain) this.applyWetness();
  }

  setQuality(qualityPreset) {
    if (qualityPreset === this.qualityPreset) return;
    this.clearHighlight();
    this.qualityPreset = qualityPreset;
    this.records.forEach((record) => {
      record.mesh.material = record.originalMaterial;
      record.materialStates.forEach((state) => state.material.dispose());
    });
    const selected = new Set(this.selectedPaths);
    this.records.clear();
    selected.forEach((path) => {
      const record = this.ensureRecord(path);
      record.active = true;
    });
    this.applyWetness();
  }

  highlightCandidate(path) {
    if (this.highlightedPath === path) {
      this.clearHighlight();
      return false;
    }
    this.clearHighlight();
    const candidate = this.candidatesByPath.get(path);
    if (!candidate) return false;
    this.highlightPreviousMaterial = candidate.mesh.material;
    const sourceMaterials = Array.isArray(candidate.mesh.material)
      ? candidate.mesh.material
      : [candidate.mesh.material];
    this.highlightMaterials = sourceMaterials.map(() => new THREE.MeshBasicMaterial({
      color: 0x00d7ff,
      transparent: true,
      opacity: 0.72,
      depthTest: true,
      depthWrite: false,
    }));
    candidate.mesh.material = Array.isArray(candidate.mesh.material)
      ? this.highlightMaterials
      : this.highlightMaterials[0];
    this.highlightedPath = path;
    return true;
  }

  clearHighlight() {
    if (!this.highlightedPath) return;
    const candidate = this.candidatesByPath.get(this.highlightedPath);
    if (candidate) candidate.mesh.material = this.highlightPreviousMaterial;
    this.highlightMaterials.forEach((material) => material.dispose());
    this.highlightMaterials = [];
    this.highlightPreviousMaterial = null;
    this.highlightedPath = null;
  }

  getCandidateView(path) {
    const candidate = this.candidatesByPath.get(path);
    if (!candidate) return null;
    const box = new THREE.Box3(
      new THREE.Vector3().fromArray(candidate.bounds.min),
      new THREE.Vector3().fromArray(candidate.bounds.max),
    );
    return {
      center: box.getCenter(new THREE.Vector3()),
      size: box.getSize(new THREE.Vector3()),
    };
  }

  resetSettings() {
    this.settings = { ...WET_SURFACE_DEFAULTS };
    this.applyWetness();
    this.save();
    return this.getState();
  }

  save() {
    saveWetSurfaceSettings(this.settings, this.selectedPaths);
  }

  getCandidates() {
    return this.candidates.map((candidate) => ({
      path: candidate.path,
      meshName: candidate.meshName,
      materialName: candidate.materialName,
      materialType: candidate.materialType,
      bounds: candidate.bounds,
      relativeBottom: candidate.relativeBottom,
      xzArea: candidate.xzArea,
      horizontalRatio: candidate.horizontalRatio,
      score: candidate.score,
      reasons: candidate.reasons,
      sharedMaterial: candidate.sharedMaterial,
      roughness: candidate.roughness,
      metalness: candidate.metalness,
      hasRoughnessMap: candidate.hasRoughnessMap,
      hasNormalMap: candidate.hasNormalMap,
      selected: this.selectedPaths.has(candidate.path),
    }));
  }

  getState() {
    let clonedMaterialCount = 0;
    let physicalMaterialCount = 0;
    let standardMaterialCount = 0;
    const wetShaderTypes = new Set();
    this.records.forEach((record) => {
      clonedMaterialCount += record.materialStates.length;
      record.materialStates.forEach((state) => {
        wetShaderTypes.add(state.material.type);
        if (state.material.isMeshPhysicalMaterial) physicalMaterialCount += 1;
        else if (state.material.isMeshStandardMaterial) standardMaterialCount += 1;
      });
    });
    return {
      ...this.settings,
      effectiveWetness: this.getEffectiveWetness(),
      candidateCount: this.candidates.length,
      highConfidenceCount: this.defaultSelectedPaths.size,
      selectedSurfaceCount: this.selectedPaths.size,
      clonedMaterialCount,
      physicalMaterialCount,
      standardMaterialCount,
      wetShaderPrograms: wetShaderTypes.size,
      sharedMaterialConflicts: this.sharedMaterialConflicts,
      wetDrawCallDifference: 0,
      highlightedPath: this.highlightedPath,
      qualityPreset: this.qualityPreset,
    };
  }

  dispose() {
    this.clearHighlight();
    this.records.forEach((record) => {
      record.mesh.material = record.originalMaterial;
      record.materialStates.forEach((state) => state.material.dispose());
    });
    this.records.clear();
    this.candidates.length = 0;
    this.candidatesByPath.clear();
    this.materialUsage.clear();
  }
}

class RainSystem {
  constructor(scene, camera, qualityPreset, onWeatherChange) {
    this.scene = scene;
    this.camera = camera;
    this.onWeatherChange = onWeatherChange;
    const stored = loadRainSettings();
    this.settings = stored.settings;
    this.hasStoredSettings = stored.restored;
    this.qualityPreset = qualityPreset;
    this.count = RAIN_QUALITY_COUNTS[qualityPreset];
    this.type = 'rain';
    this.time = 0;
    this.cameraRight = new THREE.Vector3(1, 0, 0);
    this.cameraUp = new THREE.Vector3(0, 1, 0);
    this.cameraForward = new THREE.Vector3(0, 0, -1);
    this.rainCenter = new THREE.Vector3();
    this.material = this.createMaterial();
    this.geometry = this.createGeometry(this.count);
    this.rain = new THREE.Mesh(this.geometry, this.material);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 8;
    this.scene.add(this.rain);
    this.updateSettings(this.settings, false);
  }

  createGeometry(count) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, 0, 0,
      1, 0, 0,
      1, 1, 0,
      -1, 0, 0,
      1, 1, 0,
      -1, 1, 0,
    ], 3));

    const origins = new Float32Array(count * 3);
    const variations = new Float32Array(count * 4);
    for (let index = 0; index < count; index += 1) {
      const originOffset = index * 3;
      const variationOffset = index * 4;
      origins[originOffset] = Math.random() - 0.5;
      origins[originOffset + 1] = Math.random();
      origins[originOffset + 2] = Math.random() - 0.5;
      variations[variationOffset] = THREE.MathUtils.randFloat(0.72, 1.28);
      variations[variationOffset + 1] = THREE.MathUtils.randFloat(0.62, 1.38);
      variations[variationOffset + 2] = THREE.MathUtils.randFloat(0.28, 0.82);
      variations[variationOffset + 3] = Math.random();
    }
    geometry.setAttribute('instanceOrigin', new THREE.InstancedBufferAttribute(origins, 3));
    geometry.setAttribute('instanceVariation', new THREE.InstancedBufferAttribute(variations, 4));
    geometry.instanceCount = count;
    return geometry;
  }

  createMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uRainCenter: { value: new THREE.Vector3() },
        uCameraRight: { value: new THREE.Vector3(1, 0, 0) },
        uCameraUp: { value: new THREE.Vector3(0, 1, 0) },
        uVolumeSize: { value: new THREE.Vector3(120, 72, 120) },
        uWind: { value: new THREE.Vector2(4.5, 1.2) },
        uFallSpeed: { value: 42 },
        uDropLength: { value: 1.9 },
        uDropWidth: { value: 1.25 },
        uIntensity: { value: 0.9 },
        uBrightness: { value: 1.25 },
        uFogColor: { value: new THREE.Color(FOG_COLOR) },
        uFogDensity: { value: FOG_DENSITY },
      },
      vertexShader: `
        attribute vec3 instanceOrigin;
        attribute vec4 instanceVariation;

        uniform float uTime;
        uniform vec3 uRainCenter;
        uniform vec3 uCameraRight;
        uniform vec3 uCameraUp;
        uniform vec3 uVolumeSize;
        uniform vec2 uWind;
        uniform float uFallSpeed;
        uniform float uDropLength;
        uniform float uDropWidth;
        uniform float uIntensity;
        uniform float uBrightness;

        varying vec2 vRainUv;
        varying float vAlpha;
        varying float vViewDistance;

        void main() {
          float speed = uFallSpeed * instanceVariation.x;
          float fallProgress = fract(instanceOrigin.y + instanceVariation.w + uTime * speed / uVolumeSize.y);
          vec3 rainDirection = normalize(vec3(uWind.x, -uFallSpeed, uWind.y));
          vec3 dropCenter = uRainCenter;
          dropCenter.x += instanceOrigin.x * uVolumeSize.x + uWind.x * fallProgress;
          dropCenter.y += (0.56 - fallProgress) * uVolumeSize.y;
          dropCenter.z += instanceOrigin.z * uVolumeSize.z + uWind.y * fallProgress;

          float viewDistance = distance(cameraPosition, dropCenter);
          float farDistance = max(uVolumeSize.x, uVolumeSize.z) * 0.9;
          float nearFade = smoothstep(2.2, 7.5, viewDistance);
          float farFade = 1.0 - smoothstep(farDistance * 0.65, farDistance, viewDistance);
          float nearDetail = 1.0 - smoothstep(18.0, farDistance, viewDistance);
          float visibleLength = uDropLength * instanceVariation.y * mix(0.48, 1.18, nearDetail);
          float width = mix(0.035, 0.09, nearDetail) * uDropWidth;
          vec3 toCamera = normalize(cameraPosition - dropCenter);
          vec3 projectedDirection = rainDirection
            - toCamera * dot(rainDirection, toCamera);
          float projectionStrength = length(projectedDirection);
          vec3 projectedStreak = projectedDirection / max(projectionStrength, 0.001);
          vec3 streakDirection = normalize(mix(
            -uCameraUp,
            projectedStreak,
            smoothstep(0.08, 0.38, projectionStrength)
          ));
          vec3 side = normalize(cross(streakDirection, toCamera));

          vec3 worldPosition = dropCenter;
          worldPosition += streakDirection * position.y * visibleLength;
          worldPosition += side * position.x * width;

          vRainUv = position.xy;
          vAlpha = instanceVariation.z * uIntensity * uBrightness * nearFade * farFade
            * mix(0.55, 1.0, nearDetail);
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
          float edge = 1.0 - smoothstep(0.38, 1.0, abs(vRainUv.x));
          float tipFade = smoothstep(0.0, 0.12, vRainUv.y)
            * (1.0 - smoothstep(0.78, 1.0, vRainUv.y));
          float alpha = vAlpha * edge * tipFade;
          if (alpha < 0.008) discard;

          vec3 rainColor = vec3(0.64, 0.8, 0.98);
          float fogFactor = 1.0 - exp(
            -uFogDensity * uFogDensity * vViewDistance * vViewDistance
          );
          rainColor = mix(rainColor, uFogColor, clamp(fogFactor, 0.0, 0.9));
          alpha *= 1.0 - clamp(fogFactor, 0.0, 0.82);
          gl_FragColor = vec4(rainColor, alpha);
        }
      `,
    });
  }

  configureForModel(boundsInfo) {
    if (!boundsInfo || this.hasStoredSettings) return;
    const diagonal = boundsInfo.diagonal;
    this.settings.volumeWidth = THREE.MathUtils.clamp(diagonal * 0.36, 80, 150);
    this.settings.volumeHeight = THREE.MathUtils.clamp(diagonal * 0.215, 45, 100);
    this.settings.volumeDepth = THREE.MathUtils.clamp(diagonal * 0.36, 80, 150);
    this.hasStoredSettings = true;
    saveRainSettings(this.settings);
    this.applySettings();
  }

  setQuality(qualityPreset) {
    if (!RAIN_QUALITY_COUNTS[qualityPreset]) return;
    const nextCount = RAIN_QUALITY_COUNTS[qualityPreset];
    this.qualityPreset = qualityPreset;
    if (nextCount !== this.count) {
      const previousGeometry = this.geometry;
      this.geometry = this.createGeometry(nextCount);
      this.rain.geometry = this.geometry;
      previousGeometry.dispose();
      this.count = nextCount;
    }
    this.applySettings();
  }

  updateSettings(partialSettings, persist = true) {
    const next = { ...this.settings };
    const numericRanges = {
      intensity: [0, 1],
      fallSpeed: [5, 100],
      dropLength: [0.2, 4],
      brightness: [0.2, 2],
      dropWidth: [0.5, 3],
      windX: [-20, 20],
      windZ: [-20, 20],
      volumeWidth: [30, 220],
      volumeHeight: [20, 160],
      volumeDepth: [30, 220],
    };
    Object.entries(partialSettings || {}).forEach(([key, value]) => {
      if (!(key in next)) return;
      if (key === 'enabled') next.enabled = Boolean(value);
      else if (numericRanges[key] && Number.isFinite(Number(value))) {
        next[key] = THREE.MathUtils.clamp(
          Number(value),
          numericRanges[key][0],
          numericRanges[key][1],
        );
      }
    });
    this.settings = next;
    this.applySettings();
    if (persist) saveRainSettings(this.settings);
    return this.getState();
  }

  applySettings() {
    const settings = this.settings;
    this.material.uniforms.uVolumeSize.value.set(
      settings.volumeWidth,
      settings.volumeHeight,
      settings.volumeDepth,
    );
    this.material.uniforms.uWind.value.set(settings.windX, settings.windZ);
    this.material.uniforms.uFallSpeed.value = settings.fallSpeed;
    this.material.uniforms.uDropLength.value = settings.dropLength;
    this.material.uniforms.uDropWidth.value = settings.dropWidth;
    this.material.uniforms.uBrightness.value = settings.brightness;
    this.material.uniforms.uIntensity.value = settings.intensity;
    this.geometry.instanceCount = Math.round(this.count * settings.intensity);
    this.rain.visible = settings.enabled && settings.intensity > 0 && this.type === 'rain';
  }

  setFog(color, density) {
    this.material.uniforms.uFogColor.value.copy(color);
    this.material.uniforms.uFogDensity.value = density;
  }

  setWeather(type) {
    this.type = type;
    this.applySettings();
    if (this.onWeatherChange) this.onWeatherChange(type);
  }

  resetSettings() {
    this.settings = { ...RAIN_DEFAULTS };
    this.hasStoredSettings = false;
    saveRainSettings(this.settings);
    this.applySettings();
    return this.getState();
  }

  update(deltaTime) {
    if (!this.rain.visible) return;
    this.time += deltaTime;
    const matrix = this.camera.matrixWorld.elements;
    this.cameraRight.set(matrix[0], matrix[1], matrix[2]).normalize();
    this.cameraUp.set(matrix[4], matrix[5], matrix[6]).normalize();
    this.cameraForward.set(-matrix[8], -matrix[9], -matrix[10]).normalize();
    this.rainCenter.copy(this.camera.position).addScaledVector(
      this.cameraForward,
      this.settings.volumeDepth * 0.18,
    );
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uRainCenter.value.copy(this.rainCenter);
    this.material.uniforms.uCameraRight.value.copy(this.cameraRight);
    this.material.uniforms.uCameraUp.value.copy(this.cameraUp);
  }

  getState() {
    return {
      ...this.settings,
      dropCount: this.geometry.instanceCount,
      maximumDropCount: this.count,
      drawCalls: this.rain.visible ? 1 : 0,
      qualityPreset: this.qualityPreset,
      instanceBufferUploadsPerFrame: 0,
    };
  }

  dispose() {
    this.scene.remove(this.rain);
    this.geometry.dispose();
    this.material.dispose();
    this.rain = null;
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
    this.initializationStartedAt = settings.initializationStartedAt || performance.now();
    this.qualityPresetName = CITY_QUALITY_PRESETS[settings.qualityPreset]
      ? settings.qualityPreset
      : 'high';
    this.dynamicResolution = settings.dynamicResolution !== false;
    this.nightSettings = loadNightSettings();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.nightSettings.nightBackgroundColor);
    this.scene.fog = new THREE.FogExp2(this.nightSettings.nightBackgroundColor, 0);
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
    this.renderer.toneMapping = resolveToneMapping(CITY_RENDER_SETTINGS.toneMapping);
    this.renderer.toneMappingExposure = CITY_RENDER_SETTINGS.exposure;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.screenSpacePanning = true;
    this.lightingSystem = new LightingSystem(this.scene);
    this.environmentLightingSystem = new EnvironmentLightingSystem(this.renderer, this.scene);
    this.environmentSetupDuration = 0;
    this.rainSystem = new RainSystem(
      this.scene,
      this.camera,
      this.qualityPresetName,
      this.onWeatherChange,
    );
    this.wetSurfaceSystem = null;
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
    this.modelMaterials = new Set();
    this.modelTextures = new Set();
    this.anisotropyTextures = new Set();
    this.emissiveMaterials = new Set();
    this.originalEmissiveIntensities = new Map();
    this.materialAudit = {
      basic: 0,
      standard: 0,
      physical: 0,
      transparent: 0,
      doubleSided: 0,
      emissive: 0,
      emissiveColor: 0,
      emissiveMap: 0,
      emissiveIntensity: 0,
      emissiveEnhanced: 0,
      normalMap: 0,
      roughnessMap: 0,
      metalnessMap: 0,
      transparentModified: 0,
      doubleSidedModified: 0,
      colorSpaceCorrections: 0,
    };
    this.texturePreparation = {
      maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      appliedAnisotropy: 1,
      anisotropicTextures: 0,
      uploadedTextures: 0,
      mipmappedTextures: 0,
    };
    this.compileAsyncAvailable = typeof this.renderer.compileAsync === 'function';
    this.prepared = false;
    this.boundsInfo = null;
    this.modelDiagonal = 1;
    this.modelLoadCount = 0;
    this.pixelRatioLevels = [];
    this.pixelRatioLevelIndex = 0;
    this.currentPixelRatio = 1;
    this.statsFrameCount = 0;
    this.statsElapsed = 0;
    this.statsFrameTimeTotal = 0;
    this.lastFrameTimestamp = 0;
    this.lastStats = { fps: 0, frameTime: 0, maxFrameTime: 0 };
    this.timings = {
      modelLoad: 0,
      modelParse: 0,
      textureUpload: 0,
      shaderCompile: 0,
      warmup: 0,
      environmentSetup: this.environmentSetupDuration,
      clickToStable: 0,
    };
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

    this.initPromise = this.prepareInitialScene().catch((error) => {
      this.initPromise = null;
      if (this.onStatus) this.onStatus('error', error);
      throw error;
    });
    return this.initPromise;
  }

  async prepareInitialScene() {
    if (this.onStatus) this.onStatus('loading-model');
    await this.waitForBrowserFrame();
    await this.loadModel();

    if (this.onStatus) this.onStatus('preparing-textures');
    await this.waitForBrowserFrame();
    this.auditModelResources();
    this.wetSurfaceSystem = new WetSurfaceSystem(
      this.loadedModel,
      this.boundsInfo,
      this.qualityPresetName,
      this.rainSystem.settings.enabled ? this.rainSystem.settings.intensity : 0,
    );
    this.applyQualitySettings();
    this.preuploadTextures();

    if (this.onStatus) this.onStatus('compiling-shaders');
    await this.waitForBrowserFrame();
    await this.precompileShaders();

    if (this.onStatus) this.onStatus('warming-up');
    await this.waitForBrowserFrame();
    this.warmupRenderer();
    this.prepared = true;
    this.initialized = true;
    if (this.onStatus) this.onStatus('entering');
    await this.waitForBrowserFrame();
    return this;
  }

  waitForBrowserFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  loadModel() {
    this.modelLoadCount += 1;
    const loadStartedAt = performance.now();
    let networkCompletedAt = 0;
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        MODEL_URL,
        (gltf) => {
          const modelReadyAt = performance.now();
          this.timings.modelLoad = (networkCompletedAt || modelReadyAt) - loadStartedAt;
          this.timings.modelParse = networkCompletedAt ? modelReadyAt - networkCompletedAt : 0;
          if (this.disposed) {
            reject(new Error('CityWorld was disposed while loading'));
            return;
          }
          this.loadedModel = gltf.scene;
          this.scene.add(this.loadedModel);
          try {
            this.boundsInfo = this.fitModelToView(this.loadedModel);
            this.rainSystem.configureForModel(this.boundsInfo);
            this.modelStats = this.collectModelStats(this.loadedModel);
            if (this.onStats) this.onStats(this.getStats());
            resolve(this.loadedModel);
          } catch (error) {
            reject(error);
          }
        },
        (event) => {
          const networkJustCompleted = event.total > 0
            && event.loaded >= event.total
            && networkCompletedAt === 0;
          if (networkJustCompleted) {
            networkCompletedAt = performance.now();
          }
          if (this.onProgress && event.total > 0) {
            this.onProgress({
              percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
              loaded: event.loaded,
              total: event.total,
            });
          } else if (this.onProgress) {
            this.onProgress({ percent: null, loaded: event.loaded, total: 0 });
          }
          if (networkJustCompleted && this.onStatus) this.onStatus('parsing-model');
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

  auditModelResources() {
    const colorTextureSlots = ['map', 'emissiveMap'];
    const dataTextureSlots = [
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'aoMap',
      'alphaMap',
      'bumpMap',
      'displacementMap',
      'transmissionMap',
      'thicknessMap',
    ];

    this.loadedModel.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material) this.modelMaterials.add(material);
      });
    });

    this.modelMaterials.forEach((material) => {
      if (material.isMeshPhysicalMaterial) this.materialAudit.physical += 1;
      else if (material.isMeshStandardMaterial) this.materialAudit.standard += 1;
      else if (material.isMeshBasicMaterial) this.materialAudit.basic += 1;
      if (material.transparent) this.materialAudit.transparent += 1;
      if (material.side === THREE.DoubleSide) this.materialAudit.doubleSided += 1;
      const hasEmissiveColor = Boolean(material.emissive && material.emissive.getHex() !== 0);
      const hasEmissiveMap = Boolean(material.emissiveMap);
      const hasEmissive = hasEmissiveColor || hasEmissiveMap;
      if (hasEmissiveColor) this.materialAudit.emissiveColor += 1;
      if (hasEmissiveMap) this.materialAudit.emissiveMap += 1;
      if (Number(material.emissiveIntensity) > 0) this.materialAudit.emissiveIntensity += 1;
      if (hasEmissive) {
        this.materialAudit.emissive += 1;
        this.emissiveMaterials.add(material);
        this.originalEmissiveIntensities.set(
          material,
          Number.isFinite(material.emissiveIntensity) ? material.emissiveIntensity : 1,
        );
      }
      if (material.normalMap) this.materialAudit.normalMap += 1;
      if (material.roughnessMap) this.materialAudit.roughnessMap += 1;
      if (material.metalnessMap) this.materialAudit.metalnessMap += 1;

      Object.values(material).forEach((value) => {
        if (value?.isTexture) this.modelTextures.add(value);
      });

      colorTextureSlots.forEach((slot) => {
        const texture = material[slot];
        if (!texture?.isTexture || texture.colorSpace === THREE.SRGBColorSpace) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        this.materialAudit.colorSpaceCorrections += 1;
      });

      dataTextureSlots.forEach((slot) => {
        const texture = material[slot];
        if (!texture?.isTexture || texture.colorSpace !== THREE.SRGBColorSpace) return;
        texture.colorSpace = THREE.NoColorSpace;
        texture.needsUpdate = true;
        this.materialAudit.colorSpaceCorrections += 1;
      });

      if (ANISOTROPY_MATERIAL_PATTERN.test(material.name || '')) {
        Object.values(material).forEach((value) => {
          if (value?.isTexture) this.anisotropyTextures.add(value);
        });
      }
    });

    console.info('City model material audit:', {
      ...this.materialAudit,
      materials: this.modelMaterials.size,
      textures: this.modelTextures.size,
      anisotropyCandidates: this.anisotropyTextures.size,
    });
    this.texturePreparation.mipmappedTextures = Array.from(this.modelTextures).filter(
      (texture) => texture.minFilter !== THREE.LinearFilter
        && texture.minFilter !== THREE.NearestFilter,
    ).length;
    this.materialAudit.emissiveEnhanced = this.emissiveMaterials.size;
  }

  applyQualitySettings() {
    const preset = CITY_QUALITY_PRESETS[this.qualityPresetName];
    this.renderer.toneMapping = resolveToneMapping(preset.toneMapping);
    this.applyNightRenderingSettings();

    const anisotropy = Math.min(
      this.texturePreparation.maxAnisotropy,
      preset.anisotropy,
    );
    this.texturePreparation.appliedAnisotropy = anisotropy;
    this.texturePreparation.anisotropicTextures = this.anisotropyTextures.size;
    this.anisotropyTextures.forEach((texture) => {
      if (texture.anisotropy === anisotropy) return;
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    });
  }

  applyNightRenderingSettings() {
    const preset = CITY_QUALITY_PRESETS[this.qualityPresetName];
    const settings = this.nightSettings;
    this.scene.background.set(settings.nightBackgroundColor);
    this.scene.fog.color.set(settings.nightBackgroundColor);
    this.scene.fog.density = settings.fogEnabled
      ? settings.fogDensityFactor / Math.max(this.modelDiagonal, 1)
      : 0;
    this.rainSystem.setFog(this.scene.fog.color, this.scene.fog.density);
    this.renderer.toneMappingExposure = settings.exposure;
    this.lightingSystem.setMode('night', settings);

    const environmentSetupStartedAt = performance.now();
    const environmentIntensity = settings.environmentIntensity
      * preset.environmentIntensityScale;
    this.environmentLightingSystem.apply(
      settings.nightLightingEnabled && preset.environmentEnabled,
      environmentIntensity,
      this.modelMaterials,
    );
    if (preset.environmentEnabled && this.timings.environmentSetup === 0) {
      this.timings.environmentSetup = performance.now() - environmentSetupStartedAt;
    }

    const emissiveMultiplier = settings.existingEmissiveMultiplier
      * preset.emissiveIntensityScale;
    this.emissiveMaterials.forEach((material) => {
      const originalIntensity = this.originalEmissiveIntensities.get(material) ?? 1;
      material.emissiveIntensity = originalIntensity * emissiveMultiplier;
    });
  }

  updateNightSettings(partialSettings, persist = true) {
    const next = { ...this.nightSettings };
    const numericRanges = {
      exposure: [0.35, 2.5],
      fogDensityFactor: [0, 8],
      moonIntensity: [0, 5],
      ambientIntensity: [0, 3],
      environmentIntensity: [0, 2],
      existingEmissiveMultiplier: [0, 4],
    };

    Object.entries(partialSettings || {}).forEach(([key, value]) => {
      if (!(key in next)) return;
      if (key === 'moonColor' || key === 'nightBackgroundColor') {
        if (/^#[0-9a-f]{6}$/i.test(value)) next[key] = value;
      } else if (key === 'fogEnabled' || key === 'nightLightingEnabled') {
        next[key] = Boolean(value);
      } else if (numericRanges[key] && Number.isFinite(Number(value))) {
        next[key] = THREE.MathUtils.clamp(
          Number(value),
          numericRanges[key][0],
          numericRanges[key][1],
        );
      }
    });

    this.nightSettings = next;
    this.applyNightRenderingSettings();
    if (persist) saveNightSettings(this.nightSettings);
    if (!this.active) this.renderOnce();
    return this.getNightRenderingState();
  }

  resetNightSettings() {
    this.nightSettings = { ...NIGHT_RENDER_DEFAULTS };
    saveNightSettings(this.nightSettings);
    this.applyNightRenderingSettings();
    if (!this.active) this.renderOnce();
    return this.getNightRenderingState();
  }

  getNightRenderingState() {
    return {
      ...this.nightSettings,
      fogDensity: this.scene.fog.density,
      modelDiagonal: this.modelDiagonal,
    };
  }

  updateRainSettings(partialSettings, persist = true) {
    const state = this.rainSystem.updateSettings(partialSettings, persist);
    this.wetSurfaceSystem?.setRainIntensity(state.enabled ? state.intensity : 0);
    if (!this.active) this.renderOnce();
    return state;
  }

  resetRainSettings() {
    this.rainSystem.resetSettings();
    this.rainSystem.configureForModel(this.boundsInfo);
    const state = this.rainSystem.getState();
    this.wetSurfaceSystem?.setRainIntensity(state.enabled ? state.intensity : 0);
    if (!this.active) this.renderOnce();
    return state;
  }

  getRainRenderingState() {
    return this.rainSystem.getState();
  }

  updateWetSurfaceSettings(partialSettings, persist = true) {
    const state = this.wetSurfaceSystem.updateSettings(partialSettings, persist);
    if (!this.active) this.renderOnce();
    return state;
  }

  resetWetSurfaceSettings() {
    const state = this.wetSurfaceSystem.resetSettings();
    if (!this.active) this.renderOnce();
    return state;
  }

  getWetSurfaceState() {
    return this.wetSurfaceSystem?.getState() || null;
  }

  getWetSurfaceCandidates() {
    return this.wetSurfaceSystem?.getCandidates() || [];
  }

  selectWetSurface(path, selected, persist = false) {
    const changed = this.wetSurfaceSystem?.selectSurface(path, selected, persist) || false;
    if (changed && !this.active) this.renderOnce();
    return changed;
  }

  autoSelectWetSurfaces() {
    const state = this.wetSurfaceSystem.autoSelect();
    if (!this.active) this.renderOnce();
    return state;
  }

  restoreDefaultWetSurfaces() {
    const state = this.wetSurfaceSystem.restoreDefaultSelection();
    if (!this.active) this.renderOnce();
    return state;
  }

  clearWetSurfaces() {
    const state = this.wetSurfaceSystem.clearSelection();
    if (!this.active) this.renderOnce();
    return state;
  }

  saveWetSurfaceSelection() {
    this.wetSurfaceSystem.save();
    return this.wetSurfaceSystem.getState();
  }

  highlightWetSurface(path) {
    const highlighted = this.wetSurfaceSystem.highlightCandidate(path);
    if (!this.active) this.renderOnce();
    return highlighted;
  }

  focusWetSurface(path) {
    const view = this.wetSurfaceSystem.getCandidateView(path);
    if (!view) return false;
    this.setMode('orbit');
    const radius = Math.max(view.size.length() * 0.65, this.modelDiagonal * 0.025);
    this.controls.target.copy(view.center);
    this.camera.position.copy(view.center).add(new THREE.Vector3(
      radius * 0.8,
      radius * 0.65,
      radius,
    ));
    this.controls.update();
    return true;
  }

  preuploadTextures() {
    const startedAt = performance.now();
    let uploadedTextures = 0;
    if (typeof this.renderer.initTexture === 'function') {
      this.modelTextures.forEach((texture) => {
        this.renderer.initTexture(texture);
        uploadedTextures += 1;
      });
    }
    this.texturePreparation.uploadedTextures = uploadedTextures;
    this.timings.textureUpload = performance.now() - startedAt;
  }

  async precompileShaders() {
    const preset = CITY_QUALITY_PRESETS[this.qualityPresetName];
    if (!preset.shaderWarmup) return;
    const startedAt = performance.now();
    if (this.compileAsyncAvailable) {
      await this.renderer.compileAsync(this.scene, this.camera);
    } else {
      this.renderer.compile(this.scene, this.camera);
    }
    this.timings.shaderCompile = performance.now() - startedAt;
  }

  warmupRenderer() {
    const preset = CITY_QUALITY_PRESETS[this.qualityPresetName];
    if (!preset.shaderWarmup) return;
    const startedAt = performance.now();
    this.renderer.render(this.scene, this.camera);
    if (this.walkController.enable()) {
      this.renderer.render(this.scene, this.camera);
      this.walkController.disable(true);
    }
    this.timings.warmup = performance.now() - startedAt;
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
    const center = box.getCenter(new THREE.Vector3());
    const diagonal = size.length();
    this.modelDiagonal = Math.max(diagonal, 1);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const distance = (sphere.radius / Math.sin(limitingFov / 2)) * 1.18;
    const target = new THREE.Vector3(0, size.y * 0.28, 0);
    const viewDirection = new THREE.Vector3(1, 0.68, 1).normalize();

    this.camera.near = THREE.MathUtils.clamp(this.modelDiagonal * 0.0002, 0.05, 2);
    this.camera.far = Math.max(distance + this.modelDiagonal * 3.2, this.modelDiagonal * 4.5);
    this.camera.position.copy(target).addScaledVector(viewDirection, distance);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(target);
    this.controls.minDistance = Math.max(sphere.radius * 0.03, 0.01);
    this.controls.maxDistance = this.modelDiagonal * 3.5;
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
    this.lightingSystem.configureForBounds(box, this.modelDiagonal);
    this.applyNightRenderingSettings();

    return {
      originalCenter,
      size,
      center,
      diagonal: this.modelDiagonal,
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
    this.rainSystem.update(deltaTime);
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
    this.statsFrameTimeMax = 0;
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
    this.statsFrameTimeMax = Math.max(this.statsFrameTimeMax, frameTime);
    this.dynamicFrameCount += 1;
    this.dynamicElapsed += frameTime;

    if (this.statsElapsed >= PERFORMANCE_UPDATE_INTERVAL) {
      this.lastStats.fps = Math.round((this.statsFrameCount * 1000) / this.statsElapsed);
      this.lastStats.frameTime = this.statsFrameTimeTotal / this.statsFrameCount;
      this.lastStats.maxFrameTime = this.statsFrameTimeMax;
      if (this.timings.clickToStable === 0) {
        this.timings.clickToStable = now - this.initializationStartedAt;
      }
      if (this.onStats) this.onStats(this.getStats());
      this.statsFrameCount = 0;
      this.statsElapsed = 0;
      this.statsFrameTimeTotal = 0;
      this.statsFrameTimeMax = 0;
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
    this.applyQualitySettings();
    this.rainSystem.setQuality(presetName);
    this.wetSurfaceSystem?.setQuality(presetName);
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
      shaderPrograms: this.renderer.info.programs?.length || 0,
      fps: this.lastStats.fps,
      frameTime: this.lastStats.frameTime,
      maxFrameTime: this.lastStats.maxFrameTime,
      pixelRatio: this.currentPixelRatio,
      qualityPreset: this.qualityPresetName,
      renderSettings: {
        toneMapping: CITY_QUALITY_PRESETS[this.qualityPresetName].toneMapping,
        exposure: this.renderer.toneMappingExposure,
        environmentEnabled: Boolean(this.scene.environment),
        environmentIntensity: this.nightSettings.environmentIntensity
          * CITY_QUALITY_PRESETS[this.qualityPresetName].environmentIntensityScale,
      },
      materialAudit: this.materialAudit,
      texturePreparation: this.texturePreparation,
      lighting: this.lightingSystem.getStats(),
      compileAsyncAvailable: this.compileAsyncAvailable,
      prepared: this.prepared,
      isRendering: this.animationFrameId !== null,
      worldActive: this.active,
      modelLoaded: Boolean(this.initialized && this.loadedModel),
      modelLoadCount: this.modelLoadCount,
      timings: this.timings,
      cameraPosition: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      cameraClipping: {
        near: this.camera.near,
        far: this.camera.far,
      },
      rainRendering: this.rainSystem.getState(),
      wetSurfaceRendering: this.wetSurfaceSystem?.getState() || null,
      fogDensity: this.scene.fog.density,
      nightRendering: this.getNightRenderingState(),
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
    this.rainSystem.dispose();
    this.wetSurfaceSystem?.dispose();
    this.wetSurfaceSystem = null;
    this.lightingSystem.dispose();
    this.environmentLightingSystem.dispose();
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
  nightDefaults: NIGHT_RENDER_DEFAULTS,
  nightSettingsStorageKey: NIGHT_SETTINGS_STORAGE_KEY,
  rainDefaults: RAIN_DEFAULTS,
  rainQualityCounts: RAIN_QUALITY_COUNTS,
  rainSettingsStorageKey: RAIN_SETTINGS_STORAGE_KEY,
  wetSurfaceDefaults: WET_SURFACE_DEFAULTS,
  wetSurfaceStorageKey: WET_SURFACE_STORAGE_KEY,
  renderSettings: CITY_RENDER_SETTINGS,
  qualityPresets: CITY_QUALITY_PRESETS,
});
