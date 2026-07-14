import { CityWorld } from './city-world.js';

const canvas = document.getElementById('modelCanvas');
const loadStatus = document.getElementById('loadStatus');
const modeValue = document.getElementById('modeValue');
const weatherValue = document.getElementById('weatherValue');
const fpsValue = document.getElementById('fpsValue');
const meshValue = document.getElementById('meshValue');
const triangleValue = document.getElementById('triangleValue');
const drawCallValue = document.getElementById('drawCallValue');
const textureValue = document.getElementById('textureValue');
const walkModeButton = document.getElementById('walkModeButton');

let disposed = false;

function setModeUi(mode) {
  const walking = mode === 'walk';
  modeValue.textContent = walking ? 'Walk' : 'Orbit';
  walkModeButton.textContent = walking ? '退出城市 (Esc)' : '进入城市';
}

function updateStats(stats) {
  if (stats.meshes) meshValue.textContent = stats.meshes.toLocaleString();
  if (stats.triangles) triangleValue.textContent = stats.triangles.toLocaleString();
  if (stats.textures) textureValue.textContent = stats.textures.toLocaleString();
  if (stats.fps) fpsValue.textContent = stats.fps.toString();
  drawCallValue.textContent = stats.drawCalls.toLocaleString();

  if (stats.bounds) {
    loadStatus.dataset.bounds = JSON.stringify({
      size: stats.bounds.size.toArray(),
      originalCenter: stats.bounds.originalCenter.toArray(),
      centeredMin: stats.bounds.centeredBox.min.toArray(),
      centeredMax: stats.bounds.centeredBox.max.toArray(),
      cameraDistance: stats.bounds.cameraDistance,
      rainCount: stats.rainCount,
      rainVolume: stats.rainVolume,
      fogDensity: stats.fogDensity,
    });
  }
}

const world = new CityWorld({
  canvas,
  onProgress(progress) {
    loadStatus.textContent = progress.percent === null
      ? `模型加载中：${(progress.loaded / 1024 / 1024).toFixed(1)} MB`
      : `模型加载中：${progress.percent}%`;
  },
  onStatus(status, error) {
    if (status === 'ready') {
      loadStatus.textContent = '模型加载完成';
      loadStatus.classList.remove('is-error');
      walkModeButton.disabled = false;
    } else if (status === 'error') {
      loadStatus.textContent = '模型加载失败';
      loadStatus.classList.add('is-error');
      console.error(error);
    }
  },
  onStats: updateStats,
  onModeChange: setModeUi,
  onWeatherChange(type) {
    weatherValue.textContent = type === 'rain' ? 'Rain' : 'Clear';
  },
  onExitRequest() {
    world.setMode('orbit');
  },
});

function enterWalkMode() {
  world.setMode('walk');
  const request = canvas.requestPointerLock();
  if (request?.catch) request.catch(() => {});
}

function leaveWalkMode() {
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  } else {
    world.setMode('orbit');
  }
}

function handlePointerLockChange() {
  if (document.pointerLockElement === canvas) {
    world.setMode('walk');
  } else if (world.mode === 'walk') {
    world.setMode('orbit');
  }
}

function handleWalkButton() {
  if (world.mode === 'walk') leaveWalkMode();
  else enterWalkMode();
}

function cleanup() {
  if (disposed) return;
  disposed = true;
  document.removeEventListener('pointerlockchange', handlePointerLockChange);
  walkModeButton.removeEventListener('click', handleWalkButton);
  world.dispose();
}

document.addEventListener('pointerlockchange', handlePointerLockChange);
walkModeButton.addEventListener('click', handleWalkButton);
window.addEventListener('pagehide', cleanup, { once: true });

world.init().then(() => {
  if (!disposed) world.start({ mode: 'orbit' });
}).catch(() => {});
