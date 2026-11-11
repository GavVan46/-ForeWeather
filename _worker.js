/* ForeWeather API & pages — player course reports, course lookup, SEO pages, admin.
   Storage: Cloudflare KV (binding: REPORTS). */

const CELL = n => (Math.round(n * 10) / 10).toFixed(1);
const SITE = "https://fore-weather.com";

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

function stripCountry(n) { return String(n || "").replace(/\s*\([^)]*\)?$/, ""); } // also drops unclosed "(Coun…" fragments

/* Nominatim matches can include streets, shops and disc-golf — only directory-list names that look like real golf courses */
function looksLikeCourse(n) {
  const s = String(n || "").trim();
  if (s.split(/\s+/).length < 2) return false; // "Golf" alone is not a course
  if (!/\b(golf|country club|links)\b/i.test(s)) return false;
  if (/\bdisc\b/i.test(s)) return false;
  if (/\b(street|drive|lane|parkway|avenue|road|boulevard|blvd|homes)\b/i.test(s)) return false;
  return true;
}

function slugify(s) {
  return stripCountry(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* "Huddle Park GC" ≡ "Huddle Park Golf Club" — compare core names, ignoring common suffixes */
function courseKey(s) {
  return String(s || "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(golf|course|club|country|estate|links|gc|cc|the)\b/g, "")
    .replace(/\s+/g, " ").trim();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

function page(title, desc, body, opts = {}) {
  const robots = opts.noindex ? '<meta name="robots" content="noindex">' : "";
  const canonical = opts.canonical ? '<link rel="canonical" href="' + esc(opts.canonical) + '">' : "";
  const ld = opts.jsonld ? '<script type="application/ld+json">' + opts.jsonld + "</script>" : "";
  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + esc(title) + "</title>" +
    '<meta name="description" content="' + esc(desc) + '">' + robots + canonical + ld +
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E%E2%9B%B3%3C/text%3E%3C/svg%3E">' +
    "<style>" +
    ":root{color-scheme:light dark;--ink:#0f1c16;--muted:#5b6b64;--accent:#059669;--accent2:#0ea5e9;--card:rgba(255,255,255,.8);--border:rgba(15,40,30,.1);--bg:#eef4f1;}" +
    "@media (prefers-color-scheme:dark){:root{--ink:#e8f0ec;--muted:#93a69d;--accent:#34d399;--accent2:#38bdf8;--card:rgba(22,32,27,.8);--border:rgba(255,255,255,.1);--bg:#0b120e;}}" +
    "*{box-sizing:border-box;margin:0}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--ink);padding:20px;line-height:1.6}" +
    "main{max-width:760px;margin:0 auto}h1{font-size:26px;letter-spacing:-.02em;margin:14px 0 6px}h2{font-size:15px;margin:22px 0 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}" +
    "p{margin:10px 0;color:var(--ink)}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}" +
    ".crumb{font-size:13px;color:var(--muted)}.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px 18px;margin:14px 0}" +
    ".cta{display:inline-block;background:linear-gradient(90deg,#059669,#0d9488);color:#fff;padding:12px 20px;border-radius:12px;font-weight:650;margin:10px 0}" +
    ".rep{padding:8px 0;border-bottom:1px solid var(--border);font-size:14px}.rep:last-child{border-bottom:0}.rep b{margin-right:8px}.rep span{color:var(--muted)}" +
    "table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--border)}th{color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.05em}" +
    "ul.cl{columns:2;list-style:none;padding:0}ul.cl li{margin:4px 0;break-inside:avoid}.foot{margin:26px 0 8px;font-size:12.5px;color:var(--muted)}" +
    "</style></head><body><main>" + body + "</main></body></html>";
  const headers = { "content-type": "text/html; charset=utf-8" };
  if (opts.cache) headers["cache-control"] = "public, max-age=" + opts.cache;
  if (opts.noindex) headers["x-robots-tag"] = "noindex";
  return new Response(html, { status: opts.status || 200, headers });
}

/* ---------- course directory ---------- */

async function listAll(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const r = await env.REPORTS.list({ prefix, cursor });
    keys.push(...r.keys.map(k => k.name));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return keys;
}

async function allKnownCourses(env) {
  const seen = new Map(); // slug -> {n, la, lo}
  const add = (c, strict) => {
    if (!c || c.la == null || c.lo == null) return;
    const n = sanitizeCourse(stripCountry(c.n));
    const s = slugify(n);
    if (n.length < 3 || s.length < 3) return;
    if (strict && !looksLikeCourse(n)) return; // Nominatim-sourced names get quality-checked
    if (!seen.has(s)) seen.set(s, { n, la: c.la, lo: c.lo });
  };
  CUSTOM_COURSES.forEach(c => add(c, false));
  for (const key of await listAll(env, "courses2:")) {
    const list = await env.REPORTS.get(key, "json"); // OSM leisure=golf_course — trusted
    if (Array.isArray(list)) list.forEach(c => add(c, false));
  }
  for (const key of await listAll(env, "cq2:")) {
    const list = await env.REPORTS.get(key, "json");
    if (Array.isArray(list)) list.forEach(c => add(c, true));
  }
  for (const key of await listAll(env, "page:")) {
    add(await env.REPORTS.get(key, "json"), true);
  }
  return seen;
}

async function resolveCourse(env, slug) {
  const cached = await env.REPORTS.get("page:" + slug, "json");
  if (cached) return cached;
  const all = await allKnownCourses(env);
  let course = all.get(slug) || null;
  if (!course) {
    const q = slug.replace(/-/g, " ");
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=" + encodeURIComponent(q + " golf"),
        { headers: { "user-agent": "ForeWeather/1.0 (https://fore-weather.com)", "accept-language": "en" }, signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        const d = await r.json();
        for (const it of d) {
          const la = parseFloat(it.lat), lo = parseFloat(it.lon);
          const n = sanitizeCourse(String(it.display_name || "").split(",")[0]);
          if (!isFinite(la) || !isFinite(lo) || n.length < 3 || !looksLikeCourse(n)) continue;
          if (slugify(n) === slug || courseKey(n) === courseKey(q)) {
            course = { n, la: +la.toFixed(4), lo: +lo.toFixed(4) };
            break;
          }
        }
      }
    } catch (e) { /* Nominatim unavailable */ }
  }
  if (course) await env.REPORTS.put("page:" + slug, JSON.stringify(course), { expirationTtl: 90 * 86400 });
  return course;
}

async function reportsNear(env, lat, lon) {
  const keys = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      keys.push("cell:" + CELL(lat + dy * 0.1) + "," + CELL(lon + dx * 0.1));
  const lists = await Promise.all(keys.map(k => env.REPORTS.get(k, "json")));
  const cutoff = Date.now() - 7 * 864e5;
  return lists.flat().filter(r => r && r.t > cutoff).sort((a, b) => b.t - a.t);
}

function ago(t) {
  const h = Math.round((Date.now() - t) / 36e5);
  if (h < 1) return "just now";
  if (h < 24) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}

/* ---------- SEO pages ---------- */

async function handleCoursePage(request, env) {
  const url = new URL(request.url);
  const slug = url.pathname.slice("/course/".length).replace(/\/+$/, "").toLowerCase();
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return page("Not found", "Course not found", "<h1>Course not found</h1><p><a href='/courses'>Browse all courses</a></p>", { noindex: true, status: 404 });
  const course = await resolveCourse(env, slug);
  if (!course) {
    return page("Course not found — ForeWeather", "We couldn't find that golf course.",
      "<p class='crumb'><a href='/'>⛳ ForeWeather</a> › course</p><h1>Course not found</h1>" +
      "<p>We couldn't find a golf course matching this address. It may not be mapped yet.</p>" +
      "<p><a href='/courses'>Browse all known courses</a> or <a href='/'>search on the live dashboard</a>.</p>",
      { noindex: true, status: 404 });
  }
  const name = course.n;
  const all = await reportsNear(env, course.la, course.lo);
  const mine = all.filter(r => courseKey(r.course) === courseKey(name)).slice(0, 10);
  const appLink = "/?n=" + encodeURIComponent(name) + "&la=" + course.la + "&lo=" + course.lo;
  const repHtml = mine.length
    ? mine.map(r => "<div class='rep'><b>" + esc(r.course) + "</b><span>Greens " + (+r.g) + "/10 · Fairways " + (+r.f) + "/10 · Overall " + (+r.o) + "/10 · " + ago(r.t) + "</span></div>").join("")
    : "<p>No player reports for " + esc(name) + " in the last 7 days — <a href='" + esc(appLink) + "'>play a round and be the first to rate it</a>.</p>";
  const jsonld = JSON.stringify({
    "@context": "https://schema.org", "@type": "GolfCourse", name,
    geo: { "@type": "GeoCoordinates", latitude: course.la, longitude: course.lo },
    url: SITE + "/course/" + slug
  });
  const body =
    "<p class='crumb'><a href='/'>⛳ ForeWeather</a> › <a href='/courses'>courses</a> › " + esc(name) + "</p>" +
    "<h1>" + esc(name) + " — golf weather &amp; course conditions</h1>" +
    "<p>Live golf weather for <strong>" + esc(name) + "</strong>: current conditions, a soil-moisture-driven green speed estimate, " +
    "course firmness, wind club adjustment, the best tee times today and tomorrow, an 8-day outlook — and real course reports from players who have just walked the fairways.</p>" +
    "<a class='cta' href='" + esc(appLink) + "'>Open live conditions for " + esc(name) + " →</a>" +
    "<div class='card'><h2>Recent player reports</h2>" + repHtml + "</div>" +
    "<div class='card'><h2>About these conditions</h2>" +
    "<p>ForeWeather estimates green speed and firmness at " + esc(name) + " from the weather model's land-surface simulation — " +
    "soil moisture in the top 0–1&nbsp;cm and 3–9&nbsp;cm layers plus evapotranspiration. Real physics, not a stimpmeter: mowing, rolling and turf type matter too, " +
    "which is why player reports complete the picture. The best tee time scores every daylight hour on rain probability, wind and temperature.</p>" +
    "<p>Course location: " + course.la + ", " + course.lo + ". Weather data by Open-Meteo &amp; MET-style models; course data © OpenStreetMap contributors.</p></div>" +
    "<p class='foot'><a href='/'>ForeWeather home</a> · <a href='/courses'>All courses</a></p>";
  return page(name + " — Weather, Green Speed & Tee Times | ForeWeather",
    "Live golf weather for " + name + ": green speed estimate, course firmness, best tee times and player course reports.",
    body, { canonical: SITE + "/course/" + slug, jsonld, cache: 1800 });
}

async function handleCoursesIndex(request, env) {
  const all = await allKnownCourses(env);
  const items = [...all.entries()].sort((a, b) => a[1].n.localeCompare(b[1].n));
  const list = items.map(([slug, c]) => "<li><a href='/course/" + esc(slug) + "'>" + esc(c.n) + "</a></li>").join("");
  const body =
    "<p class='crumb'><a href='/'>⛳ ForeWeather</a> › courses</p>" +
    "<h1>Golf courses on ForeWeather</h1>" +
    "<p>Live weather, green speed estimates, best tee times and player reports for " + items.length + " golf courses and counting. " +
    "Courses appear here as golfers around the world use <a href='/'>the live dashboard</a> — can't find yours? Search it on the home page and it will join the list.</p>" +
    "<div class='card'><ul class='cl'>" + list + "</ul></div>" +
    "<p class='foot'><a href='/'>ForeWeather home</a></p>";
  return page("All golf courses — weather & conditions | ForeWeather",
    "Browse golf courses with live weather, green speed estimates and player condition reports on ForeWeather.",
    body, { canonical: SITE + "/courses", cache: 1800 });
}

async function handleSitemap(request, env) {
  const all = await allKnownCourses(env);
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "<url><loc>" + SITE + "/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n" +
    "<url><loc>" + SITE + "/courses</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n";
  for (const slug of all.keys()) {
    xml += "<url><loc>" + SITE + "/course/" + esc(slug) + "</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>\n";
  }
  xml += "</urlset>\n";
  return new Response(xml, { headers: { "content-type": "application/xml", "cache-control": "public, max-age=3600" } });
}

/* ---------- admin ---------- */

async function handleAdmin(request, env) {
  const url = new URL(request.url);
  if (!env.ADMIN_KEY) {
    return page("Admin — not configured", "ForeWeather admin",
      "<h1>Admin not configured</h1><p>Add a secret named <strong>ADMIN_KEY</strong> in your Cloudflare Pages project " +
      "(Settings → Variables and secrets), redeploy, then open <code>/admin?key=YOUR_KEY</code>.</p>", { noindex: true });
  }
  if ((url.searchParams.get("key") || "") !== env.ADMIN_KEY) {
    return page("Admin — access denied", "ForeWeather admin", "<h1>Access denied</h1><p>Wrong or missing key.</p>", { noindex: true, status: 403 });
  }
  // full archive from monthly logs, newest first
  const logKeys = (await listAll(env, "log:")).sort().reverse();
  const months = await Promise.all(logKeys.map(k => env.REPORTS.get(k, "json")));
  const allReports = months.flat().filter(Boolean).sort((a, b) => b.t - a.t);
  const thisMonth = "log:" + new Date().toISOString().slice(0, 7);
  const monthCount = logKeys.includes(thisMonth) ? (months[logKeys.indexOf(thisMonth)] || []).length : 0;
  const courses = new Set(allReports.map(r => courseKey(r.course)));
  const rows = allReports.slice(0, 500).map(r => {
    const d = new Date(r.t);
    const when = d.toISOString().slice(0, 16).replace("T", " ");
    const slug = slugify(r.course);
    return "<tr><td>" + when + "</td><td><a href='/course/" + esc(slug) + "'>" + esc(r.course) + "</a></td>" +
      "<td>" + (+r.g) + "</td><td>" + (+r.f) + "</td><td>" + (+r.o) + "</td>" +
      "<td>" + (r.lat != null ? r.lat + ", " + r.lon : "—") + "</td></tr>";
  }).join("");
  const body =
    "<h1>⛳ ForeWeather admin — course reviews</h1>" +
    "<div class='card'><p><strong>" + allReports.length + "</strong> reviews all-time · <strong>" + monthCount + "</strong> this month · " +
    "<strong>" + courses.size + "</strong> distinct courses. Archive is permanent; the public site shows the last 7 days only. Showing newest 500.</p></div>" +
    "<div class='card'><table><tr><th>When (UTC)</th><th>Course</th><th>Greens</th><th>Fairways</th><th>Overall</th><th>Area (lat, lon)</th></tr>" +
    (rows || "<tr><td colspan='6'>No archived reviews yet — the archive starts with the first review submitted after this feature went live.</td></tr>") +
    "</table></div>";
  return page("ForeWeather admin", "Course review archive", body, { noindex: true });
}

/* ---------- courses API ---------- */

async function handleCourses(request, env) {
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get("lat"));
  const lon = parseFloat(url.searchParams.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) return json({ error: "lat/lon required" }, 400);
  const cla = Math.round(lat), clo = Math.round(lon);
  const key = "courses2:" + cla + "," + clo;
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
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(20000) // a hanging mirror gets skipped, not waited on
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
        courses.push({ n: clean, la: +(+la).toFixed(4), lo: +(+lo).toFixed(4) });
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
      { headers: { "user-agent": "ForeWeather/1.0 (https://fore-weather.com)", "accept-language": "en" }, signal: AbortSignal.timeout(10000) }
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

/* ---------- reports API ---------- */

async function handleReports(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const lat = parseFloat(url.searchParams.get("lat"));
    const lon = parseFloat(url.searchParams.get("lon"));
    if (!isFinite(lat) || !isFinite(lon)) return json({ error: "lat/lon required" }, 400);
    const all = await reportsNear(env, lat, lon);
    return json({ reports: all.slice(0, 30) });
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

    // permanent archive (monthly logs) for the admin backend
    try {
      const mk = "log:" + new Date().toISOString().slice(0, 7);
      const log = (await env.REPORTS.get(mk, "json")) || [];
      log.unshift({ t: Date.now(), course, g, f, o, lat: +plat.toFixed(2), lon: +plon.toFixed(2) });
      await env.REPORTS.put(mk, JSON.stringify(log.slice(0, 2000)));
    } catch (e) { /* archive is best-effort */ }

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
    if (url.pathname === "/sitemap.xml") return handleSitemap(request, env);
    if (url.pathname === "/courses") return handleCoursesIndex(request, env);
    if (url.pathname.startsWith("/course/")) return handleCoursePage(request, env);
    if (url.pathname === "/admin") return handleAdmin(request, env);
    return env.ASSETS.fetch(request);
  }
};
