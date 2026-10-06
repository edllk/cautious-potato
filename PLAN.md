# Project 2: "Do I need a mask?" (PM2.5 check page)

Agreed on 2026-10-06, through a Five Whys interview guided by IDG Product Thinking.

## What we're building
A **passive web page** you open before heading out. It answers one question: *should I bring a mask?*
You pick your region and threshold. The page shows the current PM2.5 reading, the trend over the last two hours, a rough projection for the next couple of hours, and a clear verdict.

## Why (Five Whys chain)
1. **Idea:** alert me to put on a mask when PM2.5 is over 100.
2. **Why an alert?** A mask is only useful if it's on hand. The real failure is getting caught outside without one.
3. **Why does that happen?** By the time you notice the air is bad, you've already left. So you need a heads-up *before* you go, which means some kind of forecast.
4. **Why not push alerts?** Notifications need permissions and an open tab. A page you check before leaving is enough and is less intrusive.
5. **Why let users choose region and threshold?** Air quality differs across the island (one morning: 42 in the south, 95 in central), and people have different sensitivities (asthma, elderly, children, runners).

**Problem statement:** People in Singapore who go outdoors get caught in poor air without a mask, because the raw PM2.5 number doesn't tell them what to do or whether it's getting worse.

## Scope (v1)
- **Region picker:** north / south / east / west / central.
- **Threshold:** user-adjustable, with recommended presets (see below).
- **Current reading** for the chosen region, with its NEA band (Normal / Elevated / High / Very High).
- **2-hour trend:** rising / falling / steady, with the rate per hour.
- **Projection:** estimated readings for the next 1–2 hours, clearly labelled as a rough estimate.
- **Verdict**, with three states, checked in this order:
  1. **Bring a mask:** the current *or* projected reading reaches the threshold.
  2. **Keep one handy:** the trend is rising *and* the current or projected reading is within 15 of the threshold. This covers the uncertainty in a rough projection: pack a mask, even if you don't need to wear it yet.
  3. **No mask needed:** anything else.
- Region and threshold are remembered in `localStorage` (no accounts, no permissions).
- "Last updated" time, and a refresh when the page is reopened or refocused.

## Out of scope (for now)
- Push or browser notifications, email, SMS.
- Geolocation (the user picks their region instead).
- Long-range forecasts or other data sources (e.g. NEA's 24-hour outlook).
- Accounts, server, database.

## Data
- Endpoint: `https://api-open.data.gov.sg/v2/real-time/api/pm25?date=YYYY-MM-DD` (Singapore date).
- Returns every hourly reading for that day as `items[].readings.pm25_one_hourly.{north,south,east,west,central}`.
- CORS is open (`access-control-allow-origin: *`), so the page can call it straight from the browser.
- Items come back **newest first**. Sort by `timestamp` rather than relying on that order.
- Before 02:00, fetch **yesterday's** data too, so we still have three hourly points.

## Projection method
Use the three most recent hourly readings `r0` (latest), `r1`, `r2` (two hours earlier):
- `slope = (r0 - r2) / 2` per hour
- `projected(+h) = max(0, r0 + slope × h)` for h = 1, 2
- Trend label: |slope| < 2 → steady; otherwise rising / falling.
- If the readings aren't evenly spaced (a missed hour), divide by the actual hours between them. Skip the trend if they're more than 3 hours apart.
- If readings are missing, show the current reading only and say a trend isn't available.

This is a straight-line extrapolation, not a real forecast. The page should say so.

## Threshold recommendations
NEA's 1-hour PM2.5 bands (µg/m³): **0–55 Normal · 56–150 Elevated · 151–250 High · 251+ Very High**.

Presets offered in the UI. These are our own suggestions based on the bands, not official NEA advice:
| Preset | Threshold | For |
|---|---|---|
| Sensitive | 56 | Asthma or heart/lung conditions, elderly, children, pregnant |
| Moderate (default) | 100 | Most adults |
| Tolerant | 151 | Healthy adults, short time outdoors |

The user can also enter any custom value.

## Build
- Plain static files: `index.html`, `style.css`, `app.js` (same style as `project1.2`).
- Serve locally with `python3 -m http.server` from `project2/`.

## Open questions
- How should we measure success? e.g. "I checked before leaving and had a mask when I needed one."
