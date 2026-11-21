import React from 'react';
import { DayCyclePeriod, getDayCyclePeriod } from '../../lib/alpineDayCycle';

interface AlpineDayCycleBackdropProps {
  className?: string;
  forcePeriod?: DayCyclePeriod;
  compact?: boolean;
  sceneSrc?: string;
}

type RGB = [number, number, number];

interface PeriodPalette {
  skyTop: RGB;
  skyUpper: RGB;
  skyLower: RGB;
  skyHorizon: RGB;
  celestialX: number;
  celestialY: number;
  celestialRadius: number;
  celestialAlpha: number;
  celestialCore: RGB;
  celestialHalo: RGB;
  hillFar: RGB;
  hillNear: RGB;
  mistColor: RGB;
  mistAlpha: number;
  waterTop: RGB;
  waterMid: RGB;
  waterBot: RGB;
  starAlpha: number;
  shootingStarAllowed: number;
  cloudAlpha: number;
  birdAlpha: number;
  moteAlpha: number;
  glintAlpha: number;
  fireflyAlpha: number;
  fireflyColor: RGB;
}

const HORIZON_RATIO = 0.62;

const PERIODS: Record<DayCyclePeriod, PeriodPalette> = {
  // madrugada
  predawn: {
    skyTop: [8, 13, 28],
    skyUpper: [18, 26, 52],
    skyLower: [56, 48, 86],
    skyHorizon: [148, 108, 118],
    celestialX: 0.72,
    celestialY: 0.56,
    celestialRadius: 15,
    celestialAlpha: 0.55,
    celestialCore: [248, 212, 198],
    celestialHalo: [184, 128, 152],
    hillFar: [38, 39, 68],
    hillNear: [21, 26, 48],
    mistColor: [164, 146, 178],
    mistAlpha: 0.25,
    waterTop: [82, 70, 98],
    waterMid: [28, 34, 62],
    waterBot: [10, 15, 30],
    starAlpha: 0.42,
    shootingStarAllowed: 0.0,
    cloudAlpha: 0.06,
    birdAlpha: 0.0,
    moteAlpha: 0.14,
    glintAlpha: 0.08,
    fireflyAlpha: 0.06,
    fireflyColor: [214, 206, 255],
  },
  // manana
  morning: {
    skyTop: [44, 98, 158],
    skyUpper: [88, 144, 194],
    skyLower: [176, 190, 202],
    skyHorizon: [244, 198, 148],
    celestialX: 0.74,
    celestialY: 0.44,
    celestialRadius: 20,
    celestialAlpha: 0.96,
    celestialCore: [255, 248, 230],
    celestialHalo: [255, 206, 138],
    hillFar: [122, 140, 166],
    hillNear: [74, 96, 126],
    mistColor: [250, 224, 192],
    mistAlpha: 0.24,
    waterTop: [196, 168, 146],
    waterMid: [88, 118, 154],
    waterBot: [36, 62, 96],
    starAlpha: 0.0,
    shootingStarAllowed: 0.0,
    cloudAlpha: 0.22,
    birdAlpha: 1.0,
    moteAlpha: 0.78,
    glintAlpha: 0.42,
    fireflyAlpha: 0.0,
    fireflyColor: [255, 232, 168],
  },
  // dia
  day: {
    skyTop: [34, 92, 164],
    skyUpper: [72, 136, 204],
    skyLower: [148, 192, 228],
    skyHorizon: [232, 238, 242],
    celestialX: 0.56,
    celestialY: 0.22,
    celestialRadius: 18,
    celestialAlpha: 0.92,
    celestialCore: [255, 253, 246],
    celestialHalo: [212, 234, 255],
    hillFar: [116, 152, 188],
    hillNear: [70, 108, 146],
    mistColor: [232, 242, 250],
    mistAlpha: 0.16,
    waterTop: [146, 186, 218],
    waterMid: [72, 122, 174],
    waterBot: [32, 68, 112],
    starAlpha: 0.0,
    shootingStarAllowed: 0.0,
    cloudAlpha: 0.44,
    birdAlpha: 0.0,
    moteAlpha: 0.12,
    glintAlpha: 0.85,
    fireflyAlpha: 0.0,
    fireflyColor: [255, 244, 200],
  },
  // atardecer
  sunset: {
    skyTop: [28, 30, 74],
    skyUpper: [79, 70, 178],
    skyLower: [164, 92, 126],
    skyHorizon: [242, 146, 102],
    celestialX: 0.68,
    celestialY: 0.54,
    celestialRadius: 22,
    celestialAlpha: 0.96,
    celestialCore: [255, 234, 198],
    celestialHalo: [248, 142, 92],
    hillFar: [92, 64, 106],
    hillNear: [44, 34, 68],
    mistColor: [244, 162, 122],
    mistAlpha: 0.22,
    waterTop: [192, 114, 102],
    waterMid: [72, 52, 94],
    waterBot: [24, 24, 52],
    starAlpha: 0.16,
    shootingStarAllowed: 0.0,
    cloudAlpha: 0.18,
    birdAlpha: 0.0,
    moteAlpha: 0.16,
    glintAlpha: 0.28,
    fireflyAlpha: 0.95,
    fireflyColor: [255, 214, 126],
  },
  // noche
  night: {
    skyTop: [8, 14, 28],
    skyUpper: [16, 27, 48],
    skyLower: [28, 42, 78],
    skyHorizon: [44, 58, 102],
    celestialX: 0.74,
    celestialY: 0.27,
    celestialRadius: 14,
    celestialAlpha: 0.96,
    celestialCore: [238, 243, 255],
    celestialHalo: [118, 134, 224],
    hillFar: [24, 36, 64],
    hillNear: [14, 22, 42],
    mistColor: [98, 118, 178],
    mistAlpha: 0.15,
    waterTop: [34, 48, 86],
    waterMid: [18, 29, 54],
    waterBot: [9, 15, 30],
    starAlpha: 0.98,
    shootingStarAllowed: 1.0,
    cloudAlpha: 0.03,
    birdAlpha: 0.0,
    moteAlpha: 0.0,
    glintAlpha: 0.16,
    fireflyAlpha: 0.42,
    fireflyColor: [224, 232, 255],
  },
};

