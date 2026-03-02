"use client";

import { useEffect, useMemo, useState } from "react";

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatDateLabel(value: Date): string {
  return value.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric"
  });
}

function formatTimeLabel(value: Date): string {
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
}

export default function DashboardClockHero() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = useMemo(() => formatDateLabel(now), [now]);
  const timeLabel = useMemo(() => formatTimeLabel(now), [now]);

  return (
    <section className="admin-clock-hero" aria-live="polite">
      <p className="admin-clock-line">Today is {dateLabel}</p>
      <p className="admin-clock-line admin-clock-time-line">Time is {timeLabel}</p>
    </section>
  );
}
