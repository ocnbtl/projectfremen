"use client";

import { useEffect, useRef } from "react";
import { advancePixelField, createPixelField, PIXEL_SIZE, resizePixelField } from "../lib/landing-pixels";

const colors = ["#FF4E00", "#0D2D42", "#174D36", "#4D342A"];

export default function LandingPixels({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const field = createPixelField(canvas.clientWidth, canvas.clientHeight);
    let frame = 0;
    let lastFrame = 0;
    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      resizePixelField(field, width, height);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Resizing clears the canvas bitmap, so replay the permanent grid once.
      for (let y = 0; y < field.visibleRows; y++) for (let x = 0; x < field.visibleColumns; x++) {
        const color = field.cells[y * field.columns + x];
        if (color) {
          context.fillStyle = colors[color - 1];
          context.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        }
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const draw = (time: number) => {
      if (time - lastFrame >= 32) {
        lastFrame = time;
        // Only draw new squares. No frame clears, history cap, or content cutouts.
        colors.forEach((color, index) => {
          context.fillStyle = color;
          for (let step = 0; step < 2; step++) {
            const point = advancePixelField(field, index + 1);
            if (point) context.fillRect(point.x, point.y, PIXEL_SIZE, PIXEL_SIZE);
          }
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [active]);
  return <canvas ref={canvasRef} className="landing-pixel-layer" aria-hidden="true" />;
}
