(function () {
  const PARTICLE_QUALITY = Object.freeze({
    low: 500,
    medium: 2000,
    high: 5000,
    ultra: 10000,
  });
  const STORAGE_KEY = 'gpuParticleWallpaperEnabled';

  class GpuParticleWallpaper {
    constructor(options) {
      const settings = options || {};
      this.canvas = settings.canvas;
      this.surface = settings.surface;
      this.toggleButton = settings.toggleButton;
      this.quality = PARTICLE_QUALITY[settings.quality] ? settings.quality : 'medium';
      this.effectType = 'floating-light';
      this.count = PARTICLE_QUALITY[this.quality];
      this.gl = null;
      this.program = null;
      this.vertexShader = null;
      this.fragmentShader = null;
      this.particleBuffer = null;
      this.particles = null;
      this.velocities = null;
      this.animationFrameId = null;
      this.lastTime = 0;
      this.initialized = false;
      this.destroyed = false;
      this.enabled = this.readEnabledState();
      this.mouse = { x: 0, y: 0, active: false };
      this.resizeObserver = null;
      this.handleResize = this.resize.bind(this);
      this.handleVisibilityChange = this.onVisibilityChange.bind(this);
      this.handleMouseMove = this.onMouseMove.bind(this);
      this.handleMouseLeave = this.onMouseLeave.bind(this);
      this.handleToggle = this.toggle.bind(this);
      this.renderFrame = this.renderFrame.bind(this);
    }

    readEnabledState() {
      try {
        return window.localStorage.getItem(STORAGE_KEY) !== 'false';
      } catch (error) {
        return true;
      }
    }

    saveEnabledState() {
      try {
        window.localStorage.setItem(STORAGE_KEY, this.enabled ? 'true' : 'false');
      } catch (error) {
        // The effect remains usable when storage is unavailable.
      }
    }

    init() {
      if (this.initialized || this.destroyed || !this.canvas || !this.surface) return false;
      const gl = this.canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      if (!gl) {
        console.warn('WebGL2 不可用，已保留静态桌面背景。');
        this.canvas.classList.add('is-unavailable');
        if (this.toggleButton) {
          this.toggleButton.textContent = '粒子：不可用';
          this.toggleButton.disabled = true;
        }
        return false;
      }

      this.gl = gl;
      try {
        this.createProgram();
        this.createParticles();
      } catch (error) {
        console.warn('GPU 粒子初始化失败，已保留静态桌面背景。', error);
        this.destroyWebGlResources();
        this.canvas.classList.add('is-unavailable');
        return false;
      }

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      this.initialized = true;
      this.bindEvents();
      this.resize();
      this.updateToggleUi();
      this.canvas.classList.toggle('is-disabled', !this.enabled);
      if (this.enabled && !document.hidden) this.start();
      return true;
    }

    createShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed';
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    }

    createProgram() {
      const gl = this.gl;
      const vertexSource = `#version 300 es
        precision highp float;
        layout(location = 0) in vec2 a_position;
        layout(location = 1) in float a_size;
        layout(location = 2) in float a_alpha;
        uniform float u_dpr;
        out float v_alpha;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          gl_PointSize = a_size * u_dpr;
          v_alpha = a_alpha;
        }
      `;
      const fragmentSource = `#version 300 es
        precision highp float;
        in float v_alpha;
        out vec4 outColor;
        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float distanceFromCenter = length(coord);
          if (distanceFromCenter > 0.5) discard;
          float glow = 1.0 - smoothstep(0.04, 0.5, distanceFromCenter);
          outColor = vec4(0.58, 0.84, 1.0, v_alpha * glow);
        }
      `;
      this.vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
      this.fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
      this.program = gl.createProgram();
      gl.attachShader(this.program, this.vertexShader);
      gl.attachShader(this.program, this.fragmentShader);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(this.program) || 'Program linking failed');
      }
      this.dprLocation = gl.getUniformLocation(this.program, 'u_dpr');
    }

    createParticles() {
      const gl = this.gl;
      this.particles = new Float32Array(this.count * 4);
      this.velocities = new Float32Array(this.count * 2);
      for (let index = 0; index < this.count; index += 1) {
        const particleOffset = index * 4;
        const velocityOffset = index * 2;
        this.particles[particleOffset] = Math.random() * 2 - 1;
        this.particles[particleOffset + 1] = Math.random() * 2 - 1;
        this.particles[particleOffset + 2] = 1.2 + Math.random() * 2.8;
        this.particles[particleOffset + 3] = 0.12 + Math.random() * 0.42;
        this.velocities[velocityOffset] = (Math.random() - 0.5) * 0.045;
        this.velocities[velocityOffset + 1] = (Math.random() - 0.5) * 0.045;
      }

      this.particleBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.particles, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 8);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 16, 12);
    }

    bindEvents() {
      window.addEventListener('resize', this.handleResize);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.surface.addEventListener('mousemove', this.handleMouseMove);
      this.surface.addEventListener('mouseleave', this.handleMouseLeave);
      if (this.toggleButton) this.toggleButton.addEventListener('click', this.handleToggle);
      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(this.handleResize);
        this.resizeObserver.observe(this.surface);
      }
    }

    resize() {
      if (!this.gl || this.destroyed) return;
      const rect = this.surface.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        this.stop();
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
      }
      this.dpr = dpr;
      if (this.enabled && !document.hidden) this.start();
    }

    onMouseMove(event) {
      const rect = this.surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
      this.mouse.active = true;
    }

    onMouseLeave() {
      this.mouse.active = false;
    }

    onVisibilityChange() {
      if (document.hidden) this.stop();
      else if (this.enabled) this.start();
    }

    update(time, deltaSeconds) {
      const repelRadius = 0.18;
      const repelRadiusSquared = repelRadius * repelRadius;
      for (let index = 0; index < this.count; index += 1) {
        const particleOffset = index * 4;
        const velocityOffset = index * 2;
        let x = this.particles[particleOffset];
        let y = this.particles[particleOffset + 1];
        let velocityX = this.velocities[velocityOffset];
        let velocityY = this.velocities[velocityOffset + 1];

        velocityX += Math.sin(time * 0.00017 + index * 0.73) * 0.000002;
        velocityY += Math.cos(time * 0.00013 + index * 0.51) * 0.000002;
        if (this.mouse.active) {
          const dx = x - this.mouse.x;
          const dy = y - this.mouse.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > 0.00001 && distanceSquared < repelRadiusSquared) {
            const distance = Math.sqrt(distanceSquared);
            const force = (1 - distance / repelRadius) * 0.0012;
            velocityX += (dx / distance) * force;
            velocityY += (dy / distance) * force;
          }
        }

        const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
        if (speed > 0.085) {
          velocityX = (velocityX / speed) * 0.085;
          velocityY = (velocityY / speed) * 0.085;
        }
        x += velocityX * deltaSeconds;
        y += velocityY * deltaSeconds;
        if (x < -1.04) x = 1.04;
        else if (x > 1.04) x = -1.04;
        if (y < -1.04) y = 1.04;
        else if (y > 1.04) y = -1.04;

        this.particles[particleOffset] = x;
        this.particles[particleOffset + 1] = y;
        this.velocities[velocityOffset] = velocityX * 0.9995;
        this.velocities[velocityOffset + 1] = velocityY * 0.9995;
      }
    }

    renderFrame(time) {
      if (this.animationFrameId === null || !this.enabled || document.hidden) return;
      const deltaSeconds = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.033) : 0;
      this.lastTime = time;
      this.update(time, deltaSeconds);

      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniform1f(this.dprLocation, this.dpr || 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particles);
      gl.drawArrays(gl.POINTS, 0, this.count);
      this.animationFrameId = window.requestAnimationFrame(this.renderFrame);
    }

    start() {
      if (!this.initialized || this.destroyed || !this.enabled || this.animationFrameId !== null) return;
      this.canvas.classList.remove('is-disabled');
      this.lastTime = 0;
      this.animationFrameId = window.requestAnimationFrame(this.renderFrame);
    }

    stop() {
      if (this.animationFrameId !== null) {
        window.cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.lastTime = 0;
    }

    setEnabled(enabled) {
      this.enabled = enabled !== false;
      this.saveEnabledState();
      this.updateToggleUi();
      this.canvas.classList.toggle('is-disabled', !this.enabled);
      if (this.enabled && !document.hidden) this.start();
      else this.stop();
    }

    toggle() {
      this.setEnabled(!this.enabled);
    }

    updateToggleUi() {
      if (!this.toggleButton) return;
      this.toggleButton.textContent = this.enabled ? '粒子：开' : '粒子：关';
      this.toggleButton.setAttribute('aria-pressed', this.enabled ? 'true' : 'false');
    }

    destroyWebGlResources() {
      if (!this.gl) return;
      if (this.particleBuffer) this.gl.deleteBuffer(this.particleBuffer);
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.vertexShader) this.gl.deleteShader(this.vertexShader);
      if (this.fragmentShader) this.gl.deleteShader(this.fragmentShader);
      this.particleBuffer = null;
      this.program = null;
      this.vertexShader = null;
      this.fragmentShader = null;
    }

    destroy() {
      if (this.destroyed) return;
      this.stop();
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.surface.removeEventListener('mousemove', this.handleMouseMove);
      this.surface.removeEventListener('mouseleave', this.handleMouseLeave);
      if (this.toggleButton) this.toggleButton.removeEventListener('click', this.handleToggle);
      if (this.resizeObserver) this.resizeObserver.disconnect();
      this.destroyWebGlResources();
      this.destroyed = true;
      this.initialized = false;
    }
  }

  function initializeParticleWallpaper() {
    if (window.gpuParticleWallpaper) return;
    const instance = new GpuParticleWallpaper({
      canvas: document.getElementById('desktopParticleCanvas'),
      surface: document.getElementById('desktopSurface'),
      toggleButton: document.getElementById('particleWallpaperToggle'),
      quality: 'medium',
    });
    window.gpuParticleWallpaper = instance;
    instance.init();
  }

  window.GpuParticleWallpaper = GpuParticleWallpaper;
  window.PARTICLE_QUALITY = PARTICLE_QUALITY;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeParticleWallpaper, { once: true });
  } else {
    initializeParticleWallpaper();
  }
}());