function clonePeriod(p: PeriodPalette): PeriodPalette {
  return {
    skyTop: [...p.skyTop],
    skyUpper: [...p.skyUpper],
    skyLower: [...p.skyLower],
    skyHorizon: [...p.skyHorizon],
    celestialX: p.celestialX,
    celestialY: p.celestialY,
    celestialRadius: p.celestialRadius,
    celestialAlpha: p.celestialAlpha,
    celestialCore: [...p.celestialCore],
    celestialHalo: [...p.celestialHalo],
    hillFar: [...p.hillFar],
    hillNear: [...p.hillNear],
    mistColor: [...p.mistColor],
    mistAlpha: p.mistAlpha,
    waterTop: [...p.waterTop],
    waterMid: [...p.waterMid],
    waterBot: [...p.waterBot],
    starAlpha: p.starAlpha,
    shootingStarAllowed: p.shootingStarAllowed,
    cloudAlpha: p.cloudAlpha,
    birdAlpha: p.birdAlpha,
    moteAlpha: p.moteAlpha,
    glintAlpha: p.glintAlpha,
    fireflyAlpha: p.fireflyAlpha,
    fireflyColor: [...p.fireflyColor],
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpRgb(c: RGB, target: RGB, t: number) {
  c[0] += (target[0] - c[0]) * t;
  c[1] += (target[1] - c[1]) * t;
  c[2] += (target[2] - c[2]) * t;
}

function rgba(c: RGB, a = 1): string {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

function buildFallbackGradient(p: PeriodPalette): string {
  return `linear-gradient(180deg, ${rgba(p.skyTop)} 0%, ${rgba(p.skyUpper)} 24%, ${rgba(p.skyLower)} 47%, ${rgba(p.skyHorizon)} 62%, ${rgba(p.waterTop)} 63%, ${rgba(p.waterMid)} 80%, ${rgba(p.waterBot)} 100%)`;
}

interface StarEntity {
  x: number;
  y: number;
  r: number;
  base: number;
  phase: number;
  speed: number;
  tint: RGB;
  fadeThreshold: number;
}

interface CloudEntity {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  alpha: number;
}

interface FireflyEntity {
  x: number;
  y: number;
  r: number;
  phase: number;
  vx: number;
  driftY: number;
  pulseSpeed: number;
}

interface LightMoteEntity {
  x: number;
  y: number;
  r: number;
  phase: number;
  vx: number;
  vy: number;
  alpha: number;
}

interface WaterGlintEntity {
  x: number;
  depth: number;
  w: number;
  phase: number;
  speed: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  start: number;
  duration: number;
}

interface BirdMember {
  ox: number;
  oy: number;
  scale: number;
  phase: number;
}

interface BirdFlock {
  x: number;
  y: number;
  vx: number;
  start: number;
  birds: BirdMember[];
}

export const AlpineDayCycleBackdrop: React.FC<AlpineDayCycleBackdropProps> = ({
  className = '',
  forcePeriod,
  compact = false,
}) => {
  const period = forcePeriod || getDayCyclePeriod();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const sceneCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const grainCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const targetPeriodRef = React.useRef<DayCyclePeriod>(period);
  const onPeriodChangeRef = React.useRef<((next: DayCyclePeriod) => void) | null>(null);

  React.useEffect(() => {
    targetPeriodRef.current = period;
    onPeriodChangeRef.current?.(period);
  }, [period]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const container = containerRef.current;
    const sceneCanvas = sceneCanvasRef.current;
    const grainCanvas = grainCanvasRef.current;
    if (!container || !sceneCanvas || !grainCanvas) return undefined;

    let ctx: CanvasRenderingContext2D | null = null;
    let grainCtx: CanvasRenderingContext2D | null = null;
    try {
      ctx = sceneCanvas.getContext('2d', { alpha: false });
      grainCtx = grainCanvas.getContext('2d');
    } catch {
      return undefined;
    }
    if (!ctx) return undefined;

    const reducedMotionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let prefersReducedMotion = Boolean(reducedMotionQuery?.matches);

    let current = clonePeriod(PERIODS[targetPeriodRef.current]);
    let cw = 800;
    let ch = 230;
    let dpr = 1;

    const stars: StarEntity[] = [];
    const clouds: CloudEntity[] = [];
    const fireflies: FireflyEntity[] = [];
    const lightMotes: LightMoteEntity[] = [];
    const waterGlints: WaterGlintEntity[] = [];

    let shootingStar: ShootingStar | null = null;
    let nextShootingStarAt = 2400;

    let birdFlock: BirdFlock | null = null;
    let nextBirdFlockAt = 1600;

    const initEntities = () => {
      const horizonY = ch * HORIZON_RATIO;

      stars.length = 0;
      const starCount = Math.max(58, Math.floor((cw * horizonY) / 1650));
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * cw,
          y: Math.random() * (horizonY * 0.88),
          r: Math.random() * 1.05 + 0.3,
          base: Math.random() * 0.62 + 0.22,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.0017 + 0.0005,
          tint: Math.random() > 0.72 ? [198, 218, 255] : [244, 247, 255],
          fadeThreshold: Math.random() * 0.65,
        });
      }

      clouds.length = 0;
      for (let i = 0; i < 6; i++) {
        clouds.push({
          x: Math.random() * cw,
          y: horizonY * (0.20 + Math.random() * 0.48),
          w: 120 + Math.random() * 170,
          h: 12 + Math.random() * 15,
          speed: 0.0055 + Math.random() * 0.0085,
          alpha: 0.24 + Math.random() * 0.34,
        });
      }

      fireflies.length = 0;
      const fireflyCount = Math.max(15, Math.floor(cw / 48));
      for (let i = 0; i < fireflyCount; i++) {
        fireflies.push({
          x: Math.random() * cw,
          y: horizonY - 12 + Math.random() * (ch - horizonY + 4),
          r: 1.0 + Math.random() * 1.25,
          phase: Math.random() * Math.PI * 2,
          vx: (Math.random() - 0.5) * 0.011,
          driftY: 3.5 + Math.random() * 6.5,
          pulseSpeed: 0.0014 + Math.random() * 0.0018,
        });
      }

      lightMotes.length = 0;
      const moteCount = Math.max(20, Math.floor(cw / 36));
      for (let i = 0; i < moteCount; i++) {
        lightMotes.push({
          x: Math.random() * cw,
          y: ch * (0.18 + Math.random() * 0.68),
          r: 0.8 + Math.random() * 1.15,
          phase: Math.random() * Math.PI * 2,
          vx: 0.004 + Math.random() * 0.007,
          vy: -0.002 - Math.random() * 0.005,
          alpha: 0.18 + Math.random() * 0.32,
        });
      }

      waterGlints.length = 0;
      const glintCount = Math.max(22, Math.floor(cw / 32));
      for (let i = 0; i < glintCount; i++) {
        const depth = Math.random();
        waterGlints.push({
          x: Math.random() * cw,
          depth,
          w: 6 + depth * 18,
          phase: Math.random() * Math.PI * 2,
          speed: 0.0016 + Math.random() * 0.0024,
        });
      }
    };

    const drawFilmGrain = () => {
      if (!grainCtx) return;
      const gw = Math.max(1, Math.floor(cw / 1.5));
      const gh = Math.max(1, Math.floor(ch / 1.5));
      grainCanvas.width = gw;
      grainCanvas.height = gh;
      const img = grainCtx.createImageData(gw, gh);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      grainCtx.putImageData(img, 0, 0);
    };

    const drawSky = (horizonY: number) => {
      const g = ctx!.createLinearGradient(0, 0, 0, horizonY + 2);
      g.addColorStop(0, rgba(current.skyTop, 1));
      g.addColorStop(0.38, rgba(current.skyUpper, 1));
      g.addColorStop(0.76, rgba(current.skyLower, 1));
      g.addColorStop(1, rgba(current.skyHorizon, 1));
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, cw, horizonY + 2);
    };

    const drawStarsAndMeteor = (t: number, horizonY: number) => {
      if (current.starAlpha <= 0.01) return;

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const visibility = Math.max(0, Math.min(1, (current.starAlpha - s.fadeThreshold * (1 - current.starAlpha)) * 1.35));
        if (visibility <= 0.01) continue;

        const twinkle = prefersReducedMotion
          ? 0.85
          : 0.68 + 0.32 * Math.sin(t * s.speed + s.phase);
        const alpha = s.base * twinkle * visibility * current.starAlpha;

        ctx!.fillStyle = rgba(s.tint, alpha);
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (!prefersReducedMotion && current.shootingStarAllowed > 0.5) {
        if (!shootingStar && t >= nextShootingStarAt) {
          const goingLeft = Math.random() > 0.35;
          shootingStar = {
            x: goingLeft ? cw * (0.48 + Math.random() * 0.42) : cw * (0.12 + Math.random() * 0.38),
            y: horizonY * (0.10 + Math.random() * 0.28),
            vx: (goingLeft ? -1 : 1) * (0.24 + Math.random() * 0.11),
            vy: 0.065 + Math.random() * 0.045,
            start: t,
            duration: 980,
          };
          nextShootingStarAt = t + 8000 + Math.random() * 4000;
        }

        if (shootingStar) {
          const elapsed = t - shootingStar.start;
          const p = elapsed / shootingStar.duration;
          if (p >= 1) {
            shootingStar = null;
          } else {
            const fade = Math.sin(p * Math.PI) * current.shootingStarAllowed;
            const headX = shootingStar.x + shootingStar.vx * elapsed;
            const headY = shootingStar.y + shootingStar.vy * elapsed;
            const tailX = headX - shootingStar.vx * 145;
            const tailY = headY - shootingStar.vy * 145;

            const grad = ctx!.createLinearGradient(headX, headY, tailX, tailY);
            grad.addColorStop(0, `rgba(248, 250, 255, ${(fade * 0.92).toFixed(3)})`);
            grad.addColorStop(0.3, `rgba(199, 210, 254, ${(fade * 0.48).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(199, 210, 254, 0)');

            ctx!.strokeStyle = grad;
            ctx!.lineWidth = 1.35;
            ctx!.lineCap = 'round';
            ctx!.beginPath();
            ctx!.moveTo(headX, headY);
            ctx!.lineTo(tailX, tailY);
            ctx!.stroke();

            ctx!.fillStyle = `rgba(255, 255, 255, ${(fade * 0.95).toFixed(3)})`;
            ctx!.beginPath();
            ctx!.arc(headX, headY, 1.35, 0, Math.PI * 2);
            ctx!.fill();
          }
        }
      }
    };

    const drawCelestial = (horizonY: number) => {
      const cx = cw * current.celestialX;
      const cy = Math.min(horizonY - 2, ch * current.celestialY);
      const r = current.celestialRadius;
      const alpha = current.celestialAlpha;

      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(0, 0, cw, horizonY + 1);
      ctx!.clip();

      const outerR = r * 7.2;
      const outerGrad = ctx!.createRadialGradient(cx, cy, r * 0.25, cx, cy, outerR);
      outerGrad.addColorStop(0, rgba(current.celestialHalo, 0.40 * alpha));
      outerGrad.addColorStop(0.36, rgba(current.celestialHalo, 0.14 * alpha));
      outerGrad.addColorStop(1, rgba(current.celestialHalo, 0));
      ctx!.fillStyle = outerGrad;
      ctx!.beginPath();
      ctx!.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx!.fill();

      const innerR = r * 2.3;
      const innerGrad = ctx!.createRadialGradient(cx, cy, r * 0.2, cx, cy, innerR);
      innerGrad.addColorStop(0, rgba(current.celestialCore, 0.85 * alpha));
      innerGrad.addColorStop(0.55, rgba(current.celestialHalo, 0.24 * alpha));
      innerGrad.addColorStop(1, rgba(current.celestialHalo, 0));
      ctx!.fillStyle = innerGrad;
      ctx!.beginPath();
      ctx!.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.fillStyle = rgba(current.celestialCore, 0.95 * alpha);
      ctx!.beginPath();
      ctx!.arc(cx, cy, r, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.restore();
    };

    const drawClouds = (t: number) => {
      if (current.cloudAlpha <= 0.01) return;

      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        const x = prefersReducedMotion
          ? c.x
          : ((c.x + t * c.speed) % (cw + c.w * 2)) - c.w;

        const grad = ctx!.createRadialGradient(x, c.y, c.h * 0.15, x, c.y, c.w * 0.65);
        const a = c.alpha * current.cloudAlpha;
        grad.addColorStop(0, `rgba(255, 252, 248, ${a.toFixed(3)})`);
        grad.addColorStop(0.55, `rgba(255, 250, 246, ${(a * 0.34).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255, 250, 246, 0)');

        ctx!.save();
        ctx!.translate(x, c.y);
        ctx!.scale(1, c.h / (c.w * 0.55));
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(0, 0, c.w * 0.65, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }
    };

    const drawDistantBirds = (t: number, horizonY: number) => {
      if (current.birdAlpha <= 0.05) return;

      if (!prefersReducedMotion) {
        if (!birdFlock && t >= nextBirdFlockAt) {
          const fromLeft = Math.random() > 0.35;
          const count = 2 + Math.floor(Math.random() * 2);
          const baseY = horizonY * (0.34 + Math.random() * 0.24);
          const birds: BirdMember[] = [];
          for (let i = 0; i < count; i++) {
            birds.push({
              ox: (fromLeft ? -1 : 1) * (i * (13 + Math.random() * 7)),
              oy: (i % 2 === 0 ? -1 : 1) * (3 + i * 2.5),
              scale: 0.78 + Math.random() * 0.28,
              phase: Math.random() * Math.PI * 2,
            });
          }
          birdFlock = {
            x: fromLeft ? -30 : cw + 30,
            y: baseY,
            vx: (fromLeft ? 1 : -1) * (0.018 + Math.random() * 0.008),
            start: t,
            birds,
          };
          nextBirdFlockAt = t + 13000 + Math.random() * 6000;
        }
      } else if (!birdFlock) {
        birdFlock = {
          x: cw * 0.36,
          y: horizonY * 0.44,
          vx: 0,
          start: 0,
          birds: [
            { ox: 0, oy: 0, scale: 0.95, phase: 0.4 },
            { ox: -16, oy: 6, scale: 0.82, phase: 1.8 },
            { ox: -30, oy: -4, scale: 0.74, phase: 3.1 },
          ],
        };
      }

      if (!birdFlock) return;

      const elapsed = prefersReducedMotion ? 0 : t - birdFlock.start;
      const bx = birdFlock.x + birdFlock.vx * elapsed;

      if (!prefersReducedMotion && (bx < -70 || bx > cw + 70)) {
        birdFlock = null;
        return;
      }

      ctx!.save();
      ctx!.strokeStyle = rgba(current.hillNear, 0.52 * current.birdAlpha);
      ctx!.lineWidth = 1.15;
      ctx!.lineCap = 'round';

      for (let i = 0; i < birdFlock.birds.length; i++) {
        const b = birdFlock.birds[i];
        const x = bx + b.ox;
        const y = birdFlock.y + b.oy + (prefersReducedMotion ? 0 : Math.sin(t * 0.0014 + b.phase) * 2.2);
        const wingSpan = 4.6 * b.scale;
        const flap = prefersReducedMotion
          ? 1.2
          : Math.sin(t * 0.0052 + b.phase) * 2.1;

        ctx!.beginPath();
        ctx!.moveTo(x - wingSpan, y - flap);
        ctx!.quadraticCurveTo(x - wingSpan * 0.45, y - 1.8 - flap * 0.35, x, y);
        ctx!.quadraticCurveTo(x + wingSpan * 0.45, y - 1.8 - flap * 0.35, x + wingSpan, y - flap);
        ctx!.stroke();
      }
      ctx!.restore();
    };

    const drawSoftHorizonHills = (horizonY: number) => {
      ctx!.beginPath();
      ctx!.moveTo(0, horizonY);
      const step = Math.max(4, Math.floor(cw / 90));
      for (let x = 0; x <= cw + step; x += step) {
        const nx = x / cw;
        const h =
          11 +
          Math.sin(nx * Math.PI * 1.9 + 0.6) * 8.5 +
          Math.sin(nx * Math.PI * 3.7 + 2.2) * 3.8 +
          Math.cos(nx * Math.PI * 5.2 - 1.1) * 1.6;
        ctx!.lineTo(x, horizonY - Math.max(1.5, h));
      }
      ctx!.lineTo(cw, horizonY);
      ctx!.closePath();

      const farGrad = ctx!.createLinearGradient(0, horizonY - 26, 0, horizonY);
      farGrad.addColorStop(0, rgba(current.hillFar, 0.48));
      farGrad.addColorStop(1, rgba(current.hillFar, 0.16));
      ctx!.fillStyle = farGrad;
      ctx!.fill();

      ctx!.beginPath();
      ctx!.moveTo(0, horizonY);
      for (let x = 0; x <= cw + step; x += step) {
        const nx = x / cw;
        const h =
          5.5 +
          Math.sin(nx * Math.PI * 2.3 + 2.8) * 5.2 +
          Math.cos(nx * Math.PI * 4.4 + 0.7) * 2.1;
        ctx!.lineTo(x, horizonY - Math.max(0.8, h));
      }
      ctx!.lineTo(cw, horizonY);
      ctx!.closePath();

      const nearGrad = ctx!.createLinearGradient(0, horizonY - 14, 0, horizonY);
      nearGrad.addColorStop(0, rgba(current.hillNear, 0.72));
      nearGrad.addColorStop(1, rgba(current.hillNear, 0.46));
      ctx!.fillStyle = nearGrad;
      ctx!.fill();
    };

    const drawHorizonMist = (t: number, horizonY: number) => {
      if (current.mistAlpha <= 0.01) return;

      const drift1 = prefersReducedMotion ? 0 : Math.sin(t * 0.00024) * 38;
      const drift2 = prefersReducedMotion ? 0 : Math.cos(t * 0.00019 + 1.4) * 44;

      const bands = [
        { cx: cw * 0.34 + drift1, cy: horizonY - 2, rx: cw * 0.56, ry: 22, a: current.mistAlpha * 0.85 },
        { cx: cw * 0.72 + drift2, cy: horizonY + 3, rx: cw * 0.52, ry: 18, a: current.mistAlpha * 0.65 },
      ];

      for (let i = 0; i < bands.length; i++) {
        const b = bands[i];
        const grad = ctx!.createRadialGradient(b.cx, b.cy, 2, b.cx, b.cy, b.rx);
        grad.addColorStop(0, rgba(current.mistColor, b.a));
        grad.addColorStop(0.55, rgba(current.mistColor, b.a * 0.35));
        grad.addColorStop(1, rgba(current.mistColor, 0));

        ctx!.save();
        ctx!.translate(b.cx, b.cy);
        ctx!.scale(1, b.ry / b.rx);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(0, 0, b.rx, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }
    };

    const drawLake = (t: number, horizonY: number) => {
      const waterH = ch - horizonY;

      const waterGrad = ctx!.createLinearGradient(0, horizonY, 0, ch);
      waterGrad.addColorStop(0, rgba(current.waterTop, 1));
      waterGrad.addColorStop(0.45, rgba(current.waterMid, 1));
      waterGrad.addColorStop(1, rgba(current.waterBot, 1));
      ctx!.fillStyle = waterGrad;
      ctx!.fillRect(0, horizonY, cw, waterH);

      ctx!.beginPath();
      ctx!.moveTo(0, horizonY);
      const step = Math.max(6, Math.floor(cw / 70));
      for (let x = 0; x <= cw + step; x += step) {
        const nx = x / cw;
        const h =
          5.5 +
          Math.sin(nx * Math.PI * 2.3 + 2.8) * 5.2 +
          Math.cos(nx * Math.PI * 4.4 + 0.7) * 2.1;
        ctx!.lineTo(x, horizonY + Math.max(1, h * 1.15));
      }
      ctx!.lineTo(cw, horizonY);
      ctx!.closePath();
      ctx!.fillStyle = rgba(current.hillNear, 0.24);
      ctx!.fill();

      const cx = cw * current.celestialX;
      const glowGrad = ctx!.createRadialGradient(cx, horizonY + 4, 6, cx, horizonY + 18, cw * 0.46);
      glowGrad.addColorStop(0, rgba(current.celestialHalo, 0.34 * current.celestialAlpha));
      glowGrad.addColorStop(0.55, rgba(current.celestialHalo, 0.08 * current.celestialAlpha));
      glowGrad.addColorStop(1, rgba(current.celestialHalo, 0));
      ctx!.fillStyle = glowGrad;
      ctx!.fillRect(0, horizonY, cw, waterH);

      const timeSec = prefersReducedMotion ? 0 : t * 0.001;
      const rippleRows = 26;

      for (let i = 0; i < rippleRows; i++) {
        const depth = i / (rippleRows - 1);
        const eased = depth * depth;
        const y = horizonY + 2 + eased * (waterH - 4);
        const rowH = 1.0 + depth * 2.1;

        const sway = Math.sin(timeSec * 0.95 + i * 0.62) * (2.5 + depth * 10);
        const shimmer = 0.66 + 0.34 * Math.sin(timeSec * 1.45 + i * 1.25);
        const spread = (current.celestialRadius * 1.65) + depth * (current.celestialRadius * 3.9);
        const alpha = (0.46 - depth * 0.32) * shimmer * current.celestialAlpha;

        const reflGrad = ctx!.createLinearGradient(cx + sway - spread, y, cx + sway + spread, y);
        reflGrad.addColorStop(0, rgba(current.celestialCore, 0));
        reflGrad.addColorStop(0.32, rgba(current.celestialHalo, alpha * 0.68));
        reflGrad.addColorStop(0.5, rgba(current.celestialCore, alpha));
        reflGrad.addColorStop(0.68, rgba(current.celestialHalo, alpha * 0.68));
        reflGrad.addColorStop(1, rgba(current.celestialCore, 0));

        ctx!.fillStyle = reflGrad;
        ctx!.fillRect(cx + sway - spread, y, spread * 2, rowH);

        if (i % 3 === 0) {
          const bandAlpha = 0.042 * (1 - depth * 0.48);
          ctx!.fillStyle = `rgba(255, 255, 255, ${bandAlpha.toFixed(3)})`;
          const bx = ((Math.sin(timeSec * 0.32 + i * 1.7) * 34) + cw * 0.19 * (i % 5)) % cw;
          ctx!.fillRect(bx - 42, y + 1, 86 + depth * 64, 0.85);
        }
      }

      if (current.glintAlpha > 0.02) {
        for (let i = 0; i < waterGlints.length; i++) {
          const gl = waterGlints[i];
          const pulse = prefersReducedMotion
            ? 0.45
            : Math.pow(0.5 + 0.5 * Math.sin(t * gl.speed + gl.phase), 4);
          const alpha = pulse * current.glintAlpha * 0.45;
          if (alpha <= 0.015) continue;

          const y = horizonY + 4 + gl.depth * gl.depth * (waterH - 10);
          const gGrad = ctx!.createLinearGradient(gl.x - gl.w, y, gl.x + gl.w, y);
          gGrad.addColorStop(0, 'rgba(255, 253, 245, 0)');
          gGrad.addColorStop(0.5, `rgba(255, 253, 245, ${alpha.toFixed(3)})`);
          gGrad.addColorStop(1, 'rgba(255, 253, 245, 0)');
          ctx!.fillStyle = gGrad;
          ctx!.fillRect(gl.x - gl.w, y, gl.w * 2, 1.15);
        }
      }

      const seamGrad = ctx!.createLinearGradient(0, horizonY - 4, 0, horizonY + 5);
      seamGrad.addColorStop(0, rgba(current.skyHorizon, 0));
      seamGrad.addColorStop(0.5, rgba(current.skyHorizon, 0.32));
      seamGrad.addColorStop(1, rgba(current.skyHorizon, 0));
      ctx!.fillStyle = seamGrad;
      ctx!.fillRect(0, horizonY - 4, cw, 9);
    };

    const drawLightMotes = (t: number) => {
      if (current.moteAlpha <= 0.02) return;

      for (let i = 0; i < lightMotes.length; i++) {
        const m = lightMotes[i];
        const mx = prefersReducedMotion ? m.x : (m.x + t * m.vx + cw) % cw;
        const my = prefersReducedMotion ? m.y : (m.y + t * m.vy + ch) % ch;
        const pulse = prefersReducedMotion ? 0.65 : 0.35 + 0.65 * Math.sin(t * 0.0011 + m.phase);
        const alpha = m.alpha * pulse * current.moteAlpha;

        ctx!.fillStyle = `rgba(255, 246, 224, ${(alpha * 0.72).toFixed(3)})`;
        ctx!.beginPath();
        ctx!.arc(mx, my, m.r, 0, Math.PI * 2);
        ctx!.fill();
      }
    };

    const drawFireflies = (t: number) => {
      if (current.fireflyAlpha <= 0.02) return;

      for (let i = 0; i < fireflies.length; i++) {
        const f = fireflies[i];
        const fx = prefersReducedMotion ? f.x : (f.x + t * f.vx + cw) % cw;
        const fy = prefersReducedMotion ? f.y : f.y + Math.sin(t * 0.00095 + f.phase) * f.driftY;
        const pulse = prefersReducedMotion
          ? 0.7
          : 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(t * f.pulseSpeed + f.phase), 1.6);
        const alpha = pulse * current.fireflyAlpha;

        const halo = ctx!.createRadialGradient(fx, fy, 0, fx, fy, f.r * 5.6);
        halo.addColorStop(0, rgba(current.fireflyColor, alpha * 0.82));
        halo.addColorStop(0.45, rgba(current.fireflyColor, alpha * 0.22));
        halo.addColorStop(1, rgba(current.fireflyColor, 0));

        ctx!.fillStyle = halo;
        ctx!.beginPath();
        ctx!.arc(fx, fy, f.r * 5.6, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.fillStyle = `rgba(255, 250, 232, ${(alpha * 0.94).toFixed(3)})`;
        ctx!.beginPath();
        ctx!.arc(fx, fy, f.r * 0.72, 0, Math.PI * 2);
        ctx!.fill();
      }
    };

    const renderScene = (t: number) => {
      const horizonY = Math.round(ch * HORIZON_RATIO);
      drawSky(horizonY);
      drawStarsAndMeteor(t, horizonY);
      drawCelestial(horizonY);
      drawClouds(t);
      drawDistantBirds(t, horizonY);
      drawSoftHorizonHills(horizonY);
      drawLake(t, horizonY);
      drawHorizonMist(t, horizonY);
      drawLightMotes(t);
      drawFireflies(t);
    };

    const resizeCanvases = () => {
      const rect = container.getBoundingClientRect();
      cw = Math.max(1, rect.width || container.clientWidth || 800);
      ch = Math.max(1, rect.height || container.clientHeight || 230);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      sceneCanvas.width = Math.floor(cw * dpr);
      sceneCanvas.height = Math.floor(ch * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      initEntities();
      drawFilmGrain();

      if (prefersReducedMotion) {
        renderScene(0);
      }
    };

    let rafId: number | null = null;
    let lastFrame = 0;

    const step = (ts: number) => {
      if (document.hidden || prefersReducedMotion) {
        rafId = null;
        return;
      }

      const dt = lastFrame ? Math.min(48, ts - lastFrame) : 16;
      lastFrame = ts;

      const target = PERIODS[targetPeriodRef.current];
      const f = Math.min(1, dt * 0.0038);

      lerpRgb(current.skyTop, target.skyTop, f);
      lerpRgb(current.skyUpper, target.skyUpper, f);
      lerpRgb(current.skyLower, target.skyLower, f);
      lerpRgb(current.skyHorizon, target.skyHorizon, f);
      current.celestialX = lerp(current.celestialX, target.celestialX, f);
      current.celestialY = lerp(current.celestialY, target.celestialY, f);
      current.celestialRadius = lerp(current.celestialRadius, target.celestialRadius, f);
      current.celestialAlpha = lerp(current.celestialAlpha, target.celestialAlpha, f);
      lerpRgb(current.celestialCore, target.celestialCore, f);
      lerpRgb(current.celestialHalo, target.celestialHalo, f);
      lerpRgb(current.hillFar, target.hillFar, f);
      lerpRgb(current.hillNear, target.hillNear, f);
      lerpRgb(current.mistColor, target.mistColor, f);
      current.mistAlpha = lerp(current.mistAlpha, target.mistAlpha, f);
      lerpRgb(current.waterTop, target.waterTop, f);
      lerpRgb(current.waterMid, target.waterMid, f);
      lerpRgb(current.waterBot, target.waterBot, f);
      current.starAlpha = lerp(current.starAlpha, target.starAlpha, f);
      current.shootingStarAllowed = lerp(current.shootingStarAllowed, target.shootingStarAllowed, f);
      current.cloudAlpha = lerp(current.cloudAlpha, target.cloudAlpha, f);
      current.birdAlpha = lerp(current.birdAlpha, target.birdAlpha, f);
      current.moteAlpha = lerp(current.moteAlpha, target.moteAlpha, f);
      current.glintAlpha = lerp(current.glintAlpha, target.glintAlpha, f);
      current.fireflyAlpha = lerp(current.fireflyAlpha, target.fireflyAlpha, f);
      lerpRgb(current.fireflyColor, target.fireflyColor, f);

      renderScene(ts);
      rafId = window.requestAnimationFrame(step);
    };

    const startLoop = () => {
      if (prefersReducedMotion) {
        current = clonePeriod(PERIODS[targetPeriodRef.current]);
        renderScene(0);
        return;
      }
      if (rafId === null && !document.hidden) {
        lastFrame = 0;
        rafId = window.requestAnimationFrame(step);
      }
    };

    const stopLoop = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    onPeriodChangeRef.current = (next) => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (next === 'night') {
        nextShootingStarAt = now + 2600;
      } else if (next === 'morning') {
        nextBirdFlockAt = now + 1800;
      }
      if (prefersReducedMotion) {
        current = clonePeriod(PERIODS[next]);
        renderScene(0);
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    };

    const handleMotionChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
      if (prefersReducedMotion) {
        stopLoop();
        current = clonePeriod(PERIODS[targetPeriodRef.current]);
        renderScene(0);
      } else {
        startLoop();
      }
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resizeCanvases());
      resizeObserver.observe(container);
    }

    document.addEventListener('visibilitychange', handleVisibility);
    if (reducedMotionQuery?.addEventListener) {
      reducedMotionQuery.addEventListener('change', handleMotionChange);
    }

    resizeCanvases();
    startLoop();

    return () => {
      onPeriodChangeRef.current = null;
      stopLoop();
      document.removeEventListener('visibilitychange', handleVisibility);
      if (reducedMotionQuery?.removeEventListener) {
        reducedMotionQuery.removeEventListener('change', handleMotionChange);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-day-cycle={period}
      data-scene-status="canvas"
      style={{ background: buildFallbackGradient(PERIODS[period]) }}
      className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden select-none ${compact ? 'z-0 h-full' : '-z-10 h-[420px] sm:h-[480px]'} ${className}`}
    >
      <canvas ref={sceneCanvasRef} className="absolute inset-0 w-full h-full block" />
      <canvas
        ref={grainCanvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none opacity-[0.042] mix-blend-overlay"
      />
      <div
        aria-hidden="true"
        data-hero-gradient="true"
        className="hero-scrim absolute inset-0 pointer-events-none"
      />
    </div>
  );
};
