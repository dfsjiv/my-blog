(function () {
  const BUILDING_COUNT = 100;
  const BUILDING_INSTANCE_STRIDE = 20;
  const RAIN_STRIDE = 7;
  const DEG_TO_RAD = Math.PI / 180;

  function randomBetween(random, min, max) {
    return min + random() * (max - min);
  }

  function createSeededRandom(seed) {
    let state = seed >>> 0;
    return function seededRandom() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createPerspectiveMatrix(out, fieldOfView, aspect, near, far) {
    const f = 1 / Math.tan(fieldOfView / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  }

  function createLookAtMatrix(out, eye, target) {
    let z0 = eye[0] - target[0];
    let z1 = eye[1] - target[1];
    let z2 = eye[2] - target[2];
    let length = Math.hypot(z0, z1, z2) || 1;
    z0 /= length;
    z1 /= length;
    z2 /= length;

    let x0 = z2;
    let x1 = 0;
    let x2 = -z0;
    length = Math.hypot(x0, x1, x2) || 1;
    x0 /= length;
    x1 /= length;
    x2 /= length;

    const y0 = z1 * x2 - z2 * x1;
    const y1 = z2 * x0 - z0 * x2;
    const y2 = z0 * x1 - z1 * x0;

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    out[15] = 1;
    return out;
  }

  function createCubeVertices() {
    const vertices = [];
    const addFace = (normal, corners) => {
      const order = [0, 1, 2, 0, 2, 3];
      for (let index = 0; index < order.length; index += 1) {
        const corner = corners[order[index]];
        vertices.push(corner[0], corner[1], corner[2], normal[0], normal[1], normal[2]);
      }
    };
    addFace([0, 0, 1], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]);
    addFace([0, 0, -1], [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]);
    addFace([-1, 0, 0], [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]]);
    addFace([1, 0, 0], [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]]);
    addFace([0, 1, 0], [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]]);
    addFace([0, -1, 0], [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]]);
    return new Float32Array(vertices);
  }

  class NightRainCity3D {
    constructor(gl, options) {
      const settings = options || {};
      this.gl = gl;
      this.rainCount = Math.max(1, settings.rainCount || 1420);
      this.initialized = false;
      this.destroyed = false;
      this.projectionMatrix = new Float32Array(16);
      this.viewMatrix = new Float32Array(16);
      this.cameraPosition = new Float32Array([3.2, 9.5, 14.0]);
      this.cameraTarget = new Float32Array(3);
      this.camera = {
        fieldOfView: 55 * DEG_TO_RAD,
        near: 0.1,
        far: 140,
        aspect: 1,
        targetYaw: -1.5 * DEG_TO_RAD,
        targetPitch: -6.0 * DEG_TO_RAD,
        currentYaw: -1.5 * DEG_TO_RAD,
        currentPitch: -6.0 * DEG_TO_RAD,
      };
      this.mouseX = 0;
      this.mouseY = 0;
      this.rainIntensity = 0.82;
      this.targetRainIntensity = 0.82;
      this.nextRainIntensityTime = 0;
      this.lightningIntensity = 0;
      this.nextLightningTime = 0;
      this.rainData = null;
      this.resources = [];
      this.drawCallCount = 4;
    }

    init() {
      if (this.initialized || this.destroyed) return;
      try {
        this.createSkyResources();
        this.createBuildingResources();
        this.createGroundResources();
        this.createRainResources();
        this.createBuildings();
        this.resetRain();
        this.initialized = true;
      } catch (error) {
        this.destroy();
        throw error;
      }
    }

    createShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || '3D shader compilation failed';
        gl.deleteShader(shader);
        throw new Error(message);
      }
      this.resources.push(['shader', shader]);
      return shader;
    }

    createProgram(vertexSource, fragmentSource) {
      const gl = this.gl;
      const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        throw new Error(gl.getProgramInfoLog(program) || '3D program linking failed');
      }
      this.resources.push(['program', program]);
      return program;
    }

    trackResource(type, resource) {
      this.resources.push([type, resource]);
      return resource;
    }

    createSkyResources() {
      const gl = this.gl;
      const vertexSource = `#version 300 es
        precision highp float;
        out vec2 v_uv;
        void main() {
          vec2 position = vec2(
            gl_VertexID == 1 ? 2.0 : 0.0,
            gl_VertexID == 2 ? 2.0 : 0.0
          );
          v_uv = position;
          gl_Position = vec4(position * 2.0 - 1.0, 1.0, 1.0);
        }
      `;
      const fragmentSource = `#version 300 es
        precision highp float;
        in vec2 v_uv;
        uniform float u_lightning;
        out vec4 outColor;
        void main() {
          vec3 horizon = vec3(0.075, 0.095, 0.150);
          vec3 middle = vec3(0.025, 0.052, 0.092);
          vec3 zenith = vec3(0.008, 0.016, 0.040);
          vec3 color = mix(horizon, middle, smoothstep(0.18, 0.68, v_uv.y));
          color = mix(color, zenith, smoothstep(0.62, 1.0, v_uv.y));
          color += vec3(0.12, 0.15, 0.20) * u_lightning;
          outColor = vec4(color, 1.0);
        }
      `;
      this.skyProgram = this.createProgram(vertexSource, fragmentSource);
      this.skyLightningLocation = gl.getUniformLocation(this.skyProgram, 'u_lightning');
      this.skyVertexArray = this.trackResource('vertexArray', gl.createVertexArray());
    }

    createBuildingResources() {
      const gl = this.gl;
      const vertexSource = `#version 300 es
        precision highp float;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_normal;
        layout(location = 2) in vec4 a_model0;
        layout(location = 3) in vec4 a_model1;
        layout(location = 4) in vec4 a_model2;
        layout(location = 5) in vec4 a_model3;
        layout(location = 6) in vec3 a_color;
        layout(location = 7) in float a_seed;
        uniform mat4 u_projection;
        uniform mat4 u_view;
        uniform vec3 u_cameraPosition;
        out vec3 v_worldPosition;
        out vec3 v_worldNormal;
        out vec3 v_localPosition;
        out vec3 v_localNormal;
        out vec3 v_scale;
        out vec3 v_color;
        out float v_seed;
        out float v_cameraDistance;
        void main() {
          mat4 modelMatrix = mat4(a_model0, a_model1, a_model2, a_model3);
          vec4 worldPosition = modelMatrix * vec4(a_position, 1.0);
          v_worldPosition = worldPosition.xyz;
          v_worldNormal = normalize(mat3(modelMatrix) * a_normal);
          v_localPosition = a_position;
          v_localNormal = a_normal;
          v_scale = vec3(length(a_model0.xyz), length(a_model1.xyz), length(a_model2.xyz));
          v_color = a_color;
          v_seed = a_seed;
          v_cameraDistance = distance(u_cameraPosition, worldPosition.xyz);
          gl_Position = u_projection * u_view * worldPosition;
        }
      `;
      const fragmentSource = `#version 300 es
        precision highp float;
        in vec3 v_worldPosition;
        in vec3 v_worldNormal;
        in vec3 v_localPosition;
        in vec3 v_localNormal;
        in vec3 v_scale;
        in vec3 v_color;
        in float v_seed;
        in float v_cameraDistance;
        uniform float u_time;
        uniform float u_lightning;
        out vec4 outColor;

        float hash21(vec2 value) {
          return fract(sin(dot(value, vec2(127.1, 311.7)) + v_seed * 17.0) * 43758.5453);
        }

        vec3 windowColor(float value) {
          if (value < 0.62) return vec3(1.0, 0.72, 0.30);
          if (value < 0.92) return vec3(0.72, 0.84, 1.0);
          return vec3(1.0, 0.90, 0.68);
        }

        void main() {
          vec3 normal = normalize(v_worldNormal);
          vec3 moonDirection = normalize(vec3(-0.35, 0.82, 0.42));
          float diffuse = max(dot(normal, moonDirection), 0.0);
          float faceLight = 0.19 + diffuse * 0.32 + max(normal.y, 0.0) * 0.08;
          vec3 color = v_color * faceLight;

          float verticalFace = 1.0 - step(0.5, abs(v_localNormal.y));
          vec2 faceUv = abs(v_localNormal.z) > 0.5
            ? vec2(v_localPosition.x + 0.5, v_localPosition.y + 0.5)
            : vec2(v_localPosition.z + 0.5, v_localPosition.y + 0.5);
          float faceWidth = abs(v_localNormal.z) > 0.5 ? v_scale.x : v_scale.z;
          vec2 gridSize = vec2(
            max(2.0, floor(faceWidth * 1.25)),
            max(4.0, floor(v_scale.y * 0.72))
          );
          vec2 grid = faceUv * gridSize;
          vec2 cell = floor(grid);
          vec2 localCell = fract(grid);
          float pane = step(0.20, localCell.x)
            * step(localCell.x, 0.78)
            * step(0.20, localCell.y)
            * step(localCell.y, 0.72);
          float stableValue = hash21(cell + v_localNormal.xz * 31.0);
          float lit = step(0.70, stableValue) * pane * verticalFace;
          float rareSlowWindow = step(0.993, hash21(cell * 2.31 + 8.0));
          float slowLevel = 0.82 + sin(u_time * 0.07 + stableValue * 6.2831) * 0.18;
          float windowLevel = lit * mix(1.0, slowLevel, rareSlowWindow);
          color = mix(color, windowColor(stableValue), windowLevel * 0.90);

          color += vec3(0.12, 0.15, 0.19) * u_lightning * (0.55 + diffuse);
          float fogNoise = sin(v_worldPosition.x * 0.07 + u_time * 0.025)
            * sin(v_worldPosition.z * 0.045 - u_time * 0.018) * 0.025;
          float fogAmount = smoothstep(26.0, 112.0, v_cameraDistance) + fogNoise;
          fogAmount = clamp(fogAmount, 0.0, 0.88);
          vec3 fogColor = vec3(0.105, 0.125, 0.165) + u_lightning * 0.08;
          color = mix(color, fogColor, fogAmount);
          outColor = vec4(color, 1.0);
        }
      `;
      this.buildingProgram = this.createProgram(vertexSource, fragmentSource);
      this.buildingProjectionLocation = gl.getUniformLocation(this.buildingProgram, 'u_projection');
      this.buildingViewLocation = gl.getUniformLocation(this.buildingProgram, 'u_view');
      this.buildingCameraLocation = gl.getUniformLocation(this.buildingProgram, 'u_cameraPosition');
      this.buildingTimeLocation = gl.getUniformLocation(this.buildingProgram, 'u_time');
      this.buildingLightningLocation = gl.getUniformLocation(this.buildingProgram, 'u_lightning');

      this.buildingVertexArray = this.trackResource('vertexArray', gl.createVertexArray());
      gl.bindVertexArray(this.buildingVertexArray);
      this.buildingGeometryBuffer = this.trackResource('buffer', gl.createBuffer());
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buildingGeometryBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, createCubeVertices(), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

      this.buildingInstanceBuffer = this.trackResource('buffer', gl.createBuffer());
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buildingInstanceBuffer);
      const stride = BUILDING_INSTANCE_STRIDE * Float32Array.BYTES_PER_ELEMENT;
      for (let column = 0; column < 4; column += 1) {
        const location = 2 + column;
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 4, gl.FLOAT, false, stride, column * 16);
        gl.vertexAttribDivisor(location, 1);
      }
      gl.enableVertexAttribArray(6);
      gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 64);
      gl.vertexAttribDivisor(6, 1);
      gl.enableVertexAttribArray(7);
      gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 76);
      gl.vertexAttribDivisor(7, 1);
      gl.bindVertexArray(null);
    }

    createGroundResources() {
      const gl = this.gl;
      const vertexSource = `#version 300 es
        precision highp float;
        layout(location = 0) in vec3 a_position;
        uniform mat4 u_projection;
        uniform mat4 u_view;
        out vec3 v_worldPosition;
        void main() {
          v_worldPosition = a_position;
          gl_Position = u_projection * u_view * vec4(a_position, 1.0);
        }
      `;
      const fragmentSource = `#version 300 es
        precision highp float;
        in vec3 v_worldPosition;
        uniform vec3 u_cameraPosition;
        uniform float u_time;
        uniform float u_lightning;
        out vec4 outColor;

        float hash21(vec2 value) {
          return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec3 normal = vec3(0.0, 1.0, 0.0);
          vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
          float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
          float road = 1.0 - smoothstep(5.8, 7.4, abs(v_worldPosition.x));
          vec3 color = mix(vec3(0.012, 0.020, 0.026), vec3(0.018, 0.027, 0.034), road);

          float ripple = sin(length(v_worldPosition.xz * vec2(0.75, 0.22)) * 15.0 - u_time * 1.6);
          ripple *= sin(v_worldPosition.z * 0.52 + u_time * 0.28);
          float wetNoise = hash21(floor(v_worldPosition.xz * 2.0));
          float roughness = 0.58 + wetNoise * 0.20 + ripple * 0.035;
          color += vec3(0.055, 0.085, 0.115) * fresnel * (1.0 - roughness);

          float sideDistance = abs(abs(v_worldPosition.x) - 7.2);
          float sideLight = exp(-sideDistance * sideDistance * 0.75);
          float lightCell = hash21(vec2(floor(v_worldPosition.z * 0.32), floor(abs(v_worldPosition.x))));
          float lightOn = step(0.70, lightCell);
          float brokenReflection = smoothstep(
            0.15,
            0.90,
            sin(v_worldPosition.z * mix(2.5, 5.5, lightCell) + u_time * 0.25) * 0.5 + 0.5
          );
          float reflection = sideLight * lightOn * brokenReflection * fresnel * 0.42;
          vec3 reflectionColor = lightCell < 0.84
            ? vec3(1.0, 0.64, 0.25)
            : vec3(0.55, 0.76, 1.0);
          color += reflectionColor * reflection;
          color += vec3(0.11, 0.14, 0.18) * u_lightning * (0.18 + fresnel * 0.55);

          float distanceToCamera = distance(u_cameraPosition, v_worldPosition);
          float fog = smoothstep(38.0, 120.0, distanceToCamera) * 0.72;
          color = mix(color, vec3(0.085, 0.105, 0.140), fog);
          outColor = vec4(color, 1.0);
        }
      `;
      this.groundProgram = this.createProgram(vertexSource, fragmentSource);
      this.groundProjectionLocation = gl.getUniformLocation(this.groundProgram, 'u_projection');
      this.groundViewLocation = gl.getUniformLocation(this.groundProgram, 'u_view');
      this.groundCameraLocation = gl.getUniformLocation(this.groundProgram, 'u_cameraPosition');
      this.groundTimeLocation = gl.getUniformLocation(this.groundProgram, 'u_time');
      this.groundLightningLocation = gl.getUniformLocation(this.groundProgram, 'u_lightning');
      this.groundVertexArray = this.trackResource('vertexArray', gl.createVertexArray());
      gl.bindVertexArray(this.groundVertexArray);
      this.groundBuffer = this.trackResource('buffer', gl.createBuffer());
      gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -42, 0, 10, 42, 0, 10, -42, 0, -115,
        -42, 0, -115, 42, 0, 10, 42, 0, -115,
      ]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      gl.bindVertexArray(null);
    }

    createRainResources() {
      const gl = this.gl;
      const vertexSource = `#version 300 es
        precision highp float;
        layout(location = 0) in vec4 a_drop;
        layout(location = 1) in vec3 a_motion;
        uniform mat4 u_projection;
        uniform mat4 u_view;
        uniform vec3 u_cameraPosition;
        uniform float u_intensity;
        out float v_alpha;
        out float v_distance;
        void main() {
          float endpoint = float(gl_VertexID);
          vec3 bottom = a_drop.xyz;
          vec3 top = bottom + vec3(-a_motion.z * a_drop.w, a_drop.w, 0.0);
          vec3 worldPosition = mix(top, bottom, endpoint);
          v_distance = distance(u_cameraPosition, worldPosition);
          float depthVisibility = 1.0 - smoothstep(18.0, 108.0, v_distance) * 0.84;
          v_alpha = a_motion.y * u_intensity * depthVisibility;
          gl_Position = u_projection * u_view * vec4(worldPosition, 1.0);
        }
      `;
      const fragmentSource = `#version 300 es
        precision highp float;
        in float v_alpha;
        in float v_distance;
        uniform float u_lightning;
        out vec4 outColor;
        void main() {
          float nearness = 1.0 - smoothstep(4.0, 95.0, v_distance);
          vec3 color = mix(vec3(0.40, 0.52, 0.64), vec3(0.78, 0.86, 0.94), nearness);
          color += vec3(0.20) * u_lightning;
          outColor = vec4(color, v_alpha * mix(0.45, 1.0, nearness));
        }
      `;
      this.rainProgram = this.createProgram(vertexSource, fragmentSource);
      this.rainProjectionLocation = gl.getUniformLocation(this.rainProgram, 'u_projection');
      this.rainViewLocation = gl.getUniformLocation(this.rainProgram, 'u_view');
      this.rainCameraLocation = gl.getUniformLocation(this.rainProgram, 'u_cameraPosition');
      this.rainIntensityLocation = gl.getUniformLocation(this.rainProgram, 'u_intensity');
      this.rainLightningLocation = gl.getUniformLocation(this.rainProgram, 'u_lightning');
      this.rainVertexArray = this.trackResource('vertexArray', gl.createVertexArray());
      gl.bindVertexArray(this.rainVertexArray);
      this.rainBuffer = this.trackResource('buffer', gl.createBuffer());
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rainBuffer);
      const stride = RAIN_STRIDE * Float32Array.BYTES_PER_ELEMENT;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(0, 1);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 16);
      gl.vertexAttribDivisor(1, 1);
      gl.bindVertexArray(null);
    }

    createBuildings() {
      const random = createSeededRandom(0xC17A3D);
      this.buildingData = new Float32Array(BUILDING_COUNT * BUILDING_INSTANCE_STRIDE);
      let buildingIndex = 0;
      const addBand = (count, zMin, zMax, xMin, widthMin, widthMax, heightMin, heightMax, depthMin, depthMax, colorBase) => {
        for (let index = 0; index < count; index += 1) {
          const offset = buildingIndex * BUILDING_INSTANCE_STRIDE;
          const side = random() < 0.5 ? -1 : 1;
          const sideXMin = side < 0 ? xMin : xMin + 4.2;
          const sideXMax = side < 0 ? 32.0 : 37.0;
          const x = side * randomBetween(random, sideXMin, sideXMax);
          const sideDepthOffset = side < 0
            ? randomBetween(random, -2.0, 3.5)
            : randomBetween(random, -6.0, 1.0);
          const z = randomBetween(random, zMin, zMax) + sideDepthOffset;
          const width = randomBetween(random, widthMin, widthMax);
          const height = randomBetween(random, heightMin, heightMax);
          const depth = randomBetween(random, depthMin, depthMax);
          const yaw = randomBetween(random, -0.08, 0.08);
          const cosine = Math.cos(yaw);
          const sine = Math.sin(yaw);

          this.buildingData[offset] = cosine * width;
          this.buildingData[offset + 1] = 0;
          this.buildingData[offset + 2] = -sine * width;
          this.buildingData[offset + 3] = 0;
          this.buildingData[offset + 4] = 0;
          this.buildingData[offset + 5] = height;
          this.buildingData[offset + 6] = 0;
          this.buildingData[offset + 7] = 0;
          this.buildingData[offset + 8] = sine * depth;
          this.buildingData[offset + 9] = 0;
          this.buildingData[offset + 10] = cosine * depth;
          this.buildingData[offset + 11] = 0;
          this.buildingData[offset + 12] = x;
          this.buildingData[offset + 13] = height * 0.5;
          this.buildingData[offset + 14] = z;
          this.buildingData[offset + 15] = 1;
          const colorVariation = randomBetween(random, 0.84, 1.16);
          this.buildingData[offset + 16] = colorBase[0] * colorVariation;
          this.buildingData[offset + 17] = colorBase[1] * colorVariation;
          this.buildingData[offset + 18] = colorBase[2] * colorVariation;
          this.buildingData[offset + 19] = random() * 1000;
          buildingIndex += 1;
        }
      };

      addBand(45, -116, -88, 10.5, 1.5, 3.8, 4.0, 10, 2.0, 4.5, [0.18, 0.25, 0.34]);
      addBand(35, -84, -54, 12.5, 2.4, 5.0, 6.0, 15, 3.0, 6.0, [0.16, 0.23, 0.32]);
      addBand(20, -52, -30, 15.0, 3.0, 5.4, 7.0, 13, 3.5, 5.5, [0.13, 0.20, 0.29]);

      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buildingInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.buildingData, gl.STATIC_DRAW);
    }

    resetRain() {
      const random = createSeededRandom(0xA11CE);
      const requiredLength = this.rainCount * RAIN_STRIDE;
      if (!this.rainData || this.rainData.length !== requiredLength) {
        this.rainData = new Float32Array(requiredLength);
      }
      for (let index = 0; index < this.rainCount; index += 1) {
        this.resetRainDrop(index, true, random);
      }
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rainBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.rainData, gl.DYNAMIC_DRAW);
    }

    resetRainDrop(index, initialPlacement, randomSource) {
      const random = randomSource || Math.random;
      const offset = index * RAIN_STRIDE;
      const z = randomBetween(random, -108, 6);
      this.rainData[offset] = randomBetween(random, -34, 34);
      this.rainData[offset + 1] = initialPlacement
        ? randomBetween(random, 0.2, 36)
        : randomBetween(random, 22, 38);
      this.rainData[offset + 2] = z;
      this.rainData[offset + 3] = randomBetween(random, 0.65, 1.55);
      this.rainData[offset + 4] = randomBetween(random, 8.0, 16.0);
      this.rainData[offset + 5] = randomBetween(random, 0.18, 0.58);
      this.rainData[offset + 6] = randomBetween(random, 0.12, 0.34);
    }

    resize(width, height) {
      if (!width || !height) return;
      this.camera.aspect = width / height;
      createPerspectiveMatrix(
        this.projectionMatrix,
        this.camera.fieldOfView,
        this.camera.aspect,
        this.camera.near,
        this.camera.far
      );
    }

    setMouse(normalizedX, normalizedY) {
      this.mouseX = normalizedX;
      this.mouseY = normalizedY;
      this.camera.targetYaw = (-1.5 + normalizedX * 3.0) * DEG_TO_RAD;
      this.camera.targetPitch = (-6.0 + normalizedY * 1.5) * DEG_TO_RAD;
    }

    updateCamera(deltaSeconds) {
      const smoothing = 1 - Math.pow(0.95, deltaSeconds * 60);
      this.camera.currentYaw += (this.camera.targetYaw - this.camera.currentYaw) * smoothing;
      this.camera.currentPitch += (this.camera.targetPitch - this.camera.currentPitch) * smoothing;
      const cosinePitch = Math.cos(this.camera.currentPitch);
      this.cameraTarget[0] = this.cameraPosition[0] + Math.sin(this.camera.currentYaw) * cosinePitch * 60;
      this.cameraTarget[1] = this.cameraPosition[1] + Math.sin(this.camera.currentPitch) * 60;
      this.cameraTarget[2] = this.cameraPosition[2] - Math.cos(this.camera.currentYaw) * cosinePitch * 60;
      createLookAtMatrix(this.viewMatrix, this.cameraPosition, this.cameraTarget);
    }

    update(time, deltaSeconds) {
      this.updateCamera(deltaSeconds);
      if (this.nextRainIntensityTime === 0) {
        this.nextRainIntensityTime = time + randomBetween(Math.random, 20000, 45000);
      } else if (time >= this.nextRainIntensityTime) {
        this.targetRainIntensity = randomBetween(Math.random, 0.68, 1.0);
        this.nextRainIntensityTime = time + randomBetween(Math.random, 20000, 45000);
      }
      this.rainIntensity += (this.targetRainIntensity - this.rainIntensity)
        * (1 - Math.exp(-deltaSeconds * 0.12));

      if (this.nextLightningTime === 0) {
        this.nextLightningTime = time + randomBetween(Math.random, 20000, 60000);
      } else if (time >= this.nextLightningTime) {
        this.lightningIntensity = randomBetween(Math.random, 0.25, 0.45);
        this.nextLightningTime = time + randomBetween(Math.random, 20000, 60000);
      }
      this.lightningIntensity *= Math.exp(-deltaSeconds * 4.6);

      const wind = 0.10 + Math.sin(time * 0.00008) * 0.06;
      const speedScale = 0.84 + this.rainIntensity * 0.24;
      for (let index = 0; index < this.rainCount; index += 1) {
        const offset = index * RAIN_STRIDE;
        this.rainData[offset] += (wind + this.rainData[offset + 6]) * deltaSeconds;
        this.rainData[offset + 1] -= this.rainData[offset + 4] * speedScale * deltaSeconds;
        if (this.rainData[offset + 1] <= 0 || this.rainData[offset] > 40) {
          this.resetRainDrop(index, false);
        }
      }
    }

    setCommonMatrices(programLocations) {
      const gl = this.gl;
      gl.uniformMatrix4fv(programLocations.projection, false, this.projectionMatrix);
      gl.uniformMatrix4fv(programLocations.view, false, this.viewMatrix);
    }

    render(time) {
      if (!this.initialized || this.destroyed) return;
      const gl = this.gl;
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.useProgram(this.skyProgram);
      gl.uniform1f(this.skyLightningLocation, this.lightningIntensity);
      gl.bindVertexArray(this.skyVertexArray);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);

      gl.useProgram(this.groundProgram);
      this.setCommonMatrices({
        projection: this.groundProjectionLocation,
        view: this.groundViewLocation,
      });
      gl.uniform3fv(this.groundCameraLocation, this.cameraPosition);
      gl.uniform1f(this.groundTimeLocation, time * 0.001);
      gl.uniform1f(this.groundLightningLocation, this.lightningIntensity);
      gl.bindVertexArray(this.groundVertexArray);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
      gl.useProgram(this.buildingProgram);
      this.setCommonMatrices({
        projection: this.buildingProjectionLocation,
        view: this.buildingViewLocation,
      });
      gl.uniform3fv(this.buildingCameraLocation, this.cameraPosition);
      gl.uniform1f(this.buildingTimeLocation, time * 0.001);
      gl.uniform1f(this.buildingLightningLocation, this.lightningIntensity);
      gl.bindVertexArray(this.buildingVertexArray);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, BUILDING_COUNT);

      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.rainProgram);
      this.setCommonMatrices({
        projection: this.rainProjectionLocation,
        view: this.rainViewLocation,
      });
      gl.uniform3fv(this.rainCameraLocation, this.cameraPosition);
      gl.uniform1f(this.rainIntensityLocation, this.rainIntensity);
      gl.uniform1f(this.rainLightningLocation, this.lightningIntensity);
      gl.bindVertexArray(this.rainVertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rainBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.rainData);
      gl.drawArraysInstanced(gl.LINES, 0, 2, this.rainCount);
      gl.bindVertexArray(null);
    }

    destroy() {
      if (this.destroyed) return;
      const gl = this.gl;
      for (let index = this.resources.length - 1; index >= 0; index -= 1) {
        const entry = this.resources[index];
        if (entry[0] === 'buffer') gl.deleteBuffer(entry[1]);
        else if (entry[0] === 'vertexArray') gl.deleteVertexArray(entry[1]);
        else if (entry[0] === 'program') gl.deleteProgram(entry[1]);
        else if (entry[0] === 'shader') gl.deleteShader(entry[1]);
      }
      this.resources.length = 0;
      this.rainData = null;
      this.buildingData = null;
      this.initialized = false;
      this.destroyed = true;
    }
  }

  window.NightRainCity3D = NightRainCity3D;
}());
