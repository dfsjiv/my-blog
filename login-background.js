(function () {
  'use strict';

  const canvas = document.getElementById('loginReactiveCanvas');
  const screen = document.getElementById('loginScreen');
  if (!canvas || !screen) return;

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  const palette = ['#67d7ff', '#f8d66d', '#ff7f8f', '#79e0b5', '#b8a5ff', '#f5fbff'];
  const effectKinds = ['ripple', 'burst', 'tiles', 'polygon', 'orbit'];
  const effects = [];
  const ambientShapes = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let animationFrame = 0;
  let pointerDown = false;
  let lastPointerEffect = 0;
  let lastFrameTime = 0;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  function isVisible() {
    return screen.getAttribute('aria-hidden') !== 'true'
      && !document.body.classList.contains('auth-desktop')
      && !document.body.classList.contains('auth-version')
      && !document.body.classList.contains('auth-elegant');
  }

  function resizeCanvas() {
    const bounds = screen.getBoundingClientRect();
    width = Math.max(1, bounds.width || window.innerWidth);
    height = Math.max(1, bounds.height || window.innerHeight);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    createAmbientShapes();
  }

  function createAmbientShapes() {
    ambientShapes.length = 0;
    const count = Math.max(8, Math.min(18, Math.round((width * height) / 90000)));
    for (let index = 0; index < count; index += 1) {
      ambientShapes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: randomBetween(18, 78),
        speedX: randomBetween(-4, 4),
        speedY: randomBetween(-3, 3),
        rotation: Math.random() * Math.PI,
        rotationSpeed: randomBetween(-0.035, 0.035),
        sides: Math.floor(randomBetween(3, 7)),
        color: randomItem(palette),
      });
    }
  }

  function spawnEffect(x, y, kind) {
    if (reducedMotion.matches || effects.length > 32) return;
    effects.push({
      x,
      y,
      kind: kind || randomItem(effectKinds),
      color: randomItem(palette),
      secondaryColor: randomItem(palette),
      bornAt: performance.now(),
      duration: randomBetween(620, 980),
      size: randomBetween(58, 118),
      rotation: Math.random() * Math.PI * 2,
      sides: Math.floor(randomBetween(3, 7)),
    });
    startAnimation();
  }

  function drawPolygon(x, y, radius, sides, rotation) {
    context.beginPath();
    for (let index = 0; index < sides; index += 1) {
      const angle = rotation + (Math.PI * 2 * index) / sides;
      const pointX = x + Math.cos(angle) * radius;
      const pointY = y + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.closePath();
  }

  function drawAmbient(deltaSeconds) {
    context.save();
    ambientShapes.forEach((shape) => {
      shape.x += shape.speedX * deltaSeconds;
      shape.y += shape.speedY * deltaSeconds;
      shape.rotation += shape.rotationSpeed * deltaSeconds;
      if (shape.x < -shape.radius) shape.x = width + shape.radius;
      if (shape.x > width + shape.radius) shape.x = -shape.radius;
      if (shape.y < -shape.radius) shape.y = height + shape.radius;
      if (shape.y > height + shape.radius) shape.y = -shape.radius;

      context.globalAlpha = 0.08;
      context.strokeStyle = shape.color;
      context.lineWidth = 1;
      drawPolygon(shape.x, shape.y, shape.radius, shape.sides, shape.rotation);
      context.stroke();
    });
    context.restore();
  }

  function drawRipple(effect, progress) {
    const eased = easeOutCubic(progress);
    for (let ring = 0; ring < 3; ring += 1) {
      const ringProgress = Math.max(0, eased - ring * 0.12);
      context.globalAlpha = (1 - progress) * (0.54 - ring * 0.12);
      context.strokeStyle = ring === 1 ? effect.secondaryColor : effect.color;
      context.lineWidth = Math.max(1, 5 - progress * 4);
      context.beginPath();
      context.arc(effect.x, effect.y, effect.size * ringProgress, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawBurst(effect, progress) {
    const rayCount = 14;
    const inner = effect.size * 0.18 * progress;
    const outer = effect.size * easeOutCubic(progress);
    context.strokeStyle = effect.color;
    context.lineWidth = 2.5 - progress * 1.5;
    context.globalAlpha = (1 - progress) * 0.72;
    context.beginPath();
    for (let index = 0; index < rayCount; index += 1) {
      const angle = effect.rotation + (Math.PI * 2 * index) / rayCount;
      context.moveTo(effect.x + Math.cos(angle) * inner, effect.y + Math.sin(angle) * inner);
      context.lineTo(effect.x + Math.cos(angle) * outer, effect.y + Math.sin(angle) * outer);
    }
    context.stroke();
  }

  function drawTiles(effect, progress) {
    const eased = easeOutCubic(progress);
    const distance = effect.size * eased;
    context.fillStyle = effect.color;
    context.globalAlpha = (1 - progress) * 0.52;
    for (let index = 0; index < 8; index += 1) {
      const angle = effect.rotation + (Math.PI * 2 * index) / 8 + progress * 0.7;
      const tileSize = Math.max(3, 13 * (1 - progress * 0.55));
      const x = effect.x + Math.cos(angle) * distance;
      const y = effect.y + Math.sin(angle) * distance;
      context.save();
      context.translate(x, y);
      context.rotate(angle + progress * Math.PI);
      context.fillRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize);
      context.restore();
    }
  }

  function drawPolygonEffect(effect, progress) {
    context.globalAlpha = (1 - progress) * 0.68;
    context.strokeStyle = effect.color;
    context.lineWidth = 4 - progress * 3;
    drawPolygon(
      effect.x,
      effect.y,
      effect.size * easeOutCubic(progress),
      effect.sides,
      effect.rotation + progress * 0.8,
    );
    context.stroke();
  }

  function drawOrbit(effect, progress) {
    const radius = effect.size * (0.25 + progress * 0.75);
    context.globalAlpha = (1 - progress) * 0.62;
    context.strokeStyle = effect.color;
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(effect.x, effect.y, radius, radius * 0.42, effect.rotation + progress, 0, Math.PI * 1.6);
    context.stroke();
    context.fillStyle = effect.secondaryColor;
    context.beginPath();
    const angle = effect.rotation + progress * Math.PI * 4;
    context.arc(
      effect.x + Math.cos(angle) * radius,
      effect.y + Math.sin(angle) * radius * 0.42,
      Math.max(2, 7 * (1 - progress)),
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  function drawEffects(now) {
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      const effect = effects[index];
      const progress = (now - effect.bornAt) / effect.duration;
      if (progress >= 1) {
        effects.splice(index, 1);
        continue;
      }
      context.save();
      if (effect.kind === 'ripple') drawRipple(effect, progress);
      else if (effect.kind === 'burst') drawBurst(effect, progress);
      else if (effect.kind === 'tiles') drawTiles(effect, progress);
      else if (effect.kind === 'polygon') drawPolygonEffect(effect, progress);
      else drawOrbit(effect, progress);
      context.restore();
    }
  }

  function render(now) {
    if (!isVisible() || document.hidden) {
      stopAnimation();
      return;
    }

    const deltaSeconds = Math.min((now - (lastFrameTime || now)) / 1000, 0.05);
    lastFrameTime = now;
    context.clearRect(0, 0, width, height);
    drawAmbient(reducedMotion.matches ? 0 : deltaSeconds);
    drawEffects(now);
    animationFrame = window.requestAnimationFrame(render);
  }

  function startAnimation() {
    if (animationFrame || !isVisible() || document.hidden) return;
    lastFrameTime = 0;
    animationFrame = window.requestAnimationFrame(render);
  }

  function stopAnimation() {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrameTime = 0;
    effects.length = 0;
    context.clearRect(0, 0, width, height);
  }

  function pointerPosition(event) {
    const bounds = screen.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  screen.addEventListener('pointerdown', (event) => {
    if (!isVisible()) return;
    pointerDown = true;
    const point = pointerPosition(event);
    spawnEffect(point.x, point.y);
  });

  screen.addEventListener('pointermove', (event) => {
    if (!pointerDown || !isVisible()) return;
    const now = performance.now();
    if (now - lastPointerEffect < 85) return;
    lastPointerEffect = now;
    const point = pointerPosition(event);
    spawnEffect(point.x, point.y, Math.random() > 0.5 ? 'ripple' : 'tiles');
  });

  window.addEventListener('pointerup', () => {
    pointerDown = false;
  });

  window.addEventListener('keydown', (event) => {
    if (!isVisible() || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLElement
      && (target.matches('input, textarea, select, button') || target.isContentEditable)) return;
    spawnEffect(randomBetween(width * 0.12, width * 0.88), randomBetween(height * 0.14, height * 0.86));
  });

  window.addEventListener('resize', resizeCanvas, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAnimation();
    else startAnimation();
  });

  new MutationObserver(() => {
    if (isVisible()) startAnimation();
    else stopAnimation();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  resizeCanvas();
  spawnEffect(width * 0.22, height * 0.38, 'polygon');
  spawnEffect(width * 0.78, height * 0.64, 'ripple');
  startAnimation();
}());
