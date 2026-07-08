/* ForeWeather API — player course reports, stored in Cloudflare KV (binding: REPORTS) */

const CELL = n => (Math.round(n * 10) / 10).toFixed(1);

function sanitizeCourse(s) {
  return String(s || "").replace(/[^\w\s\-'&.,()]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/* Courses missing from OpenStreetMap — curated by hand. Add more as players report gaps. */
const CUSTOM_COURSES = [
  { n: "Huddle Park Golf Club", la: -26.163, lo: 28.118 }
];

function withCustom(courses, cla, clo) {
  const out = courses.slice();
  for (const c of CUSTOM_COURSES) {
    const dLat = (c.la - cla) * 110.6;
    const dLon = (c.lo - clo) * 111.3 * Math.cos(cla * Math.PI / 180);
    if (Math.sqrt(dLat * dLat + dLon * dLon) > 150) continue;
    if (!out.some(x => x.n.toLowerCase() === c.n.toLowerCase())) out.push(c);
  }
  return out.sort((a, b) => a.n.localeCompare(b.n));
}

async function handleCourses(request, env) {
  const url = new URL(request.url);
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
  const lat = parseFloat(url.searchParams.get("lat"));
  const lon = parseFloat(url.searchParams.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) return json({ error: "lat/lon required" }, 400);
  const cla = Math.round(lat), clo = Math.round(lon);
  const key = "courses2:" + cla + "," + clo; // v2: 150 km radius
  const cached = await env.REPORTS.get(key, "json");
  if (cached && cached.length) return json({ courses: withCustom(cached, cla, clo) }); // ignore stale empty caches

  let courses = [];
  const q = '[out:json][timeout:25];nwr["leisure"="golf_course"]["name"](around:150000,' + cla + "," + clo + ");out center tags 400;";
  const MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
  ];
  const debug = [];
  for (const mirror of MIRRORS) {
    try {
      const r = await fetch(mirror, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "ForeWeather/1.0 (https://fore-weather.com)"
        },
        body: "data=" + encodeURIComponent(q)
      });
      debug.push(mirror.split("/")[2] + ": HTTP " + r.status);
      if (!r.ok) continue; // rate-limited or down — try next mirror
      const d = await r.json();
      debug.push("elements: " + ((d.elements || []).length));
      const seen = new Set();
      for (const el of d.elements || []) {
        const name = el.tags && el.tags.name;
        const la = el.lat != null ? el.lat : el.center && el.center.lat;
        const lo = el.lon != null ? el.lon : el.center && el.center.lon;
        if (!name || la == null || lo == null) continue;
        const clean = sanitizeCourse(name);
        if (clean.length < 2 || seen.has(clean.toLowerCase())) continue;
        seen.add(clean.toLowerCase());
        courses.push({ n: clean, la: +la.toFixed(4), lo: +lo.toFixed(4) });
      }
      courses.sort((a, b) => a.n.localeCompare(b.n));
      courses = courses.slice(0, 400);
      if (courses.length) await env.REPORTS.put(key, JSON.stringify(courses), { expirationTtl: 30 * 86400 });
      break; // this mirror answered — done
    } catch (e) { debug.push(mirror.split("/")[2] + ": " + ((e && e.message) || "error")); }
  }
  const out = { courses: withCustom(courses, cla, clo) };
  if (url.searchParams.get("debug")) out.debug = debug;
  return json(out);
}

