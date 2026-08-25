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
  await check("DHIMS2 parser quality", async () => {
    const csv = "week_ending,region,disease,cases\n" + Array.from({ length: 12 }, (_, i) => `2025-0${(i % 9) + 1}-0${(i % 8) + 1},Greater Accra,Cholera,${4 + i}`).join("\n");
    const { res, body } = await json("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diseaseId: "cholera", regionId: "greater-accra", csv }),
    });
    if (!res.ok) throw new Error(body.error || "dhims2 failed");
    if (!body.quality || typeof body.quality.completeness !== "number") throw new Error("no quality log");
  });
  await check("nowcast interval", async () => {
    const { res, body } = await json("/api/nowcast?disease=malaria&region=national&ai=0");
    if (!res.ok) throw new Error("nowcast failed");
    if (!(body.nowcast?.current?.high >= body.nowcast?.current?.nowcast)) throw new Error("nowcast interval inverted");
  });
  await check("event archive grows", async () => {
    const before = (await json("/api/health")).body.archive?.bytes || 0;
    await json("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diseaseId: "measles",
        regionId: "northern",
        csv: "date,cases\n" + Array.from({ length: 10 }, (_, i) => `2025-02-${String(i + 10).padStart(2, "0")},${i + 3}`).join("\n"),
      }),
    });
    const after = (await json("/api/health")).body.archive?.bytes || 0;
    if (after < before) throw new Error("archive did not grow");
  });
  await check("field brief offline card", async () => {
    const { res, body } = await json("/api/field-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diseaseId: "malaria", regionId: "northern", language: "tw" }),
    });
    if (!res.ok || !body.text) throw new Error("field brief empty");
  });
  await check("agent capability registry", async () => {
    const { res, body } = await json("/api/agent");
    if (!res.ok) throw new Error("GET /api/agent failed");
    const names = (body.tools || []).map((t) => t.name);
    for (const need of ["web_search", "image_generate", "vision_read", "sandbox_exec", "chart", "deep_research", "memory_save", "create_file"]) {
      if (!names.includes(need)) throw new Error("missing tool " + need);
    }
    if (typeof body.configured !== "boolean") throw new Error("configured flag missing");
  });

  await check("agent nav position", async () => {
    const { body } = await json("/api/config");
    const hrefs = (body.nav || []).map((n) => n.href);
    if (hrefs[0] !== "/" || hrefs[1] !== "/agent" || hrefs[2] !== "/forecast") {
      throw new Error("nav order wrong: " + hrefs.slice(0, 4).join(","));
    }
  });

  await check("agent memory CRUD", async () => {
    const saved = await json("/api/agent/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fact: "Selftest: field team in Wa reports every Tuesday", tag: "project" }),
    });
    if (!saved.body.fact?.id) throw new Error("fact not saved");
    const listed = await json("/api/agent/memory");
    if (!listed.body.facts.some((f) => f.id === saved.body.fact.id)) throw new Error("fact not listed");
    const recalled = await json("/api/agent/memory?q=Wa Tuesday");
    if (!recalled.body.facts.some((f) => f.id === saved.body.fact.id)) throw new Error("recall missed");
    await json("/api/agent/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: saved.body.fact.id }),
    });
  });

  await check("agent workspace file round-trip", async () => {
    const name = "selftest-http.html";
    const created = await json("/api/agent/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content: "<h1>HTTP selftest</h1>", language: "html" }),
    });
    if (!created.body.file?.name) throw new Error("file not created");
    const read = await json("/api/agent/files?name=" + name);
    if (!/HTTP selftest/.test(read.body.file?.content || "")) throw new Error("content lost");
    await json("/api/agent/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delete: name }),
    });
  });

  await check("agent stream responds without a key (offline mode)", async () => {
    const res = await fetch(base + "/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns: [{ role: "user", content: "Hello" }], mode: "chat" }),
    });
    if (!res.ok) throw new Error("agent stream " + res.status);
    const text = await res.text();
    if (!/event: result/.test(text)) throw new Error("no result frame: " + text.slice(0, 120));
    if (!/data:/.test(text)) throw new Error("no data frames");
  });

  await check("agent rejects an oversized body (512MB Render instance)", async () => {
    // The cap is 40 MB (5 attachments × 6 MB base64); anything larger belongs
    // in the workspace through the chunked 2 GB upload endpoint.
    const res = await fetch(base + "/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns: [{ role: "user", content: "x".repeat(42_000_000) }] }),
    });
    if (res.status !== 413) throw new Error("expected 413, got " + res.status);
  });

  await check("agent accepts top-level attachments (the vision pipeline)", async () => {
    // useAgent sends attachments as a top-level array; the route must merge
    // them onto the last user turn or vision_read runs blind.
    const res = await fetch(base + "/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turns: [{ role: "user", content: "what is in my photo?" }],
        mode: "vision",
        attachments: [
          { name: "photo.png", mime: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=", kind: "image", bytes: 5 },
          { junk: true },
        ],
      }),
    });
    if (!res.ok) throw new Error("status " + res.status);
    const text = await res.text();
    if (!/event: result/.test(text)) throw new Error("no result frame: " + text.slice(0, 120));
  });

  await check("vision and ingest endpoints refuse oversized files", async () => {
    const big = new File([Buffer.alloc(9 * 1024 * 1024, 1)], "huge.png", { type: "image/png" });
    const fd = new FormData();
    fd.append("files", big);
    const v = await fetch(base + "/api/vision", { method: "POST", body: fd });
    if (v.status !== 413) throw new Error("vision expected 413, got " + v.status);
    const fd2 = new FormData();
    fd2.append("files", big);
    const i = await fetch(base + "/api/ingest", { method: "POST", body: fd2 });
    if (i.status !== 413) throw new Error("ingest expected 413, got " + i.status);
  });

  await check("transcribe refuses audio over the 25 MB Whisper limit", async () => {
    const fd = new FormData();
    fd.append("audio", new File([Buffer.alloc(26 * 1024 * 1024, 1)], "huge.webm", { type: "audio/webm" }));
    const res = await fetch(base + "/api/transcribe", { method: "POST", body: fd });
    if (res.status !== 413) throw new Error("expected 413, got " + res.status);
  });

  await check("agent rejects malformed JSON", async () => {
    const res = await fetch(base + "/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    if (res.status !== 400) throw new Error("expected 400, got " + res.status);
  });

  await check("streaming responses are not compressed", async () => {
    const res = await fetch(base + "/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Encoding": "gzip" },
      body: JSON.stringify({ turns: [{ role: "user", content: "ping" }] }),
    });
    const enc = res.headers.get("content-encoding");
    if (enc && /gzip|br/i.test(enc)) throw new Error("SSE is being compressed: " + enc);
    if (!/text\/event-stream/.test(res.headers.get("content-type") || "")) {
      throw new Error("wrong content type: " + res.headers.get("content-type"));
    }
    await res.text();
  });

  await check("agent rejects empty payload", async () => {
    const res = await fetch(base + "/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status !== 400) throw new Error("expected 400, got " + res.status);
  });

  await check("agent image endpoint validates input", async () => {
    const res = await fetch(base + "/api/agent/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status !== 400) throw new Error("expected 400, got " + res.status);
    const models = await json("/api/agent/images");
    if (!Array.isArray(models.body.imageModels) || models.body.imageModels.length < 3) throw new Error("no image model chain");
  });

  await check("transcribe degrades without audio", async () => {
    const form = new FormData();
    const res = await fetch(base + "/api/transcribe", { method: "POST", body: form });
    if (res.status !== 400) throw new Error("expected 400, got " + res.status);
  });

  await check("tts validates input", async () => {
    const res = await fetch(base + "/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    if (res.status !== 400) throw new Error("expected 400, got " + res.status);
  });

  await check("pages", async () => {
    for (const p of ["/", "/agent", "/forecast", "/vision", "/climate", "/extracts", "/field", "/admin/login"]) {
      const res = await fetch(base + p);
      if (!res.ok) throw new Error(`${p} ${res.status}`);
      if (p === "/agent") {
        const html = await res.text();
        if (!/ONE HEALTH AI/.test(html)) throw new Error("agent page missing its title");
        if (!/sandbox/i.test(html)) throw new Error("agent page missing the sandbox surface");
      }
    }
  });
  if (process.exitCode) process.exit(1);
  console.log("ALL SELFTESTS PASSED");
})();
