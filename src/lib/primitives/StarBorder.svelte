<script lang="ts">
  import { onMount } from 'svelte';

  export type StarBorderTheme = 'auto' | 'dark' | 'light';
  export type StarBorderHover = 'lap' | 'brighten' | 'reveal' | 'none';

  interface Props {
    active?: boolean;
    color?: string;
    trailColor?: string;
    duration?: number;
    thickness?: number;
    radius?: number;
    trailLength?: number;
    stars?: number;
    glow?: number;
    sparkle?: boolean;
    direction?: 'clockwise' | 'counterclockwise';
    hover?: StarBorderHover;
    clickPulse?: boolean;
    theme?: StarBorderTheme;
  }

  /**
   * Native Svelte 5 Canvas 2D StarBorder primitive ported from ReactBits StarBorder.
   * Attaches cleanly to its parent container's border without wrapping or shifting layout.
   */
  let {
    active = true,
    color,
    trailColor,
    duration = 5.5,
    thickness = 1.25,
    radius,
    trailLength = 0.28,
    stars = 2,
    glow = 0.55,
    sparkle = true,
    direction = 'clockwise',
    hover = 'lap',
    clickPulse = true,
    theme = 'auto',
  }: Props = $props();

  type Rgb = [number, number, number];
  type Segment = { length: number; x: number; y: number; dx: number; dy: number; angle: number | null };
  type Shape = { r: number; segments: Segment[]; total: number };
  type Point = { x: number; y: number; nx: number; ny: number };
  type Pulse = { origin: number; age: number };
  type Mote = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; seed: number };

  const BLEED = 48;
  const LAP = 0.9;
  const TAU = Math.PI * 2;
  const WHITE: Rgb = [255, 255, 255];

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const wrap = (value: number, total: number) => ((value % total) + total) % total;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (2 - 2 * t) ** 3 / 2);
  const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const rgba = (rgb: Rgb, alpha: number) =>
    `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${clamp(alpha, 0, 1).toFixed(3)})`;

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let wakeFn: (() => void) | null = null;

  $effect(() => {
    // Re-wake animation loop whenever reactive props (active, colors, speed, etc.) change.
    void active;
    void color;
    void trailColor;
    void duration;
    void thickness;
    void radius;
    void trailLength;
    void stars;
    void glow;
    void sparkle;
    void direction;
    void hover;
    void clickPulse;
    void theme;
    wakeFn?.();
  });

  onMount(() => {
    const canvas = canvasEl;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !host || !ctx) return;

    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduce = motionQuery?.matches ?? false;
    let isDark =
      theme === 'dark' || (theme === 'auto' && document.documentElement.classList.contains('dark'));

    let colorCtx: CanvasRenderingContext2D | null = null;
    const toRgb = (cssColor: string): Rgb => {
      colorCtx = colorCtx ?? document.createElement('canvas').getContext('2d');
      if (!colorCtx) return WHITE;
      colorCtx.fillStyle = '#000000';
      colorCtx.fillStyle = cssColor;
      const value = String(colorCtx.fillStyle);
      if (value.startsWith('#')) {
        const hex = parseInt(value.slice(1, 7), 16);
        return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
      }
      const parts = value.match(/[\d.]+/g)?.map(Number) ?? WHITE;
      return [parts[0] ?? 255, parts[1] ?? 255, parts[2] ?? 255];
    };

    const outline = (width: number, height: number, rInput: number): Shape => {
      const r = Math.max(0, Math.min(rInput, width / 2, height / 2));
      const arc = (Math.PI * r) / 2;
      const across = Math.max(0, width - 2 * r);
      const down = Math.max(0, height - 2 * r);
      const segments: Segment[] = [
        { length: across, x: r, y: 0, dx: 1, dy: 0, angle: null },
        { length: arc, x: width - r, y: r, dx: 0, dy: 0, angle: -Math.PI / 2 },
        { length: down, x: width, y: r, dx: 0, dy: 1, angle: null },
        { length: arc, x: width - r, y: height - r, dx: 0, dy: 0, angle: 0 },
        { length: across, x: width - r, y: height, dx: -1, dy: 0, angle: null },
        { length: arc, x: r, y: height - r, dx: 0, dy: 0, angle: Math.PI / 2 },
        { length: down, x: 0, y: height - r, dx: 0, dy: -1, angle: null },
        { length: arc, x: r, y: r, dx: 0, dy: 0, angle: Math.PI },
      ];
      return {
        r,
        segments,
        total: Math.max(
          1,
          segments.reduce((sum, segment) => sum + segment.length, 0)
        ),
      };
    };

    const pointAt = (shape: Shape, distance: number, point: Point) => {
      let s = wrap(distance, shape.total);
      for (const segment of shape.segments) {
        if (segment.length > 0 && s <= segment.length) {
          if (segment.angle === null) {
            point.x = segment.x + segment.dx * s;
            point.y = segment.y + segment.dy * s;
            point.nx = segment.dy;
            point.ny = -segment.dx;
          } else {
            const angle = segment.angle + s / shape.r;
            point.nx = Math.cos(angle);
            point.ny = Math.sin(angle);
            point.x = segment.x + point.nx * shape.r;
            point.y = segment.y + point.ny * shape.r;
          }
          return point;
        }
        s -= segment.length;
      }
      return point;
    };

    const project = (shape: Shape, px: number, py: number) => {
      let best = Infinity;
      let found = 0;
      let offset = 0;
      for (const segment of shape.segments) {
        if (segment.length > 0) {
          let s = 0;
          let x = 0;
          let y = 0;
          if (segment.angle === null) {
            s = clamp((px - segment.x) * segment.dx + (py - segment.y) * segment.dy, 0, segment.length);
            x = segment.x + segment.dx * s;
            y = segment.y + segment.dy * s;
          } else {
            let angle = wrap(Math.atan2(py - segment.y, px - segment.x) - segment.angle, TAU);
            if (angle > Math.PI / 2) angle = angle > Math.PI * 1.25 ? 0 : Math.PI / 2;
            s = angle * shape.r;
            x = segment.x + Math.cos(segment.angle + angle) * shape.r;
            y = segment.y + Math.sin(segment.angle + angle) * shape.r;
          }
          const dist = (px - x) ** 2 + (py - y) ** 2;
          if (dist < best) {
            best = dist;
            found = offset + s;
          }
        }
        offset += segment.length;
      }
      return found;
    };

    const point: Point = { x: 0, y: 0, nx: 0, ny: -1 };
    const state = {
      width: 0,
      height: 0,
      computedRadius: 16,
      dpr: 1,
      phase: 0,
      velocity: 0,
      motion: 0,
      lap: -1,
      time: 0,
      reveal: 0,
      boost: 0,
      flash: 0,
      emit: 0,
      hovered: false,
      focused: false,
      pointerX: 0,
      pointerY: 0,
      visible: true,
      tabVisible: document.visibilityState !== 'hidden',
    };
    const pulses: Pulse[] = [];
    const dust: Mote[] = [];
    const colors = { key: '', head: WHITE, tail: WHITE };

    let raf = 0;
    let last = performance.now();
    let alive = true;
    let resizePending = false;

    const getSettings = () => {
      const lightMode = theme === 'light' || (theme === 'auto' && !isDark);
      const defaultHead = lightMode ? '#18181b' : '#fafafa';
      const defaultTail = lightMode ? '#52525b' : '#a1a1aa';
      const head = color ?? defaultHead;
      return {
        active,
        light: lightMode,
        color: head,
        trailColor: trailColor ?? (color ? color : defaultTail),
        duration: Math.max(0.3, duration),
        thickness: Math.max(0.5, thickness),
        radius: Math.max(0, radius ?? state.computedRadius),
        trailLength: clamp(trailLength, 0, 1),
        stars: clamp(Math.round(stars), 1, 6),
        glow: clamp(glow, 0, 1),
        sparkle,
        direction: direction === 'counterclockwise' ? -1 : 1,
        hover,
        clickPulse,
      };
    };

    const applyMeasure = () => {
      state.width = host.offsetWidth;
      state.height = host.offsetHeight;
      const parsedRadius = parseFloat(getComputedStyle(host).borderTopLeftRadius || '16');
      state.computedRadius = Number.isFinite(parsedRadius) ? parsedRadius : 16;
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round((state.width + BLEED * 2) * state.dpr));
      canvas.height = Math.max(1, Math.round((state.height + BLEED * 2) * state.dpr));
    };

    const measure = () => {
      resizePending = true;
      wake();
    };

    const local = (event: MouseEvent): [number, number] => {
      const rect = host.getBoundingClientRect();
      const scaleX = rect.width ? state.width / rect.width : 1;
      const scaleY = rect.height ? state.height / rect.height : 1;
      return [(event.clientX - rect.left) * scaleX, (event.clientY - rect.top) * scaleY];
    };

    const shapeFor = (s: ReturnType<typeof getSettings>) =>
      outline(
        Math.max(1, state.width - s.thickness),
        Math.max(1, state.height - s.thickness),
        Math.max(0, s.radius - s.thickness / 2)
      );

    const stroke = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      width: number,
      style: string | CanvasGradient
    ) => {
      ctx.lineWidth = width;
      ctx.strokeStyle = style;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    const drawTrail = (
      s: ReturnType<typeof getSettings>,
      shape: Shape,
      head: number,
      length: number,
      sign: number,
      intensity: number,
      tip = true
    ) => {
      if (length < 0.5 || intensity <= 0) return;
      const steps = clamp(Math.ceil(length / 2), 2, 90);
      pointAt(shape, head, point);
      let px = point.x;
      let py = point.y;
      for (let i = 1; i <= steps; i++) {
        pointAt(shape, head - sign * length * (i / steps), point);
        const u = 1 - (i - 0.5) / steps;
        const fade = u * u * intensity;
        let tone = mix(colors.tail, colors.head, u);
        if (!s.light) tone = mix(tone, WHITE, u ** 6 * 0.65);
        ctx.lineCap = tip && i === 1 ? 'round' : 'butt';
        stroke(px, py, point.x, point.y, 2 + 6 * s.glow, rgba(tone, fade * (s.light ? 0.1 : 0.2) * s.glow));
        stroke(px, py, point.x, point.y, s.thickness, rgba(tone, fade));
        px = point.x;
        py = point.y;
      }
    };

    const drawHead = (
      s: ReturnType<typeof getSettings>,
      x: number,
      y: number,
      intensity: number,
      twinkle: number
    ) => {
      if (intensity <= 0) return;
      const tone = colors.head;
      const reach = (12 + 40 * s.glow) * (s.light ? 0.6 : 1);
      const bloom = ctx.createRadialGradient(x, y, 0, x, y, reach);
      const strength = (s.light ? 0.08 : 0.4) * s.glow * intensity;
      bloom.addColorStop(0, rgba(tone, strength));
      bloom.addColorStop(0.2, rgba(tone, strength * 0.4));
      bloom.addColorStop(0.5, rgba(tone, strength * 0.1));
      bloom.addColorStop(1, rgba(tone, 0));
      ctx.fillStyle = bloom;
      ctx.fillRect(x - reach, y - reach, reach * 2, reach * 2);
      if (!s.sparkle) return;

      const size = (1 + s.thickness * 0.6) * (s.light ? 0.85 : 1);
      const core = ctx.createRadialGradient(x, y, 0, x, y, size * 2.2);
      core.addColorStop(0, rgba(s.light ? tone : WHITE, intensity));
      core.addColorStop(s.light ? 0.3 : 0.4, rgba(s.light ? tone : mix(tone, WHITE, 0.5), intensity * 0.9));
      core.addColorStop(s.light ? 0.55 : 1, rgba(tone, s.light ? intensity * 0.12 : 0));
      core.addColorStop(1, rgba(tone, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, size * 2.2, 0, TAU);
      ctx.fill();

      const spike = (3 + 4 * s.glow + s.thickness * 1.5) * twinkle;
      const center = s.light ? tone : WHITE;
      const horizontal = ctx.createLinearGradient(x - spike, y, x + spike, y);
      horizontal.addColorStop(0, rgba(tone, 0));
      horizontal.addColorStop(0.5, rgba(center, intensity * 0.95));
      horizontal.addColorStop(1, rgba(tone, 0));
      stroke(x - spike, y, x + spike, y, s.light ? 0.75 : 1, horizontal);
      const vertical = ctx.createLinearGradient(x, y - spike, x, y + spike);
      vertical.addColorStop(0, rgba(tone, 0));
      vertical.addColorStop(0.5, rgba(center, intensity * 0.95));
      vertical.addColorStop(1, rgba(tone, 0));
      stroke(x, y - spike, x, y + spike, s.light ? 0.75 : 1, vertical);
    };

    const spawnDust = (x: number, y: number, nx: number, ny: number, speed: number) => {
      if (dust.length > 48) return;
      const push = 3 + Math.random() * 10;
      const drift = (Math.random() - 0.5) * 8;
      dust.push({
        x: x + nx * (Math.random() * 3 - 1),
        y: y + ny * (Math.random() * 3 - 1),
        vx: nx * push - ny * drift - speed * -ny * 0.04,
        vy: ny * push + nx * drift - speed * nx * 0.04,
        age: 0,
        life: 0.35 + Math.random() * 0.5,
        size: 0.45 + Math.random() * 0.7,
        seed: Math.random() * TAU,
      });
    };

    const clearCanvas = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const draw = (base: ReturnType<typeof getSettings>, shape: Shape) => {
      const s = state.boost > 0.001 ? { ...base, glow: Math.min(1.5, base.glow + 0.4 * state.boost) } : base;
      clearCanvas();
      if (state.width < 2 || state.height < 2 || state.reveal <= 0.002) return;
      const offset = (BLEED + s.thickness / 2) * state.dpr;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, offset, offset);
      ctx.globalCompositeOperation = s.light ? 'source-over' : 'lighter';
      ctx.lineCap = 'butt';

      const total = shape.total;
      const spacing = total / s.stars;
      const speed = Math.abs(state.motion);
      const sign = state.motion >= 0 ? 1 : -1;
      const span = s.trailLength * s.duration;
      const length = Math.min(speed * span, spacing * 0.92, total * 0.6);
      const intensity = state.reveal * (1 + 0.4 * state.boost + 0.6 * state.flash);

      const ring = state.flash * (s.light ? 0.18 : 0.32) + state.boost * state.reveal * (s.light ? 0.07 : 0.12);
      if (ring > 0.005) {
        ctx.lineWidth = s.thickness + 2 * s.glow;
        ctx.strokeStyle = rgba(colors.head, ring);
        ctx.beginPath();
        ctx.roundRect(
          0,
          0,
          Math.max(1, state.width - s.thickness),
          Math.max(1, state.height - s.thickness),
          Math.max(0, shape.r)
        );
        ctx.stroke();
      }

      const still = clamp(1 - speed / Math.max(1, (total / s.duration) * 0.6), 0, 1) * Math.min(1, intensity);
      const rest = (10 + 14 * s.glow + s.thickness * 2) * still;
      for (let i = 0; i < s.stars; i++) {
        const head = state.phase + i * spacing;
        drawTrail(s, shape, head, length, sign, Math.min(1, intensity));
        if (still > 0.01) {
          drawTrail(s, shape, head, rest, 1, still, false);
          drawTrail(s, shape, head, rest, -1, still, false);
        }
      }

      for (const p of pulses) {
        const progress = p.age / 0.65;
        const fade = (1 - progress) ** 2;
        const travel = (total / 2) * (1 - (1 - Math.min(1, p.age / 0.5)) ** 2);
        const tail = Math.min(travel, total * 0.16);
        for (const way of [1, -1]) {
          const front = p.origin + way * travel;
          drawTrail(s, shape, front, tail, way, fade);
          pointAt(shape, front, point);
          drawHead(s, point.x, point.y, fade * 0.8, 0.8);
        }
      }

      for (let i = 0; i < s.stars; i++) {
        pointAt(shape, state.phase + i * spacing, point);
        const twinkle = 0.82 + 0.18 * Math.sin(state.time * 6.1 + i * 2.3) * Math.sin(state.time * 2.7 + i);
        drawHead(s, point.x, point.y, Math.min(1.3, intensity), twinkle);
      }

      for (const mote of dust) {
        const left = 1 - mote.age / mote.life;
        const shimmer = 0.45 + 0.55 * Math.sin(state.time * 20 + mote.seed);
        const alpha = left * shimmer * state.reveal * (s.light ? 0.35 : 0.9);
        if (alpha <= 0.01) continue;
        ctx.fillStyle = rgba(s.light ? colors.head : mix(colors.tail, WHITE, 0.6), alpha);
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, mote.size * (0.6 + 0.4 * left), 0, TAU);
        ctx.fill();
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (resizePending) {
        resizePending = false;
        applyMeasure();
      }
      if (!alive) return;

      const s = getSettings();
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      state.time += dt;

      const key = `${s.color}|${s.trailColor}`;
      if (key !== colors.key) {
        colors.key = key;
        colors.head = toRgb(s.color);
        colors.tail = toRgb(s.trailColor);
      }

      const shape = shapeFor(s);
      const total = shape.total;
      const spacing = total / s.stars;
      const engaged = state.hovered || state.focused;
      const cruise = reduce ? 0 : (s.direction * total) / s.duration;

      const revealTarget = !s.active || (s.hover === 'reveal' && !engaged) ? 0 : 1;
      state.reveal +=
        (revealTarget - state.reveal) * (1 - Math.exp(-dt / (revealTarget > state.reveal ? 0.16 : 0.45)));
      const boostTarget = s.active && s.hover === 'brighten' && engaged ? 1 : 0;
      state.boost +=
        (boostTarget - state.boost) * (1 - Math.exp(-dt / (boostTarget > state.boost ? 0.18 : 0.5)));
      state.flash *= Math.exp(-dt / 0.22);

      state.velocity += (cruise - state.velocity) * (1 - Math.exp(-dt / 0.45));
      let extra = 0;
      if (state.lap >= 0) {
        const before = ease(Math.min(1, state.lap / LAP));
        state.lap += dt;
        extra = (ease(Math.min(1, state.lap / LAP)) - before) * total * s.direction;
        if (state.lap >= LAP) state.lap = -1;
      }
      state.motion = state.velocity + extra / dt;
      state.phase = wrap(state.phase + state.velocity * dt + extra, total);

      const pace = Math.abs(state.motion) / Math.max(1, Math.abs(total / s.duration));
      if (s.sparkle && s.active && !reduce && state.reveal > 0.05) {
        state.emit += dt * (2 + 6 * Math.min(2, pace)) * s.stars;
        while (state.emit > 1) {
          state.emit -= 1;
          pointAt(shape, state.phase + Math.floor(Math.random() * s.stars) * spacing, point);
          spawnDust(point.x, point.y, point.nx, point.ny, state.motion);
        }
      }

      for (let i = dust.length - 1; i >= 0; i--) {
        const mote = dust[i];
        mote.age += dt;
        mote.x += mote.vx * dt;
        mote.y += mote.vy * dt;
        mote.vx *= Math.exp(-dt * 2.2);
        mote.vy *= Math.exp(-dt * 2.2);
        if (mote.age >= mote.life) dust.splice(i, 1);
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].age += dt;
        if (pulses[i].age >= 0.65) pulses.splice(i, 1);
      }

      draw(s, shape);

      const settling =
        Math.abs(revealTarget - state.reveal) > 0.002 ||
        Math.abs(boostTarget - state.boost) > 0.002 ||
        state.flash > 0.01 ||
        pulses.length > 0 ||
        dust.length > 0;
      const moving = Math.abs(state.motion) > 0.05 || cruise !== 0 || state.lap >= 0;
      const showing = state.reveal > 0.002 || revealTarget > 0;

      if (state.visible && state.tabVisible && (settling || (moving && showing) || (state.hovered && s.active))) {
        raf = requestAnimationFrame(frame);
      }
    };

    const wake = () => {
      if (raf || !alive || !state.visible || !state.tabVisible) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    wakeFn = wake;

    const onEnter = (event: PointerEvent) => {
      const s = getSettings();
      if (!s.active) return;
      [state.pointerX, state.pointerY] = local(event);
      state.hovered = true;
      if (s.hover === 'reveal' && state.reveal < 0.15) {
        state.phase = project(shapeFor(s), state.pointerX - s.thickness / 2, state.pointerY - s.thickness / 2);
        state.velocity = 0;
      }
      if (s.hover === 'lap' && state.lap < 0 && !reduce) state.lap = 0;
      wake();
    };

    const onLeave = () => {
      state.hovered = false;
      wake();
    };

    const pulse = (origin: number) => {
      const s = getSettings();
      if (!s.clickPulse || !s.active) return;
      pulses.push({ origin, age: 0 });
      if (pulses.length > 4) pulses.shift();
      state.flash = 1;
      wake();
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      const s = getSettings();
      if (!s.active) return;
      const [x, y] = local(event);
      pulse(project(shapeFor(s), x - s.thickness / 2, y - s.thickness / 2));
    };

    const onFocus = () => {
      state.focused = host.matches(':focus-visible');
      if (state.focused && getSettings().hover === 'lap' && state.lap < 0 && !reduce) state.lap = 0;
      wake();
    };

    const onBlur = () => {
      state.focused = false;
      wake();
    };

    const onMotionChange = (e: MediaQueryListEvent) => {
      reduce = e.matches;
      wake();
    };

    const onVisibilityChange = () => {
      state.tabVisible = document.visibilityState !== 'hidden';
      if (state.tabVisible) wake();
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(host);

    const visibility = new IntersectionObserver((entries) => {
      state.visible = entries.some((entry) => entry.isIntersecting);
      if (state.visible) wake();
    });
    visibility.observe(host);

    const themeObserver = new MutationObserver(() => {
      const nextDark =
        theme === 'dark' || (theme === 'auto' && document.documentElement.classList.contains('dark'));
      if (nextDark !== isDark) {
        isDark = nextDark;
        colors.key = '';
        wake();
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    host.addEventListener('pointerenter', onEnter);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('focus', onFocus);
    host.addEventListener('blur', onBlur);
    motionQuery?.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', onVisibilityChange);

    measure();

    return () => {
      alive = false;
      wakeFn = null;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      visibility.disconnect();
      themeObserver.disconnect();
      host.removeEventListener('pointerenter', onEnter);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('focus', onFocus);
      host.removeEventListener('blur', onBlur);
      motionQuery?.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  });
</script>

<canvas
  bind:this={canvasEl}
  aria-hidden="true"
  class="pointer-events-none absolute -top-12 -left-12 z-20 h-[calc(100%+96px)] w-[calc(100%+96px)]"
></canvas>
