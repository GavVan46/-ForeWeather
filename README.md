# ⛳ ForeWeather

Golf weather & course conditions — live at [fore-weather.com](https://fore-weather.com).

Green speed estimate, course firmness, wind club adjustment, best tee times and an 8-day outlook for any course in the world. Installable as an app (PWA) on Android and iPhone.

## How it works

A single static page (`index.html`) — no build step, no server. Each visitor's browser fetches data directly from the free [Open-Meteo](https://open-meteo.com) API:

- **Weather**: current conditions, 48-hour hourly forecast, 8-day daily outlook
- **Golf conditions**: green speed and firmness are derived from the weather model's land-surface simulation (soil moisture in the 0–1 cm and 3–9 cm layers) plus evapotranspiration — real modeled physics, though not a substitute for a stimpmeter reading
- **Best tee time**: scores every daylight hour on rain probability, wind, and temperature to find the most pleasant 4-hour window

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole site — markup, styles, and logic |
| `manifest.webmanifest` | PWA identity (name, icons, colors) |
| `sw.js` | Service worker — offline support, instant loads |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | App icons |

## Deploying

Any static host works (Netlify, Cloudflare Pages, GitHub Pages). Upload all files to the site root. HTTPS is required for geolocation and the service worker — all the hosts above provide it automatically.

## Data & attribution

Weather data by [Open-Meteo.com](https://open-meteo.com) (CC BY 4.0), free for non-commercial use. Geocoding by Open-Meteo's geocoding API.
