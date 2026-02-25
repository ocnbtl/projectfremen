# KPI Definitions

This file locks KPI meaning so names and values stay consistent.

Owner types:

1. `Me`
2. `AI Agent`
3. `Auto`

## Unigentamos (Project Fremen)

### 1) Documentation Coverage

1. Definition: How many of the 12 Unigentamos business coverage areas currently have up-to-date docs.
2. Value format: `X / 12`
3. Source (now): Manual count from docs index and notes.
4. Source (target): Auto count from tagged docs coverage map.
5. Update cadence: Weekly review.
6. Owner default: `Me`
7. Desired direction: Up.

### 2) Open Blockers

1. Definition: Number of active blockers that prevent progress this week.
2. Value format: Integer (example: `3`).
3. Source (now): Dashboard task/blocker list.
4. Source (target): Auto count from task system status.
5. Update cadence: Weekly review.
6. Owner default: `Me`
7. Desired direction: Down.

## pngwn (Project Iceflake)

### 1) Waitlist Signups (Total)

1. Definition: Total number of unique users on waitlist.
2. Value format: Integer (example: `420`).
3. Source (now): Manual from form/backend source of truth.
4. Source (target): Auto from waitlist DB/API.
5. Update cadence: Weekly review.
6. Owner default: `AI Agent` (or `Auto` once integration is complete).
7. Desired direction: Up.

### 2) Waitlist Signups (Past 7 Days)

1. Definition: New unique waitlist signups in last 7 days, plus trend vs previous 7 days.
2. Value format: `X (+Y%)` or `X (-Y%)` or `X (0%)`.
3. Source (now): Manual calculation.
4. Source (target): Auto from waitlist analytics query.
5. Update cadence: Weekly review.
6. Owner default: `AI Agent`.
7. Desired direction: Up.

### 3) Errors Reported in Sentry

1. Definition: Count of new or unresolved errors in selected review window.
2. Value format: Integer (example: `12`).
3. Source (now): Sentry UI.
4. Source (target): Auto from Sentry API.
5. Update cadence: Weekly review.
6. Owner default: `AI Agent`.
7. Desired direction: Down.

### 4) Unread Emails (Zoho)

1. Definition: Number of unread business emails in main inbox.
2. Value format: Integer.
3. Source (now): Zoho inbox UI.
4. Source (target): Auto from Zoho API.
5. Update cadence: Weekly review.
6. Owner default: `AI Agent`.
7. Desired direction: Down.

### 5) Total Website Impressions

1. Definition: Total impressions in the selected analytics window plus trend vs prior window.
2. Value format: `X (+Y%)` or `X (-Y%)` or `X (0%)`.
3. Source (now): Manual from web analytics dashboard.
4. Source (target): Auto from analytics API.
5. Update cadence: Weekly review.
6. Owner default: `AI Agent`.
7. Desired direction: Up.

## Diyesu Decor (Project Pint)

### 1) Pins Published This Week

1. Definition: Number of new pins published in current week against weekly goal.
2. Value format: `X / Goal` (example: `8 / 25`).
3. Source (now): Manual from publishing log/platform.
4. Source (target): Auto from content scheduler/API.
5. Update cadence: Weekly review.
6. Owner default: `Me` (or `AI Agent` if scheduling is automated).
7. Desired direction: Up.

### 2) Blogs Published This Week

1. Definition: Number of blogs published this week against weekly goal.
2. Value format: `X / Goal` (example: `1 / 3`).
3. Source (now): Manual from CMS.
4. Source (target): Auto from CMS API.
5. Update cadence: Weekly review.
6. Owner default: `Me`.
7. Desired direction: Up.

### 3) Outbound Clicks from Pinterest

1. Definition: Total outbound clicks from Pinterest in review window plus trend.
2. Value format: `X (+Y%)` or `X (-Y%)` or `X (0%)`.
3. Source (now): Manual from Pinterest analytics.
4. Source (target): Auto from Pinterest API.
5. Update cadence: Weekly review.
6. Owner default: `AI Agent`.
7. Desired direction: Up.

### 4) Total Website Impressions

1. Definition: Total site impressions in review window plus trend.
2. Value format: `X (+Y%)` or `X (-Y%)` or `X (0%)`.
3. Source (now): Manual from analytics platform.
4. Source (target): Auto from analytics API.
5. Update cadence: Weekly review.
6. Owner default: `AI Agent`.
7. Desired direction: Up.

### 5) Total Email Newsletter Signups

1. Definition: Total unique newsletter subscribers.
2. Value format: Integer.
3. Source (now): Manual from email platform.
4. Source (target): Auto from email platform API.
5. Update cadence: Weekly review.
6. Owner default: `AI Agent`.
7. Desired direction: Up.

### 6) Email Newsletter Signups (Past 7 Days)

1. Definition: New newsletter subscribers in past 7 days plus trend.
2. Value format: `X (+Y%)` or `X (-Y%)` or `X (0%)`.
3. Source (now): Manual from email platform.
4. Source (target): Auto from email platform API.
5. Update cadence: Weekly review.
6. Owner default: `AI Agent`.
7. Desired direction: Up.

### 7) Unread Emails (Zoho)

1. Definition: Number of unread business emails in main inbox.
2. Value format: Integer.
3. Source (now): Zoho inbox UI.
4. Source (target): Auto from Zoho API.
5. Update cadence: Weekly review.
6. Owner default: `AI Agent`.
7. Desired direction: Down.

## Lock Rules

1. Do not create new KPI names unless required.
2. If a KPI must be changed, update this doc first.
3. Keep value format exactly as defined so dashboard parsing stays accurate.
4. Stale threshold default for operations: 14 days.
