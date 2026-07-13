(function () {
  const PARTICLE_QUALITY = Object.freeze({
    low: 500,
    medium: 2000,
    high: 5000,
    ultra: 10000,
  });
  const SNOW_QUALITY = Object.freeze({
    low: 300,
    medium: 1000,
    high: 2500,
    ultra: 5000,
  });
  const STAR_QUALITY = Object.freeze({
    low: 500,
    medium: 2000,
    high: 5000,
    ultra: 10000,
  });
  const BACKGROUND_MODES = Object.freeze(['static', 'floating-light', 'snow', 'stars']);
  const STORAGE_KEY = 'webos_background_mode';
  const LEGACY_STORAGE_KEY = 'gpuParticleWallpaperEnabled';

  const MODE_LABELS = Object.freeze({
    static: '\u58c1\u7eb8\uff1a\u9759\u6001',
    'floating-light': '\u58c1\u7eb8\uff1a\u7c92\u5b50',
    snow: '\u58c1\u7eb8\uff1a\u96ea\u82b1',
    stars: '\u58c1\u7eb8\uff1a\u661f\u7a7a',
  });
  const STAR_MIN_DEPTH = 0.12;
  const STAR_MAX_DEPTH = 1.35;
  const STAR_STRIDE = 8;
  const SNOW_LAYERS = Object.freeze([
    Object.freeze({ sizeMin: 1.2, sizeMax: 2.1, alphaMin: 0.18, alphaMax: 0.34, speedMin: 0.06, speedMax: 0.11, driftMin: 0.004, driftMax: 0.012 }),
    Object.freeze({ sizeMin: 2.2, sizeMax: 3.7, alphaMin: 0.34, alphaMax: 0.58, speedMin: 0.12, speedMax: 0.20, driftMin: 0.008, driftMax: 0.020 }),
    Object.freeze({ sizeMin: 3.8, sizeMax: 6.2, alphaMin: 0.58, alphaMax: 0.88, speedMin: 0.22, speedMax: 0.36, driftMin: 0.014, driftMax: 0.030 }),
  ]);

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  class GpuParticleWallpaper {
    constructor(options) {
      const settings = options || {};
      this.canvas = settings.canvas;
      this.surface = settings.surface;
      this.toggleButton = settings.toggleButton;
      this.quality = PARTICLE_QUALITY[settings.quality] ? settings.quality : 'medium';
      this.snowQuality = SNOW_QUALITY[settings.snowQuality] ? settings.snowQuality : 'medium';
      this.starQuality = STAR_QUALITY[settings.starQuality] ? settings.starQuality : 'medium';
      this.currentEffect = this.readBackgroundMode();
      this.effectType = this.currentEffect;
      this.lastDynamicEffect = this.currentEffect === 'static' ? 'floating-light' : this.currentEffect;
      this.enabled = this.currentEffect !== 'static';
      this.count = 0;
      this.gl = null;
      this.program = null;
      this.vertexShader = null;
      this.fragmentShader = null;
      this.particleBuffer = null;
      this.particleVertexArray = null;
      this.particles = null;
      this.velocities = null;
      this.snowProperties = null;
      this.starProgram = null;
      this.starVertexShader = null;
      this.starFragmentShader = null;
      this.starBuffer = null;
      this.starVertexArray = null;
      this.starParticles = null;
      this.starParallax = { targetX: 0, targetY: 0, currentX: 0, currentY: 0 };
      this.animationFrameId = null;
      this.lastTime = 0;
      this.initialized = false;
      this.destroyed = false;
      this.mouse = { x: 0, y: 0, active: false, lastClientX: null, windX: 0 };
      this.resizeObserver = null;
      this.handleResize = this.resize.bind(this);
      this.handleVisibilityChange = this.onVisibilityChange.bind(this);
      this.handleMouseMove = this.onMouseMove.bind(this);
      this.handleMouseLeave = this.onMouseLeave.bind(this);
      this.handleToggle = this.toggle.bind(this);
      this.renderFrame = this.renderFrame.bind(this);
    }

    readBackgroundMode() {
      try {
        const savedMode = window.localStorage.getItem(STORAGE_KEY);
        if (BACKGROUND_MODES.includes(savedMode)) return savedMode;
        const legacyEnabled = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyEnabled === 'false') return 'static';
      } catch (error) {
        // The original dynamic default remains available without storage.
      }
      return 'floating-light';
    }

    saveBackgroundMode() {
      try {
        window.localStorage.setItem(STORAGE_KEY, this.currentEffect);
      } catch (error) {
        // The current mode remains usable when storage is unavailable.
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
        console.warn('WebGL2 \u4e0d\u53ef\u7528\uff0c\u5df2\u4fdd\u7559\u9759\u6001\u684c\u9762\u80cc\u666f\u3002');
        this.canvas.classList.add('is-unavailable');
        if (this.toggleButton) {
          this.toggleButton.textContent = '\u58c1\u7eb8\uff1a\u9759\u6001';
          this.toggleButton.title = 'WebGL2 \u4e0d\u53ef\u7528';
          this.toggleButton.disabled = true;
        }
        return false;
      }

      this.gl = gl;
      try {
        this.createProgram();
        this.createParticleBuffer();
        if (this.currentEffect !== 'static') this.createParticles(this.currentEffect);
      } catch (error) {
        console.warn('GPU \u7c92\u5b50\u521d\u59cb\u5316\u5931\u8d25\uff0c\u5df2\u4fdd\u7559\u9759\u6001\u684c\u9762\u80cc\u666f\u3002', error);
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
        uniform float u_effectType;
        out vec4 outColor;
        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float distanceFromCenter = length(coord);
          if (distanceFromCenter > 0.5) discard;
          float softness = u_effectType > 0.5 ? 0.12 : 0.04;
          float glow = 1.0 - smoothstep(softness, 0.5, distanceFromCenter);
          vec3 color = u_effectType > 0.5
            ? vec3(0.94, 0.97, 1.0)
            : vec3(0.58, 0.84, 1.0);
          outColor = vec4(color, v_alpha * glow);
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
      this.effectTypeLocation = gl.getUniformLocation(this.program, 'u_effectType');
    }

    createParticleBuffer() {
      const gl = this.gl;
      this.particleVertexArray = gl.createVertexArray();
      gl.bindVertexArray(this.particleVertexArray);
      this.particleBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 8);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 16, 12);
      gl.bindVertexArray(null);
    }

    createStarResources() {
      if (this.starProgram) return;
      const gl = this.gl;
      try {
      const vertexSource = `#version 300 es
        precision highp float;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in float a_size;
        layout(location = 2) in float a_brightness;
        layout(location = 3) in float a_twinklePhase;
        layout(location = 4) in float a_twinkleSpeed;
        uniform float u_dpr;
        uniform float u_time;
        uniform vec2 u_parallax;
        out float v_alpha;
        out float v_temperature;
        void main() {
          float normalizedDepth = clamp(
            (a_position.z - ${STAR_MIN_DEPTH}) / ${STAR_MAX_DEPTH - STAR_MIN_DEPTH},
            0.0,
            1.0
          );
          float nearness = 1.0 - normalizedDepth;
          vec2 projected = a_position.xy / max(a_position.z, ${STAR_MIN_DEPTH});
          projected += u_parallax * mix(0.008, 0.045, nearness);
          gl_Position = vec4(projected, 0.0, 1.0);
          gl_PointSize = clamp(
            a_size * mix(0.55, 2.65, nearness) * u_dpr,
            1.0 * u_dpr,
            8.0 * u_dpr
          );
          float twinkle = 0.94 + sin(u_time * a_twinkleSpeed + a_twinklePhase) * 0.06;
          v_alpha = a_brightness * mix(0.34, 1.0, nearness) * twinkle;
          v_temperature = fract(sin(a_twinklePhase * 12.9898) * 43758.5453);
        }
      `;
      const fragmentSource = `#version 300 es
        precision highp float;
        in float v_alpha;
        in float v_temperature;
        out vec4 outColor;
        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float distanceFromCenter = length(coord);
          if (distanceFromCenter > 0.5) discard;
          float glow = 1.0 - smoothstep(0.08, 0.5, distanceFromCenter);
          vec3 coolWhite = vec3(0.82, 0.91, 1.0);
          vec3 neutralWhite = vec3(0.96, 0.98, 1.0);
          vec3 warmWhite = vec3(1.0, 0.94, 0.84);
          vec3 color = mix(coolWhite, neutralWhite, smoothstep(0.15, 0.85, v_temperature));
          if (v_temperature > 0.96) color = warmWhite;
          outColor = vec4(color, v_alpha * glow);
        }
      `;

      this.starVertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
      this.starFragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
      this.starProgram = gl.createProgram();
      gl.attachShader(this.starProgram, this.starVertexShader);
      gl.attachShader(this.starProgram, this.starFragmentShader);
      gl.linkProgram(this.starProgram);
      if (!gl.getProgramParameter(this.starProgram, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(this.starProgram) || 'Star program linking failed');
      }

      this.starDprLocation = gl.getUniformLocation(this.starProgram, 'u_dpr');
      this.starTimeLocation = gl.getUniformLocation(this.starProgram, 'u_time');
      this.starParallaxLocation = gl.getUniformLocation(this.starProgram, 'u_parallax');
      this.starVertexArray = gl.createVertexArray();
      gl.bindVertexArray(this.starVertexArray);
      this.starBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuffer);
      const stride = STAR_STRIDE * Float32Array.BYTES_PER_ELEMENT;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 24);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 28);
      gl.bindVertexArray(null);
      } catch (error) {
        this.destroyStarResources();
        throw error;
      }
    }

    createParticles(effectType) {
      if (effectType === 'stars') {
        this.createStarParticles();
        return;
      }
      this.count = effectType === 'snow'
        ? SNOW_QUALITY[this.snowQuality]
        : PARTICLE_QUALITY[this.quality];
      this.particles = new Float32Array(this.count * 4);
      this.velocities = effectType === 'floating-light'
        ? new Float32Array(this.count * 2)
        : null;
      this.snowProperties = effectType === 'snow'
        ? new Float32Array(this.count * 4)
        : null;

      for (let index = 0; index < this.count; index += 1) {
        if (effectType === 'snow') this.resetSnowParticle(index, true);
        else this.resetFloatingParticle(index);
      }

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.particleBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, this.particles, this.gl.DYNAMIC_DRAW);
    }

    createStarParticles() {
      this.createStarResources();
      this.count = STAR_QUALITY[this.starQuality];
      const requiredLength = this.count * STAR_STRIDE;
      if (!this.starParticles || this.starParticles.length !== requiredLength) {
        this.starParticles = new Float32Array(requiredLength);
      }
      for (let index = 0; index < this.count; index += 1) {
        this.resetStarParticle(index, true);
      }
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.starBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, this.starParticles, this.gl.DYNAMIC_DRAW);
    }

    resetStarParticle(index, initialPlacement) {
      const offset = index * STAR_STRIDE;
      const z = initialPlacement
        ? randomBetween(STAR_MIN_DEPTH, STAR_MAX_DEPTH)
        : randomBetween(STAR_MAX_DEPTH * 0.88, STAR_MAX_DEPTH);
      this.starParticles[offset] = randomBetween(-1.15, 1.15) * z;
      this.starParticles[offset + 1] = randomBetween(-1.08, 1.08) * z;
      this.starParticles[offset + 2] = z;
      this.starParticles[offset + 3] = randomBetween(1.0, 3.0);
      this.starParticles[offset + 4] = randomBetween(0.32, 0.78);
      this.starParticles[offset + 5] = randomBetween(0.018, 0.045);
      this.starParticles[offset + 6] = Math.random() * Math.PI * 2;
      this.starParticles[offset + 7] = randomBetween(0.7, 1.6);
    }

    resetFloatingParticle(index) {
      const particleOffset = index * 4;
      const velocityOffset = index * 2;
      this.particles[particleOffset] = Math.random() * 2 - 1;
      this.particles[particleOffset + 1] = Math.random() * 2 - 1;
      this.particles[particleOffset + 2] = 1.2 + Math.random() * 2.8;
      this.particles[particleOffset + 3] = 0.12 + Math.random() * 0.42;
      this.velocities[velocityOffset] = (Math.random() - 0.5) * 0.045;
      this.velocities[velocityOffset + 1] = (Math.random() - 0.5) * 0.045;
    }

    resetSnowParticle(index, initialPlacement) {
      const particleOffset = index * 4;
      const propertyOffset = index * 4;
      const layer = Math.floor(Math.random() * 3);
      const layerSettings = SNOW_LAYERS[layer];

      this.particles[particleOffset] = Math.random() * 2 - 1;
      this.particles[particleOffset + 1] = initialPlacement
        ? Math.random() * 2 - 1
        : 1.04 + Math.random() * 0.18;
      this.particles[particleOffset + 2] = randomBetween(layerSettings.sizeMin, layerSettings.sizeMax);
      this.particles[particleOffset + 3] = randomBetween(layerSettings.alphaMin, layerSettings.alphaMax);
      this.snowProperties[propertyOffset] = randomBetween(layerSettings.speedMin, layerSettings.speedMax);
      this.snowProperties[propertyOffset + 1] = randomBetween(layerSettings.driftMin, layerSettings.driftMax);
      this.snowProperties[propertyOffset + 2] = Math.random() * Math.PI * 2;
      this.snowProperties[propertyOffset + 3] = layer;
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
      const previousClientX = this.mouse.lastClientX;
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
      this.mouse.active = true;
      this.mouse.lastClientX = event.clientX;
      this.starParallax.targetX = -this.mouse.x;
      this.starParallax.targetY = -this.mouse.y;
      if (previousClientX !== null) {
        const movement = (event.clientX - previousClientX) / rect.width;
        const targetWind = Math.max(-0.08, Math.min(0.08, movement * 8));
        this.mouse.windX = this.mouse.windX * 0.65 + targetWind * 0.35;
      }
    }

    onMouseLeave() {
      this.mouse.active = false;
      this.mouse.lastClientX = null;
      this.mouse.windX = 0;
      this.starParallax.targetX = 0;
      this.starParallax.targetY = 0;
    }

    onVisibilityChange() {
      if (document.hidden) this.stop();
      else if (this.enabled) this.start();
    }

    update(time, deltaSeconds) {
      if (this.currentEffect === 'stars') this.updateStars(deltaSeconds);
      else if (this.currentEffect === 'snow') this.updateSnow(time, deltaSeconds);
      else this.updateFloatingLight(time, deltaSeconds);
    }

    updateFloatingLight(time, deltaSeconds) {
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

    updateSnow(time, deltaSeconds) {
      const windRadius = 0.30;
      const windRadiusSquared = windRadius * windRadius;
      for (let index = 0; index < this.count; index += 1) {
        const particleOffset = index * 4;
        const propertyOffset = index * 4;
        let x = this.particles[particleOffset];
        let y = this.particles[particleOffset + 1];
        const speed = this.snowProperties[propertyOffset];
        const drift = this.snowProperties[propertyOffset + 1];
        const phase = this.snowProperties[propertyOffset + 2];

        x += Math.sin(time * 0.0011 + phase) * drift * deltaSeconds;
        y -= speed * deltaSeconds;
        if (this.mouse.active && Math.abs(this.mouse.windX) > 0.0001) {
          const dx = x - this.mouse.x;
          const dy = y - this.mouse.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < windRadiusSquared) {
            const influence = 1 - Math.sqrt(distanceSquared) / windRadius;
            x += this.mouse.windX * influence * deltaSeconds;
          }
        }

        if (x < -1.06) x = 1.06;
        else if (x > 1.06) x = -1.06;
        this.particles[particleOffset] = x;
        this.particles[particleOffset + 1] = y;
        if (y < -1.08) this.resetSnowParticle(index, false);
      }
      this.mouse.windX *= Math.pow(0.16, deltaSeconds);
    }

    updateStars(deltaSeconds) {
      const smoothing = 1 - Math.pow(0.95, deltaSeconds * 60);
      this.starParallax.currentX += (this.starParallax.targetX - this.starParallax.currentX) * smoothing;
      this.starParallax.currentY += (this.starParallax.targetY - this.starParallax.currentY) * smoothing;

      for (let index = 0; index < this.count; index += 1) {
        const offset = index * STAR_STRIDE;
        const x = this.starParticles[offset];
        const y = this.starParticles[offset + 1];
        const speed = this.starParticles[offset + 5];
        const z = this.starParticles[offset + 2] - speed * deltaSeconds;
        const projectedX = x / Math.max(z, STAR_MIN_DEPTH);
        const projectedY = y / Math.max(z, STAR_MIN_DEPTH);

        this.starParticles[offset + 2] = z;
        if (
          z <= STAR_MIN_DEPTH
          || Math.abs(projectedX) > 1.28
          || Math.abs(projectedY) > 1.22
        ) {
          this.resetStarParticle(index, false);
        }
      }
    }

    renderFrame(time) {
      if (this.animationFrameId === null || !this.enabled || document.hidden) return;
      const deltaSeconds = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.033) : 0;
      this.lastTime = time;
      this.update(time, deltaSeconds);

      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (this.currentEffect === 'stars') {
        gl.useProgram(this.starProgram);
        gl.uniform1f(this.starDprLocation, this.dpr || 1);
        gl.uniform1f(this.starTimeLocation, time * 0.001);
        gl.uniform2f(
          this.starParallaxLocation,
          this.starParallax.currentX,
          this.starParallax.currentY
        );
        gl.bindVertexArray(this.starVertexArray);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.starParticles);
      } else {
        gl.useProgram(this.program);
        gl.uniform1f(this.dprLocation, this.dpr || 1);
        gl.uniform1f(this.effectTypeLocation, this.currentEffect === 'snow' ? 1 : 0);
        gl.bindVertexArray(this.particleVertexArray);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particles);
      }
      gl.drawArrays(gl.POINTS, 0, this.count);
      gl.bindVertexArray(null);
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

    setEffect(effectType) {
      if (!BACKGROUND_MODES.includes(effectType)) return false;
      if (effectType === this.currentEffect) {
        this.updateToggleUi();
        return true;
      }

      if (this.initialized && effectType !== 'static') {
        try {
          this.createParticles(effectType);
        } catch (error) {
          console.warn('GPU \u80cc\u666f\u5207\u6362\u5931\u8d25\uff0c\u5df2\u4fdd\u7559\u5f53\u524d\u80cc\u666f\u3002', error);
          return false;
        }
      }
      this.currentEffect = effectType;
      this.effectType = effectType;
      this.enabled = effectType !== 'static';
      if (this.enabled) this.lastDynamicEffect = effectType;
      this.saveBackgroundMode();
      this.updateToggleUi();
      this.canvas.classList.toggle('is-disabled', !this.enabled);

      if (!this.enabled) {
        this.stop();
        if (this.gl) this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      } else if (!document.hidden) {
        this.start();
      }
      return true;
    }

    setEnabled(enabled) {
      return this.setEffect(enabled ? this.lastDynamicEffect : 'static');
    }

    toggle() {
      const currentIndex = BACKGROUND_MODES.indexOf(this.currentEffect);
      const nextMode = BACKGROUND_MODES[(currentIndex + 1) % BACKGROUND_MODES.length];
      this.setEffect(nextMode);
    }

    updateToggleUi() {
      if (!this.toggleButton) return;
      const currentIndex = BACKGROUND_MODES.indexOf(this.currentEffect);
      const nextMode = BACKGROUND_MODES[(currentIndex + 1) % BACKGROUND_MODES.length];
      this.toggleButton.textContent = MODE_LABELS[this.currentEffect];
      this.toggleButton.title = `\u5f53\u524d\u80cc\u666f\uff1a${MODE_LABELS[this.currentEffect].replace('\u58c1\u7eb8\uff1a', '')}\uff1b\u70b9\u51fb\u5207\u6362\u5230${MODE_LABELS[nextMode].replace('\u58c1\u7eb8\uff1a', '')}`;
      this.toggleButton.dataset.mode = this.currentEffect;
      this.toggleButton.setAttribute('aria-label', this.toggleButton.title);
      this.toggleButton.setAttribute('aria-pressed', this.enabled ? 'true' : 'false');
    }

    destroyStarResources() {
      if (!this.gl) return;
      if (this.starBuffer) this.gl.deleteBuffer(this.starBuffer);
      if (this.starVertexArray) this.gl.deleteVertexArray(this.starVertexArray);
      if (this.starProgram) this.gl.deleteProgram(this.starProgram);
      if (this.starVertexShader) this.gl.deleteShader(this.starVertexShader);
      if (this.starFragmentShader) this.gl.deleteShader(this.starFragmentShader);
      this.starBuffer = null;
      this.starVertexArray = null;
      this.starProgram = null;
      this.starVertexShader = null;
      this.starFragmentShader = null;
      this.starParticles = null;
    }

    destroyWebGlResources() {
      if (!this.gl) return;
      if (this.particleBuffer) this.gl.deleteBuffer(this.particleBuffer);
      if (this.particleVertexArray) this.gl.deleteVertexArray(this.particleVertexArray);
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.vertexShader) this.gl.deleteShader(this.vertexShader);
      if (this.fragmentShader) this.gl.deleteShader(this.fragmentShader);
      this.destroyStarResources();
      this.particleBuffer = null;
      this.particleVertexArray = null;
      this.program = null;
      this.vertexShader = null;
      this.fragmentShader = null;
      this.particles = null;
      this.velocities = null;
      this.snowProperties = null;
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
      snowQuality: 'medium',
      starQuality: 'medium',
    });
    window.gpuParticleWallpaper = instance;
    instance.init();
  }

  window.GpuParticleWallpaper = GpuParticleWallpaper;
  window.PARTICLE_QUALITY = PARTICLE_QUALITY;
  window.SNOW_QUALITY = SNOW_QUALITY;
  window.STAR_QUALITY = STAR_QUALITY;
  window.BACKGROUND_MODES = BACKGROUND_MODES;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeParticleWallpaper, { once: true });
  } else {
    initializeParticleWallpaper();
  }
}());
