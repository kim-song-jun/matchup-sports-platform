'use client';

import { useRef, useEffect, useCallback } from 'react';

/* ── Ball drawing functions ── */

function drawSoccerBall(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * size * 0.5, Math.sin(a) * size * 0.5, size * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
  }
}

function drawBasketball(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(245,158,11,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245,158,11,0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
  ctx.moveTo(0, -size); ctx.lineTo(0, size);
  ctx.strokeStyle = 'rgba(245,158,11,0.2)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.65, -0.6, 0.6);
  ctx.stroke();
}

function drawTennisBall(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(190,235,60,0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,235,60,0.3)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-size * 0.4, 0, size * 0.85, -0.7, 0.7);
  ctx.moveTo(size * 0.4 + size * 0.85 * Math.cos(Math.PI - 0.7), size * 0.85 * Math.sin(Math.PI - 0.7));
  ctx.arc(size * 0.4, 0, size * 0.85, Math.PI - 0.7, Math.PI + 0.7);
  ctx.strokeStyle = 'rgba(190,235,60,0.2)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function drawShuttlecock(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  ctx.arc(0, size * 0.35, size * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(6,182,212,0.22)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-size * 0.55, -size * 0.5);
  ctx.quadraticCurveTo(-size * 0.1, -size * 0.1, 0, size * 0.1);
  ctx.quadraticCurveTo(size * 0.1, -size * 0.1, size * 0.55, -size * 0.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(6,182,212,0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,182,212,0.25)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function drawIceHockeyPuck(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(148,163,184,0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.3)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.6, size * 0.3, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

const BALL_TYPES = [
  drawSoccerBall,
  drawBasketball,
  drawTennisBall,
  drawShuttlecock,
  drawIceHockeyPuck,
];

/* ── Particle system ── */

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  size: number;
  type: number;
  alpha: number;
  targetAlpha: number;
  rotation: number;
  rotationSpeed: number;
  grabbed: boolean;
  scale: number;
  targetScale: number;
}

// Spring physics constants
const SPRING_STIFFNESS = 0.008;
const SPRING_DAMPING = 0.92;
const GRAB_RADIUS = 80;
const FLING_MULTIPLIER = 1.8;

export function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000, isDown: false, prevX: 0, prevY: 0 });
  const rafRef = useRef<number>(0);
  const grabbedRef = useRef<number | null>(null);

  const initParticles = useCallback((w: number, h: number) => {
    const isMobile = w < 768;
    const count = isMobile ? 14 : 28;
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      particles.push({
        x, y,
        originX: x,
        originY: y,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: isMobile ? 10 + Math.random() * 14 : 14 + Math.random() * 20,
        type: Math.floor(Math.random() * BALL_TYPES.length),
        alpha: 0.3 + Math.random() * 0.4,
        targetAlpha: 0.3 + Math.random() * 0.4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.01,
        grabbed: false,
        scale: 1,
        targetScale: 1,
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particlesRef.current.length === 0) initParticles(w, h);
    };

    resize();
    window.addEventListener('resize', resize);

    const parent = canvas.parentElement;
    if (!parent) return;

    // Mouse/touch handlers
    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const findNearest = (mx: number, my: number): number | null => {
      let closest = -1;
      let minDist = GRAB_RADIUS;
      particlesRef.current.forEach((p, i) => {
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < minDist) { minDist = d; closest = i; }
      });
      return closest >= 0 ? closest : null;
    };

    const onMouseMove = (e: MouseEvent) => {
      const pos = getPos(e);
      mouseRef.current.prevX = mouseRef.current.x;
      mouseRef.current.prevY = mouseRef.current.y;
      mouseRef.current.x = pos.x;
      mouseRef.current.y = pos.y;

      // If dragging a grabbed particle, move it
      if (mouseRef.current.isDown && grabbedRef.current !== null) {
        const p = particlesRef.current[grabbedRef.current];
        if (p) {
          p.x = pos.x;
          p.y = pos.y;
          p.vx = 0;
          p.vy = 0;
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      const pos = getPos(e);
      mouseRef.current.isDown = true;
      mouseRef.current.x = pos.x;
      mouseRef.current.y = pos.y;
      const idx = findNearest(pos.x, pos.y);
      if (idx !== null) {
        grabbedRef.current = idx;
        const p = particlesRef.current[idx];
        p.grabbed = true;
        p.targetScale = 1.4;
        p.targetAlpha = 0.9;
      }
    };

    const onMouseUp = () => {
      if (grabbedRef.current !== null) {
        const p = particlesRef.current[grabbedRef.current];
        if (p) {
          // Fling: apply velocity based on mouse movement
          p.vx = (mouseRef.current.x - mouseRef.current.prevX) * FLING_MULTIPLIER;
          p.vy = (mouseRef.current.y - mouseRef.current.prevY) * FLING_MULTIPLIER;
          p.grabbed = false;
          p.targetScale = 1;
          p.targetAlpha = 0.3 + Math.random() * 0.4;
        }
        grabbedRef.current = null;
      }
      mouseRef.current.isDown = false;
    };

    const onMouseLeave = () => {
      mouseRef.current.x = -1000;
      mouseRef.current.y = -1000;
      if (grabbedRef.current !== null) {
        const p = particlesRef.current[grabbedRef.current];
        if (p) { p.grabbed = false; p.targetScale = 1; }
        grabbedRef.current = null;
      }
      mouseRef.current.isDown = false;
    };

    const onTouchStart = (e: TouchEvent) => {
      const pos = getPos(e.touches[0]);
      mouseRef.current.isDown = true;
      mouseRef.current.x = pos.x;
      mouseRef.current.y = pos.y;
      const idx = findNearest(pos.x, pos.y);
      if (idx !== null) {
        grabbedRef.current = idx;
        particlesRef.current[idx].grabbed = true;
        particlesRef.current[idx].targetScale = 1.4;
        particlesRef.current[idx].targetAlpha = 0.9;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const pos = getPos(e.touches[0]);
      mouseRef.current.prevX = mouseRef.current.x;
      mouseRef.current.prevY = mouseRef.current.y;
      mouseRef.current.x = pos.x;
      mouseRef.current.y = pos.y;
      if (grabbedRef.current !== null) {
        const p = particlesRef.current[grabbedRef.current];
        if (p) { p.x = pos.x; p.y = pos.y; p.vx = 0; p.vy = 0; }
      }
    };

    const onTouchEnd = () => {
      onMouseUp();
    };

    parent.addEventListener('mousemove', onMouseMove);
    parent.addEventListener('mousedown', onMouseDown);
    parent.addEventListener('mouseup', onMouseUp);
    parent.addEventListener('mouseleave', onMouseLeave);
    parent.addEventListener('touchstart', onTouchStart, { passive: true });
    parent.addEventListener('touchmove', onTouchMove, { passive: true });
    parent.addEventListener('touchend', onTouchEnd);

    // Reduced motion: static render
    if (isReduced) {
      ctx.clearRect(0, 0, w, h);
      particlesRef.current.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.alpha * 0.5;
        BALL_TYPES[p.type](ctx, p.size);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      return;
    }

    // Visibility tracking — pause when offscreen
    let isVisible = true;
    let frameCount = 0;
    const visObserver = new IntersectionObserver(
      ([entry]) => { isVisible = entry.isIntersecting; },
      { threshold: 0 }
    );
    visObserver.observe(canvas);

    // Animation loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      if (!isVisible) return;

      ctx.clearRect(0, 0, w, h);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      frameCount++;

      particlesRef.current.forEach((p) => {
        if (!p.grabbed) {
          const dx = p.originX - p.x;
          const dy = p.originY - p.y;
          p.vx += dx * SPRING_STIFFNESS;
          p.vy += dy * SPRING_STIFFNESS;

          if (grabbedRef.current === null) {
            const dmx = p.x - mx;
            const dmy = p.y - my;
            const dist = Math.hypot(dmx, dmy);
            if (dist < 100 && dist > 0) {
              const force = (100 - dist) / 100;
              p.vx += (dmx / dist) * force * 0.3;
              p.vy += (dmy / dist) * force * 0.3;
            }
          }

          p.vx *= SPRING_DAMPING;
          p.vy *= SPRING_DAMPING;
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < -p.size * 2) p.x = w + p.size;
          if (p.x > w + p.size * 2) p.x = -p.size;
          if (p.y < -p.size * 2) p.y = h + p.size;
          if (p.y > h + p.size * 2) p.y = -p.size;

          // Slow drift — sine-based instead of Math.random() per frame
          if (frameCount % 60 === 0) {
            p.originX += Math.sin(frameCount * 0.01 + p.size) * 0.5;
            p.originY += Math.cos(frameCount * 0.01 + p.size) * 0.5;
            p.originX = Math.max(0, Math.min(w, p.originX));
            p.originY = Math.max(0, Math.min(h, p.originY));
          }
        }

        p.rotation += p.rotationSpeed * (p.grabbed ? 3 : 1);
        p.scale += (p.targetScale - p.scale) * 0.15;
        p.alpha += (p.targetAlpha - p.alpha) * 0.1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.scale(p.scale, p.scale);
        ctx.globalAlpha = p.alpha;
        BALL_TYPES[p.type](ctx, p.size);
        ctx.restore();
      });

      ctx.globalAlpha = 1;
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      visObserver.disconnect();
      window.removeEventListener('resize', resize);
      parent.removeEventListener('mousemove', onMouseMove);
      parent.removeEventListener('mousedown', onMouseDown);
      parent.removeEventListener('mouseup', onMouseUp);
      parent.removeEventListener('mouseleave', onMouseLeave);
      parent.removeEventListener('touchstart', onTouchStart);
      parent.removeEventListener('touchmove', onTouchMove);
      parent.removeEventListener('touchend', onTouchEnd);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
