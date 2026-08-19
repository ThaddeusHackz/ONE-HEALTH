const base = process.env.TEST_BASE || "http://127.0.0.1:3000";

async function check(name, fn) {
  try {
    await fn();
    console.log("PASS", name);
  } catch (err) {
    console.error("FAIL", name, err.message);
    process.exitCode = 1;
  }
}

async function json(path, opts) {
  const res = await fetch(base + path, opts);
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

(async () => {
  await check("health keys configured flags", async () => {
    const { res, body } = await json("/api/health");
    if (!res.ok || !body.ok) throw new Error("health not ok");
  });
  await check("public config", async () => {
    const { body } = await json("/api/config");
    if (!body.content?.brandName) throw new Error("missing CMS content");
  });
  await check("forecast snapshot", async () => {
    const { body } = await json("/api/forecast?snapshot=1");
    if (!Array.isArray(body.snapshot) || body.snapshot.length < 5) throw new Error("snapshot thin");
  });
  await check("forecast malaria national", async () => {
    const { res, body } = await json("/api/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diseaseId: "malaria", regionId: "national", horizon: 4 }),
    });
    if (!res.ok) throw new Error(body.error || res.status);
    if (!body.ensemble?.points?.length) throw new Error("no ensemble");
    if (typeof body.diagnostics.latestCusum !== "number") throw new Error("missing CUSUM");
  });
  await check("admin reject", async () => {
    const { res } = await json("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x", password: "nope" }),
    });
    if (res.status !== 401) throw new Error("expected 401");
  });
  await check("admin login", async () => {
    const { res, body } = await json("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL || "admin@ghs.gov.gh", password: process.env.ADMIN_PASSWORD || "GhanaHealth2026!" }),
    });
    if (!res.ok || !body.ok) throw new Error(body.error || "login failed");
  });
  await check("official series upload", async () => {
    const header = "date,cases\n";
    const rows = Array.from({ length: 20 }, (_, i) => `2025-01-${String((i % 28) + 1).padStart(2, "0")},${10 + i}`).join("\n");
    const { res, body } = await json("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diseaseId: "cholera", regionId: "greater-accra", csv: header + rows }),
    });
    if (!res.ok) throw new Error(body.error || "series failed");
  });
  await check("redaction on chat payload", async () => {
    const { body } = await json("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Patient: Ama Mensah phone 0244123456 in Accra cholera watch" }],
        search: false,
        diseaseId: "cholera",
        regionId: "greater-accra",
      }),
    });
    if ((body.text || "").includes("0244123456")) throw new Error("phone leaked");
  });
  await check("pages", async () => {
    for (const p of ["/", "/forecast", "/vision", "/climate", "/admin/login"]) {
      const res = await fetch(base + p);
      if (!res.ok) throw new Error(`${p} ${res.status}`);
    }
  });
  if (process.exitCode) process.exit(1);
  console.log("ALL SELFTESTS PASSED");
})();
