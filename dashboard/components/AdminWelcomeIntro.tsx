"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const WELCOME_MESSAGE = "Welcome to the Unigentamos dashboard.";

export default function AdminWelcomeIntro({
  playIntro
}: {
  playIntro: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [progress, setProgress] = useState(playIntro ? 0 : 100);
  const [typedText, setTypedText] = useState(playIntro ? "" : WELCOME_MESSAGE);
  const [overlayMode, setOverlayMode] = useState<"visible" | "fading" | "hidden">(
    playIntro ? "visible" : "hidden"
  );

  const messageLength = useMemo(() => WELCOME_MESSAGE.length, []);
  useEffect(() => {
    if (!playIntro) {
      return;
    }

    setProgress(0);
    setTypedText("");
    setOverlayMode("visible");

    const barDurationMs = 520;
    const barStepMs = 16;
    const barIncrement = 100 / (barDurationMs / barStepMs);
    const barTimer = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(100, current + barIncrement);
        return next;
      });
    }, barStepMs);
    let typingTimer = 0;
    let fadeTimer = 0;
    let hideTimer = 0;

    const typingStartTimer = window.setTimeout(() => {
      window.clearInterval(barTimer);
      setProgress(100);

      let index = 0;
      typingTimer = window.setInterval(() => {
        index += 1;
        setTypedText(WELCOME_MESSAGE.slice(0, index));
        if (index >= messageLength) {
          window.clearInterval(typingTimer);
          fadeTimer = window.setTimeout(() => {
            setOverlayMode("fading");
            router.replace(pathname, { scroll: false });
            hideTimer = window.setTimeout(() => setOverlayMode("hidden"), 320);
          }, 260);
        }
      }, 25);
    }, barDurationMs + 60);

    return () => {
      window.clearInterval(barTimer);
      window.clearTimeout(typingStartTimer);
      window.clearInterval(typingTimer);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [messageLength, pathname, playIntro, router]);

  return (
    <>
      {overlayMode !== "hidden" && (
        <div
          className={`admin-boot-overlay ${overlayMode === "fading" ? "is-fading" : ""}`}
          aria-hidden={overlayMode === "fading"}
        >
          <div className="admin-boot-inner">
            <div className="admin-boot-progress-track" role="progressbar" aria-valuenow={Math.round(progress)}>
              <span className="admin-boot-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="admin-boot-message">{typedText || " "}</p>
          </div>
        </div>
      )}
    </>
  );
}
