'use client';

import { useRef, useEffect, useCallback } from 'react';

// Sport ball emoji shapes drawn as simple Canvas paths
const BALL_TYPES = [
  { draw: drawSoccerBall, color: '#22c55e' },
  { draw: drawBasketball, color: '#f59e0b' },
  { draw: drawTennisBall, color: '#ef4444' },
  { draw: drawShuttlecock, color: '#06b6d4' },
  { draw: drawBaseball, color: '#f97316' },
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  type: number;
  alpha: number;
  rotation: number;
  rotationSpeed: number;
}

function drawSoccerBall(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  // Outer circle
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Pentagon pattern
  for (let i = 0; i < 5; i++) {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const px = Math.cos(angle) * size * 0.5;
    const py = Math.sin(angle) * size * 0.5;
    ctx.beginPath();
    ctx.arc(px, py, size * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
  }
  ctx.restore();
}

function drawBasketball(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(245,158,11,0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245,158,11,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Cross lines
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(size, 0);
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  ctx.strokeStyle = 'rgba(245,158,11,0.2)';
  ctx.stroke();
  ctx.restore();
}

function drawTennisBall(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(239,68,68,0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(239,68,68,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Curved seam
  ctx.beginPath();
  ctx.arc(-size * 0.3, 0, size * 0.8, -0.8, 0.8);
  ctx.strokeStyle = 'rgba(239,68,68,0.2)';
  ctx.stroke();
  ctx.restore();
}

function drawShuttlecock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  // Cork base
  ctx.beginPath();
  ctx.arc(0, size * 0.3, size * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(6,182,212,0.2)';
  ctx.fill();
  // Feather cone
  ctx.beginPath();
  ctx.moveTo(-size * 0.6, -size * 0.5);
  ctx.lineTo(0, size * 0.1);
  ctx.lineTo(size * 0.6, -size * 0.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(6,182,212,0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,182,212,0.2)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

function drawBaseball(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(249,115,22,0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(249,115,22,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Stitching
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * i) / 5 - 0.5;
    const sx = Math.cos(angle) * size * 0.7;
    const sy = Math.sin(angle) * size * 0.4 - size * 0.1;
    ctx.moveTo(sx - 2, sy);
    ctx.lineTo(sx + 2, sy);
  }
  ctx.strokeStyle = 'rgba(249,115,22,0.2)';
  ctx.stroke();
  ctx.restore();
}

export function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef<number>(0);
  const reducedMotion = useRef(false);

  const initParticles = useCallback((w: number, h: number) => {
    const isMobile = w < 768;
    const count = isMobile ? 12 : 25;
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: isMobile ? 8 + Math.random() * 12 : 12 + Math.random() * 18,
        type: Math.floor(Math.random() * BALL_TYPES.length),
        alpha: 0.4 + Math.random() * 0.4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.008,
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
      initParticles(rect.width, rect.height);
    };

    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };
    const onTouchMove = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches[0];
      mouseRef.current = { x: t.clientX - rect.left, y: t.clientY - rect.top };
    };

    const parent = canvas.parentElement;
    if (!parent) return;
    parent.addEventListener('mousemove', onMouseMove);
    parent.addEventListener('mouseleave', onMouseLeave);
    parent.addEventListener('touchmove', onTouchMove, { passive: true });

    // If reduced motion, draw once and stop
    if (reducedMotion.current) {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
      particlesRef.current.forEach((p) => {
        ctx.globalAlpha = p.alpha * 0.5;
        BALL_TYPES[p.type].draw(ctx, p.x, p.y, p.size, p.rotation);
      });
      ctx.globalAlpha = 1;
      return;
    }

    const animate = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      particlesRef.current.forEach((p) => {
        // Mouse interaction: gentle push
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const interactRadius = 120;

        if (dist < interactRadius && dist > 0) {
          const force = (interactRadius - dist) / interactRadius;
          const angle = Math.atan2(dy, dx);
          p.vx += Math.cos(angle) * force * 0.15;
          p.vy += Math.sin(angle) * force * 0.15;
        }

        // Damping
        p.vx *= 0.98;
        p.vy *= 0.98;

        // Gentle drift back to original velocity
        p.vx += (Math.random() - 0.5) * 0.01;
        p.vy += (Math.random() - 0.5) * 0.01;

        // Move
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        // Wrap around edges
        if (p.x < -p.size) p.x = w + p.size;
        if (p.x > w + p.size) p.x = -p.size;
        if (p.y < -p.size) p.y = h + p.size;
        if (p.y > h + p.size) p.y = -p.size;

        // Draw
        ctx.globalAlpha = p.alpha;
        BALL_TYPES[p.type].draw(ctx, p.x, p.y, p.size, p.rotation);
      });

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      const p = canvas.parentElement;
      if (p) {
        p.removeEventListener('mousemove', onMouseMove);
        p.removeEventListener('mouseleave', onMouseLeave);
        p.removeEventListener('touchmove', onTouchMove);
      }
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
