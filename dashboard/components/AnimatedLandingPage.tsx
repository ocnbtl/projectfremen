"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

type Pixel = {
  x: number;
  y: number;
  color: string;
};

type LandingProps = {
  hasError?: boolean;
  errorPath: string;
  showBackLink?: boolean;
};

const COLORS = {
  orange: "#FF4E00",
  blue: "#0D2D42",
  green: "#174D36",
  brown: "#4D342A"
} as const;

const DOT_COLORS = [
  COLORS.orange,
  COLORS.blue,
  COLORS.green,
  COLORS.orange,
  COLORS.brown,
  COLORS.blue,
  COLORS.brown,
  COLORS.green,
  COLORS.blue,
  COLORS.orange,
  COLORS.green,
  COLORS.blue
];

const LOGO_SIZE = 168;
const DOT_COUNT = 12;
const LOGO_RADIUS = LOGO_SIZE * 0.38;
const DOT_RADIUS = LOGO_SIZE * 0.07;
const CENTER = LOGO_SIZE / 2;
const LINE_MAX_PIXELS = 3600;

function getViewport() {
  if (typeof window === "undefined") {
    return { w: 1366, h: 900 };
  }

  return { w: window.innerWidth, h: window.innerHeight };
}

function getFinalPosition(index: number) {
  const angle = (index * 360) / DOT_COUNT - 90;
  const radians = (angle * Math.PI) / 180;
  return {
    x: CENTER + LOGO_RADIUS * Math.cos(radians),
    y: CENTER + LOGO_RADIUS * Math.sin(radians)
  };
}

function getSwirlPosition(index: number) {
  const angle = (index * 360) / DOT_COUNT;
  const radians = (angle * Math.PI) / 180;
  const swirlRadius = LOGO_RADIUS * 1.5;
  return {
    x: CENTER + swirlRadius * Math.cos(radians),
    y: CENTER + swirlRadius * Math.sin(radians)
  };
}

function getStartPosition(index: number, width: number, height: number) {
  const side = index % 4;

  if (side === 0) {
    const x = (width / DOT_COUNT) * (index + 0.5);
    return { x, y: -110 };
  }

  if (side === 1) {
    const y = (height / DOT_COUNT) * (index + 0.5);
    return { x: width + 110, y };
  }

  if (side === 2) {
    const x = width - (width / DOT_COUNT) * (index + 0.5);
    return { x, y: height + 110 };
  }

  const y = height - (height / DOT_COUNT) * (index + 0.5);
  return { x: -110, y };
}

function isWithinBounds(x: number, y: number, width: number, height: number) {
  return x >= 0 && x <= width && y >= 0 && y <= height;
}

function nextPixels(
  current: Pixel[],
  color: string,
  width: number,
  height: number
): Pixel[] {
  if (current.length === 0) {
    return current;
  }

  const directions = [
    { dx: 0, dy: -2 },
    { dx: 0, dy: 2 },
    { dx: 2, dy: 0 },
    { dx: -2, dy: 0 }
  ];

  const tipSize = Math.min(7, current.length);
  let anchor = current[current.length - 1 - Math.floor(Math.random() * tipSize)];

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const direction = directions[Math.floor(Math.random() * directions.length)];
    const nx = anchor.x + direction.dx;
    const ny = anchor.y + direction.dy;

    if (!isWithinBounds(nx, ny, width, height)) {
      continue;
    }

    const next: Pixel = { x: nx, y: ny, color };
    if (current.length >= LINE_MAX_PIXELS) {
      return [...current.slice(1), next];
    }
    return [...current, next];
  }

  anchor = current[Math.floor(Math.random() * current.length)];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const direction = directions[Math.floor(Math.random() * directions.length)];
    const nx = anchor.x + direction.dx;
    const ny = anchor.y + direction.dy;

    if (!isWithinBounds(nx, ny, width, height)) {
      continue;
    }

    const next: Pixel = { x: nx, y: ny, color };
    if (current.length >= LINE_MAX_PIXELS) {
      return [...current.slice(1), next];
    }
    return [...current, next];
  }

  return current;
}

