/* ForeWeather API — player course reports, stored in Cloudflare KV (binding: REPORTS) */

const CELL = n => (Math.round(n * 10) / 10).toFixed(1);

function sanitizeCourse(s) {
  return String(s || "").replace(/[^\w\s\-'&.,()]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
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

    const key = "cell:" + CELL(lat) + "," + CELL(lon);
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
    return env.ASSETS.fetch(request);
  }
};
