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

export default function ReviewActions() {
  const now = new Date();
  const weeklyDate = getNextSunday(now);
  const monthlyDate = getNextFirstSunday(now);
  const kpiRefreshDate = getNextFriday(now);

  const weeklyDays = daysUntil(weeklyDate, now);
  const monthlyDays = daysUntil(monthlyDate, now);
  const kpiDays = daysUntil(kpiRefreshDate, now);

  const weeklyLabel = `${formatMonthDay(weeklyDate)} (${dayLabel(weeklyDays)})`;
  const monthlyLabel = `${formatMonthDay(monthlyDate)} (${dayLabel(monthlyDays)})`;

  return (
    <article className="card">
      <h2>Upcoming Reviews</h2>

      <div className="review-action-row">
        <Link
          href={`/admin/reviews/weekly?scheduledFor=${formatLocalIsoDate(weeklyDate)}`}
          className="review-action-btn"
        >
          <span className="review-action-title">Weekly Review:</span>
          <span className="review-action-date">{weeklyLabel}</span>
        </Link>
        <Link
          href={`/admin/reviews/monthly?scheduledFor=${formatLocalIsoDate(monthlyDate)}`}
          className="review-action-btn"
        >
          <span className="review-action-title">Monthly Review:</span>
          <span className="review-action-date">{monthlyLabel}</span>
        </Link>
      </div>

      <table>
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
            <td>
              {formatMonthDay(kpiRefreshDate)} ({dayLabel(kpiDays)})
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