async function handleFindCourse(request, env) {
  const url = new URL(request.url);
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
  const q = sanitizeCourse(url.searchParams.get("q"));
  if (q.length < 3) return json({ courses: [] });
  const customHits = CUSTOM_COURSES.filter(c => c.n.toLowerCase().includes(q.toLowerCase()));
  const key = "cq2:" + q.toLowerCase();
  const cached = await env.REPORTS.get(key, "json");
  if (cached) return json({ courses: customHits.concat(cached.filter(c => !customHits.some(h => h.n === c.n))) });

  const courses = [];
  try {
    const r = await fetch(
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=" + encodeURIComponent(q + " golf"),
      { headers: { "user-agent": "ForeWeather/1.0 (https://fore-weather.com)", "accept-language": "en" } }
    );
    if (r.ok) {
      const d = await r.json();
      for (const it of d) {
        const la = parseFloat(it.lat), lo = parseFloat(it.lon);
        if (!isFinite(la) || !isFinite(lo)) continue;
        const parts = String(it.display_name || "").split(",");
        let n = sanitizeCourse(parts[0]);
        if (n.length < 2) continue;
        const country = parts.length > 1 ? sanitizeCourse(parts[parts.length - 1]) : "";
        if (country) n = (n + " (" + country + ")").slice(0, 60);
        courses.push({ n, la: +la.toFixed(4), lo: +lo.toFixed(4) });
      }
      // only cache hits — misses stay fresh so newly-mapped courses appear quickly
      if (courses.length) await env.REPORTS.put(key, JSON.stringify(courses), { expirationTtl: 7 * 86400 });
    }
  } catch (e) { /* Nominatim unavailable */ }
  return json({ courses: customHits.concat(courses.filter(c => !customHits.some(h => h.n === c.n))) });
}

async function handleReports(request, env) {
  const url = new URL(request.url);
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

  if (request.method === "GET") {
    const lat = parseFloat(url.searchParams.get("lat"));
    const lon = parseFloat(url.searchParams.get("lon"));
    if (!isFinite(lat) || !isFinite(lon)) return json({ error: "lat/lon required" }, 400);
    const keys = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        keys.push("cell:" + CELL(lat + dy * 0.1) + "," + CELL(lon + dx * 0.1));
    const lists = await Promise.all(keys.map(k => env.REPORTS.get(k, "json")));
    const cutoff = Date.now() - 7 * 864e5;
    const all = lists.flat()
      .filter(r => r && r.t > cutoff)
      .sort((a, b) => b.t - a.t)
      .slice(0, 30);
    return json({ reports: all });
  }

  if (request.method === "POST") {
    let b;
    try { b = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    const lat = parseFloat(b.lat), lon = parseFloat(b.lon);
    const course = sanitizeCourse(b.course);
    const g = Math.round(+b.greens), f = Math.round(+b.fairways), o = Math.round(+b.overall);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      return json({ error: "bad location" }, 400);
    if (course.length < 2) return json({ error: "course name required" }, 400);
    for (const v of [g, f, o])
      if (!(v >= 1 && v <= 10)) return json({ error: "ratings must be 1-10" }, 400);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const rlKey = "rl:" + ip;
    if (await env.REPORTS.get(rlKey))
      return json({ error: "Easy tiger — one report every 5 minutes." }, 429);
    await env.REPORTS.put(rlKey, "1", { expirationTtl: 300 });

    // pin to the course's own location when provided (from the autocomplete picker)
    let plat = lat, plon = lon;
    const clat = parseFloat(b.clat), clon = parseFloat(b.clon);
    if (isFinite(clat) && isFinite(clon) && Math.abs(clat) <= 90 && Math.abs(clon) <= 180) {
      plat = clat; plon = clon;
    }
    const key = "cell:" + CELL(plat) + "," + CELL(plon);
    const list = (await env.REPORTS.get(key, "json")) || [];
    list.unshift({ t: Date.now(), course, g, f, o });
    const cutoff = Date.now() - 7 * 864e5;
    await env.REPORTS.put(key, JSON.stringify(list.filter(r => r.t > cutoff).slice(0, 100)));
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/reports") return handleReports(request, env);
    if (url.pathname === "/api/courses") return handleCourses(request, env);
    if (url.pathname === "/api/findcourse") return handleFindCourse(request, env);
    return env.ASSETS.fetch(request);
  }
};
