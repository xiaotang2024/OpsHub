import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
}

const PARTICLE_COLORS = [
  '#06b6d4', // ops-cyan
  '#10b981', // emerald
  '#38bdf8', // sky
  '#818cf8', // indigo
  '#a855f7', // purple
];

export interface InteractiveCanvasBackgroundProps {
  transparent?: boolean;
  particleColors?: string[];
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(100, 149, 237, ${alpha})`;
  let c = hex.substring(1);
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(100, 149, 237, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const InteractiveCanvasBackground: React.FC<InteractiveCanvasBackgroundProps> = ({
  transparent = false,
  particleColors,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  // Update existing particles colors dynamically when particleColors prop changes
  useEffect(() => {
    if (particleColors && particleColors.length > 0 && particlesRef.current.length > 0) {
      particlesRef.current.forEach((p) => {
        p.color = particleColors[Math.floor(Math.random() * particleColors.length)];
      });
    }
  }, [particleColors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const activeColors =
      particleColors && particleColors.length > 0 ? particleColors : PARTICLE_COLORS;
    const primaryColor = activeColors[0] || '#06b6d4';
    const secondaryColor = activeColors[1] || '#38bdf8';

    // Mouse coordinates with easing
    const mouse = {
      x: width / 2,
      y: height / 2,
      targetX: width / 2,
      targetY: height / 2,
      isHovering: false,
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.isHovering = true;
    };

    const handleMouseLeave = () => {
      mouse.isHovering = false;
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('resize', handleResize);

    // Initialize particles
    const particleCount = Math.min(Math.floor((width * height) / 14000), 100);
    particlesRef.current = [];

    for (let i = 0; i < particleCount; i++) {
      particlesRef.current.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.7,
        vy: (Math.random() - 0.5) * 0.7,
        radius: Math.random() * 2 + 1.2,
        color: activeColors[Math.floor(Math.random() * activeColors.length)],
        alpha: Math.random() * 0.5 + 0.3,
      });
    }

    // Animation Loop
    const render = () => {
      // Smooth mouse interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw atmospheric background gradient
      if (!transparent) {
        if (typeof ctx.createRadialGradient === 'function') {
          const bgGradient = ctx.createRadialGradient(
            width * 0.5,
            height * 0.4,
            50,
            width * 0.5,
            height * 0.5,
            Math.max(width, height) * 0.8
          );
          bgGradient.addColorStop(0, '#0a101d');
          bgGradient.addColorStop(0.5, '#060a12');
          bgGradient.addColorStop(1, '#020408');
          ctx.fillStyle = bgGradient;
        } else {
          ctx.fillStyle = '#060a12';
        }
        ctx.fillRect(0, 0, width, height);
      }

      // 2. Draw subtle interactive mouse ambient aura spotlight
      if (mouse.isHovering && typeof ctx.createRadialGradient === 'function') {
        const mouseAura = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          320
        );
        mouseAura.addColorStop(0, hexToRgba(primaryColor, 0.14));
        mouseAura.addColorStop(0.4, hexToRgba(secondaryColor, 0.05));
        mouseAura.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = mouseAura;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Update and draw particles
      const maxDistance = 120;
      const mouseInfluenceRadius = 150;
      const currentParticles = particlesRef.current;

      for (let i = 0; i < currentParticles.length; i++) {
        const p = currentParticles[i];

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Bounce off walls
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Mouse gentle gravity interaction
        if (mouse.isHovering) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < mouseInfluenceRadius && dist > 0) {
            const force = (mouseInfluenceRadius - dist) / mouseInfluenceRadius;
            p.x += (dx / dist) * force * 0.8;
            p.y += (dy / dist) * force * 0.8;

            // Draw line to mouse
            const alpha = (1 - dist / mouseInfluenceRadius) * 0.35;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = hexToRgba(primaryColor, alpha);
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Draw particle dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Connect nearby particles
        for (let j = i + 1; j < currentParticles.length; j++) {
          const p2 = currentParticles[j];
          const distSq = (p.x - p2.x) ** 2 + (p.y - p2.y) ** 2;
          if (distSq < maxDistance * maxDistance) {
            const dist = Math.sqrt(distSq);
            const lineAlpha = (1 - dist / maxDistance) * 0.22;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = hexToRgba(secondaryColor, lineAlpha);
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, [transparent, particleColors]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 block w-full h-full"
      style={{ background: transparent ? 'transparent' : '#030712' }}
    />
  );
};

export default InteractiveCanvasBackground;
