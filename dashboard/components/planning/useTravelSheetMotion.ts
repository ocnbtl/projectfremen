"use client";
import { useLayoutEffect, type RefObject } from "react";

/** Animate the real panel height, keeping text and controls at their natural size. */
export function useTravelSheetMotion(contentRef: RefObject<HTMLDivElement | null>, open: boolean, reduced: boolean | null) {
  useLayoutEffect(() => {
    const content = contentRef.current;
    const sheet = content?.closest<HTMLElement>(".work-sheet");
    const body = content?.closest<HTMLElement>(".work-sheet-body");
    const header = sheet?.querySelector<HTMLElement>(".work-sheet-header");
    if (!open || !content || !sheet || !body || !header) return;
    let animation: Animation | undefined;
    let initialized = false;
    let lastNatural = -1;
    const previousHeight = sheet.style.height;
    const measure = (force = false) => {
      const current = sheet.offsetHeight;
      const bodyStyle = getComputedStyle(body), sheetStyle = getComputedStyle(sheet);
      const natural = content.offsetHeight + header.offsetHeight
        + parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom)
        + parseFloat(sheetStyle.borderTopWidth) + parseFloat(sheetStyle.borderBottomWidth);
      if (!force && Math.abs(natural - lastNatural) < .5) return;
      lastNatural = natural;
      // Cancel only after sampling the in-flight height, so rapid changes retarget smoothly.
      animation?.cancel();
      sheet.style.height = `${natural}px`;
      const target = sheet.offsetHeight;
      const reduce = reduced || document.documentElement.dataset.productMotion === "reduce";
      if (initialized && !reduce && Math.abs(current - target) > .5) {
        animation = sheet.animate([{ height: `${current}px` }, { height: `${target}px` }], {
          duration: 320, easing: "cubic-bezier(.22,1,.36,1)",
        });
      }
      initialized = true;
    };
    measure();
    const observer = new ResizeObserver(() => {
      // Observe intrinsic content, not the animated sheet, to avoid resize feedback loops.
      measure();
    });
    observer.observe(content);
    observer.observe(header);
    const onResize = () => measure(true);
    window.addEventListener("resize", onResize);
    const preferenceObserver = new MutationObserver(() => measure(true));
    preferenceObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-product-motion"] });
    return () => {
      observer.disconnect();
      preferenceObserver.disconnect();
      window.removeEventListener("resize", onResize);
      animation?.cancel();
      sheet.style.height = previousHeight;
    };
  }, [contentRef, open, reduced]);
}
