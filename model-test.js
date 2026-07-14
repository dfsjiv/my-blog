import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MODEL_URL = '/assets/models/new-york-city.glb';

const canvas = document.getElementById('modelCanvas');
const loadStatus = document.getElementById('loadStatus');
const fpsValue = document.getElementById('fpsValue');
const meshValue = document.getElementById('meshValue');
const triangleValue = document.getElementById('triangleValue');
const drawCallValue = document.getElementById('drawCallValue');
const textureValue = document.getElementById('textureValue');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050a12);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.screenSpacePanning = true;

scene.add(new THREE.AmbientLight(0xffffff, 1.65));
const directionalLight = new THREE.DirectionalLight(0xffffff, 2.4);
directionalLight.position.set(1, 2, 1);
scene.add(directionalLight);

let animationFrameId = 0;
let disposed = false;
let loadedModel = null;
let helperGroup = null;
let frameCount = 0;
let fpsSampleStart = performance.now();

function resizeRenderer() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
}

function collectModelStats(root) {
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

  return {
    meshes,
    triangles: Math.round(triangles),
    textures: textures.size,
  };
}

function fitModelToView(model) {
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
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = (sphere.radius / Math.sin(limitingFov / 2)) * 1.18;
  const target = new THREE.Vector3(0, size.y * 0.28, 0);
  const viewDirection = new THREE.Vector3(1, 0.68, 1).normalize();

  camera.near = Math.max(distance / 2000, 0.01);
  camera.far = Math.max(distance + sphere.radius * 6, distance * 4);
  camera.position.copy(target).addScaledVector(viewDirection, distance);
  camera.updateProjectionMatrix();

  controls.target.copy(target);
  controls.minDistance = Math.max(sphere.radius * 0.03, 0.01);
  controls.maxDistance = sphere.radius * 12;
  controls.update();

  const horizontalSize = Math.max(size.x, size.z);
  helperGroup = new THREE.Group();
  const grid = new THREE.GridHelper(horizontalSize * 1.35, 20, 0x58789a, 0x26384c);
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  const axes = new THREE.AxesHelper(Math.max(horizontalSize, size.y) * 0.12);
  helperGroup.add(grid, axes);
  scene.add(helperGroup);

  return {
    originalCenter,
    size,
    centeredBox: box,
    cameraDistance: distance,
  };
}

function setLoadProgress(event) {
  if (event.total > 0) {
    const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
    loadStatus.textContent = `模型加载中：${percent}%`;
    return;
  }
  const loadedMb = (event.loaded / 1024 / 1024).toFixed(1);
  loadStatus.textContent = `模型加载中：${loadedMb} MB`;
}

function loadModel() {
  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      if (disposed) return;
      loadedModel = gltf.scene;
      scene.add(loadedModel);

      try {
        const fit = fitModelToView(loadedModel);
        const stats = collectModelStats(loadedModel);
        meshValue.textContent = stats.meshes.toLocaleString();
        triangleValue.textContent = stats.triangles.toLocaleString();
        textureValue.textContent = stats.textures.toLocaleString();
        loadStatus.textContent = '模型加载完成';
        loadStatus.dataset.bounds = JSON.stringify({
          size: fit.size.toArray(),
          originalCenter: fit.originalCenter.toArray(),
          centeredMin: fit.centeredBox.min.toArray(),
          centeredMax: fit.centeredBox.max.toArray(),
          cameraDistance: fit.cameraDistance,
          cameraPosition: camera.position.toArray(),
        });
      } catch (error) {
        loadStatus.textContent = '模型加载失败';
        loadStatus.classList.add('is-error');
        console.error(error);
      }
    },
    setLoadProgress,
    (error) => {
      loadStatus.textContent = '模型加载失败';
      loadStatus.classList.add('is-error');
      console.error(error);
    },
  );
}

function render(now) {
  if (disposed) return;
  controls.update();
  renderer.render(scene, camera);

  frameCount += 1;
  const elapsed = now - fpsSampleStart;
  if (elapsed >= 500) {
    fpsValue.textContent = Math.round((frameCount * 1000) / elapsed).toString();
    drawCallValue.textContent = renderer.info.render.calls.toLocaleString();
    frameCount = 0;
    fpsSampleStart = now;
  }

  animationFrameId = requestAnimationFrame(render);
}

function disposeSceneResources() {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  scene.traverse((object) => {
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

function cleanup() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(animationFrameId);
  window.removeEventListener('resize', resizeRenderer);
  window.removeEventListener('pagehide', cleanup);
  controls.dispose();
  disposeSceneResources();
  renderer.dispose();
  renderer.forceContextLoss();
  loadedModel = null;
  helperGroup = null;
}

resizeRenderer();
window.addEventListener('resize', resizeRenderer);
window.addEventListener('pagehide', cleanup, { once: true });
loadModel();
animationFrameId = requestAnimationFrame(render);
