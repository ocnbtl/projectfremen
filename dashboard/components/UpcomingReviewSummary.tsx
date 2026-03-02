"use client";

import Link from "next/link";
import {
  daysUntil,
  formatLocalIsoDate,
  formatMonthDay,
  getNextFirstSunday,
  getNextFriday,
  getNextSunday
} from "../lib/review-schedule";

function dayLabel(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function UpcomingReviewSummary() {
  const now = new Date();
  const weeklyDate = getNextSunday(now);
  const monthlyDate = getNextFirstSunday(now);
  const kpiRefreshDate = getNextFriday(now);

  const weeklyDays = daysUntil(weeklyDate, now);
  const monthlyDays = daysUntil(monthlyDate, now);
  const kpiDays = daysUntil(kpiRefreshDate, now);

  const weeklyLabel = `${formatMonthDay(weeklyDate)} (${dayLabel(weeklyDays)})`;
  const monthlyLabel = `${formatMonthDay(monthlyDate)} (${dayLabel(monthlyDays)})`;
  const kpiLabel = `${formatMonthDay(kpiRefreshDate)} (${dayLabel(kpiDays)})`;

  return (
    <article className="card admin-slate-card">
      <div className="admin-slate-head">
        <h2>Upcoming Reviews</h2>
        <div className="admin-review-shortcuts">
          <Link
            href={`/admin/reviews/weekly?scheduledFor=${formatLocalIsoDate(weeklyDate)}`}
            className="admin-mini-link"
          >
            Weekly
          </Link>
          <Link
            href={`/admin/reviews/monthly?scheduledFor=${formatLocalIsoDate(monthlyDate)}`}
            className="admin-mini-link"
          >
            Monthly
          </Link>
        </div>
      </div>

      <table className="admin-compact-table">
        <thead>
          <tr>
            <th>Review</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Weekly Review</td>
            <td>{weeklyLabel} (Sunday)</td>
          </tr>
          <tr>
            <td>Monthly Review</td>
            <td>{monthlyLabel} (1st Sunday)</td>
          </tr>
          <tr>
            <td>KPI Refresh</td>
            <td>{kpiLabel}</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
