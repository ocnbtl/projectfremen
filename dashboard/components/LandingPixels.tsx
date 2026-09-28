"use client";

import { useEffect, useRef } from "react";
import { advancePixelTrail, createPixelTrail } from "../lib/landing-pixels";

const colors = ["#FF4E00", "#0D2D42", "#174D36", "#4D342A"];

export default function LandingPixels({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let width = 0;
    let height = 0;
    let trails = colors.map(() => createPixelTrail(2, 2));
    let frame = 0;
    let lastFrame = 0;
    const resize = () => {
      width = Math.max(2, canvas.clientWidth);
      height = Math.max(2, canvas.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      trails = colors.map(() => createPixelTrail(width, height));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const draw = (time: number) => {
      // No React renders per pixel, no accumulating DOM, and no catch-up burst
      // after a background tab resumes. Every visible frame advances the trails.
      if (time - lastFrame >= 32) {
        lastFrame = time;
        context.clearRect(0, 0, width, height);
        trails.forEach((trail, index) => {
          for (let step = 0; step < 2; step++) advancePixelTrail(trail, width, height);
          context.fillStyle = colors[index];
          for (const point of trail.points) context.fillRect(point.x, point.y, 2, 2);
        });
        // Trails continue behind the content, but never obscure the identity,
        // copy or controls. Read current rectangles so layout transitions stay clear.
        const canvasBounds = canvas.getBoundingClientRect();
        canvas.parentElement?.querySelectorAll(".landing-logo-wrap, .landing-title, .landing-description, .landing-ventures, .landing-signin, .landing-login-shell").forEach((element) => {
          const bounds = element.getBoundingClientRect();
          context.clearRect(bounds.left - canvasBounds.left - 12, bounds.top - canvasBounds.top - 10, bounds.width + 24, bounds.height + 20);
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [active]);
  return <canvas ref={canvasRef} className="landing-pixel-layer" aria-hidden="true" />;
}