export default function AnimatedLandingPage({
  hasError = false,
  errorPath,
  showBackLink = false
}: LandingProps) {
  const [animationComplete, setAnimationComplete] = useState(false);
  const [viewport, setViewport] = useState(() => getViewport());
  const [orangePixels, setOrangePixels] = useState<Pixel[]>([]);
  const [bluePixels, setBluePixels] = useState<Pixel[]>([]);
  const [greenPixels, setGreenPixels] = useState<Pixel[]>([]);
  const [brownPixels, setBrownPixels] = useState<Pixel[]>([]);

  const startPositions = useMemo(
    () => DOT_COLORS.map((_, index) => getStartPosition(index, viewport.w, viewport.h)),
    [viewport.w, viewport.h]
  );

  useEffect(() => {
    function onResize() {
      setViewport(getViewport());
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!animationComplete) {
      return;
    }

    function createSeed(color: string): Pixel {
      return {
        x: Math.max(10, Math.floor(Math.random() * (viewport.w - 20))),
        y: Math.max(10, Math.floor(Math.random() * (viewport.h - 20))),
        color
      };
    }

    setOrangePixels([createSeed(COLORS.orange)]);
    setBluePixels([createSeed(COLORS.blue)]);
    setGreenPixels([createSeed(COLORS.green)]);
    setBrownPixels([createSeed(COLORS.brown)]);

    const orange = window.setInterval(() => {
      setOrangePixels((current) => nextPixels(current, COLORS.orange, viewport.w, viewport.h));
    }, 22);
    const blue = window.setInterval(() => {
      setBluePixels((current) => nextPixels(current, COLORS.blue, viewport.w, viewport.h));
    }, 24);
    const green = window.setInterval(() => {
      setGreenPixels((current) => nextPixels(current, COLORS.green, viewport.w, viewport.h));
    }, 20);
    const brown = window.setInterval(() => {
      setBrownPixels((current) => nextPixels(current, COLORS.brown, viewport.w, viewport.h));
    }, 26);

    return () => {
      window.clearInterval(orange);
      window.clearInterval(blue);
      window.clearInterval(green);
      window.clearInterval(brown);
    };
  }, [animationComplete, viewport.h, viewport.w]);

  return (
    <main className="landing-root">
      <div className="landing-pixel-layer" aria-hidden>
        {orangePixels.map((pixel, index) => (
          <span
            key={`orange-${index}`}
            className="landing-pixel"
            style={{ left: pixel.x, top: pixel.y, backgroundColor: pixel.color }}
          />
        ))}
        {bluePixels.map((pixel, index) => (
          <span
            key={`blue-${index}`}
            className="landing-pixel"
            style={{ left: pixel.x, top: pixel.y, backgroundColor: pixel.color }}
          />
        ))}
        {greenPixels.map((pixel, index) => (
          <span
            key={`green-${index}`}
            className="landing-pixel"
            style={{ left: pixel.x, top: pixel.y, backgroundColor: pixel.color }}
          />
        ))}
        {brownPixels.map((pixel, index) => (
          <span
            key={`brown-${index}`}
            className="landing-pixel"
            style={{ left: pixel.x, top: pixel.y, backgroundColor: pixel.color }}
          />
        ))}
      </div>

      <div className="landing-center">
        {showBackLink && (
          <Link href="/" className="landing-back-link">
            Back Home
          </Link>
        )}

        <div className="landing-logo-wrap" style={{ width: LOGO_SIZE, height: LOGO_SIZE }}>
          {DOT_COLORS.map((color, index) => {
            const start = startPositions[index];
            const swirl = getSwirlPosition(index);
            const final = getFinalPosition(index);

            return (
              <motion.span
                key={`${color}-${index}`}
                className="landing-logo-dot"
                style={{
                  width: DOT_RADIUS * 2,
                  height: DOT_RADIUS * 2,
                  left: final.x - DOT_RADIUS,
                  top: final.y - DOT_RADIUS,
                  backgroundColor: color
                }}
                initial={{
                  x: start.x - final.x,
                  y: start.y - final.y,
                  scale: 0,
                  opacity: 0
                }}
                animate={
                  animationComplete
                    ? { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }
                    : {
                        x: [start.x - final.x, swirl.x - final.x, 0],
                        y: [start.y - final.y, swirl.y - final.y, 0],
                        scale: [0, 1.2, 1],
                        opacity: [0, 1, 1],
                        rotate: [0, 1440, 0]
                      }
                }
                transition={{
                  duration: 2.15,
                  delay: index * 0.06,
                  ease: [0.25, 0.1, 0.25, 1],
                  times: [0, 0.5, 1]
                }}
                onAnimationComplete={() => {
                  if (index === DOT_COUNT - 1) {
                    setAnimationComplete(true);
                  }
                }}
              />
            );
          })}
        </div>

        <motion.h1
          className="landing-title"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.8, duration: 0.6 }}
        >
          <span className="landing-title-uni">Uni</span>
          <span className="landing-title-gen">gen</span>
          <span className="landing-title-ta">ta</span>
          <span className="landing-title-mos">mos</span>
        </motion.h1>

        <motion.div
          className="landing-login-shell"
          initial={{ opacity: 0, y: 26 }}
          animate={{
            opacity: animationComplete ? 1 : 0,
            y: animationComplete ? 0 : 26
          }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <form action="/api/admin/login" method="post" className="landing-login-form">
            <input type="hidden" name="errorPath" value={errorPath} />
            <input type="hidden" name="successPath" value="/admin" />

            {hasError && (
              <p className="landing-error" role="alert">
                Invalid password. Try again.
              </p>
            )}

            <label htmlFor="password" className="landing-label">
              Founder Access
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="password"
              className="landing-input"
              required
            />

            <button type="submit" className="landing-submit">
              Enter Admin
            </button>
          </form>
          <img
            src="/unigentamos-logo.svg"
            alt="Unigentamos mark"
            className="landing-logo-fallback"
          />
        </motion.div>
      </div>
    </main>
  );
}
