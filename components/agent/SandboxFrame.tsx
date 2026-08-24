"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SandboxResult } from "@/lib/agent/types";

/**
 * In-built sandbox.
 *
 * Two opaque-origin iframes (no allow-same-origin, so no access to our cookies,
 * localStorage, DOM or session):
 *   - runner  : hidden; executes JavaScript / Python (Pyodide) / JSON and
 *               streams stdout back over postMessage
 *   - preview : visible; renders HTML / SVG / CSS artefacts
 *
 * The agent calls into this through `sandbox_exec`; the parent relays the
 * result back to the model so it can iterate on real output.
 */

export type SandboxLanguage = "javascript" | "html" | "python" | "css" | "svg" | "json";

export interface SandboxHandle {
  run: (req: { callId: string; code: string; language: SandboxLanguage }) => Promise<SandboxResult>;
}

interface BridgeMessage {
  __ohg?: boolean;
  type?: string;
  runId?: string;
  text?: string;
  level?: string;
  ok?: boolean;
  stdout?: string;
  result?: string;
  error?: string;
  ms?: number;
}

const RUNTIME = `<!doctype html>
<html><head><meta charset="utf-8"><title>ohg-sandbox</title></head>
<body>
<script>
(function () {
  var send = function (m) { try { parent.postMessage(Object.assign({ __ohg: true }, m), "*"); } catch (e) {} };
  var logs = [];
  function fmt(v) {
    if (typeof v === "string") return v;
    if (v instanceof Error) return v.stack || v.message;
    try { return JSON.stringify(v, function (k, val) {
      if (typeof val === "function") return "[Function " + (val.name || "anonymous") + "]";
      if (typeof val === "undefined") return "undefined";
      return val;
    }, 2); } catch (e) { return String(v); }
  }
  ["log", "info", "warn", "error", "debug"].forEach(function (k) {
    console[k] = function () {
      var line = Array.prototype.slice.call(arguments).map(fmt).join(" ");
      logs.push(line);
      send({ type: "log", level: k, text: line });
    };
  });
  window.addEventListener("error", function (e) {
    send({ type: "log", level: "error", text: e.message + (e.lineno ? " (line " + e.lineno + ")" : "") });
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    send({ type: "log", level: "error", text: "Unhandled rejection: " + ((r && (r.stack || r.message)) || r) });
  });

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Could not load " + src + " - the sandbox needs network access for the Python runtime.")); };
      document.head.appendChild(s);
    });
  }

  async function runPython(code) {
    if (!window.pyodide) {
      send({ type: "log", level: "info", text: "Loading Pyodide runtime (one-time download)…" });
      await loadScript("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
      window.pyodide = await window.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
      send({ type: "log", level: "info", text: "Pyodide ready." });
    }
    window.pyodide.setStdout({ batched: function (s) { logs.push(s); send({ type: "log", level: "info", text: s }); } });
    window.pyodide.setStderr({ batched: function (s) { logs.push(s); send({ type: "log", level: "error", text: s }); } });
    var out = await window.pyodide.runPythonAsync(code);
    return out === undefined ? undefined : String(out);
  }

  async function runJs(code) {
    var wrapper = new Function("return (async () => {" + code + "\\n})();");
    var out = await wrapper();
    return out === undefined ? undefined : fmt(out);
  }

  async function handle(msg) {
    var runId = msg.runId;
    logs = [];
    var t0 = Date.now();
    try {
      var result;
      if (msg.language === "python") result = await runPython(msg.code);
      else if (msg.language === "json") {
        var parsed = JSON.parse(msg.code);
        result = "Valid JSON: " + (Array.isArray(parsed) ? parsed.length + " items" : typeof parsed) + "\\n" + fmt(parsed).slice(0, 4000);
      } else result = await runJs(msg.code);
      send({ type: "result", runId: runId, ok: true, stdout: logs.join("\\n"), result: result, ms: Date.now() - t0 });
    } catch (err) {
      send({ type: "result", runId: runId, ok: false, stdout: logs.join("\\n"), error: (err && (err.stack || err.message)) || String(err), ms: Date.now() - t0 });
    }
  }

  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || !d.__ohg_run) return;
    handle(d);
  });

  send({ type: "ready" });
})();
</script>
</body></html>`;

const TIMEOUT_MS: Record<string, number> = { python: 180000, javascript: 45000, json: 5000 };

function buildPreview(language: SandboxLanguage, code: string): string {
  if (language === "html") return code;
  if (language === "svg") {
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f8fb}svg{max-width:96vw;height:auto}</style></head><body>${code}</body></html>`;
  }
  if (language === "css") {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${code}</style></head><body>
<div class="demo-card"><h1>ONE HEALTH GHANA</h1><p>Live CSS preview. Edit the stylesheet and re-run.</p>
<button class="demo-btn">Primary action</button><span class="badge">badge</span></div></body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:ui-sans-serif,system-ui;background:#f6f8fb;color:#0a1020;padding:2rem}pre{background:#0a1020;color:#e6ecf5;padding:1rem;border-radius:14px;overflow:auto}</style></head><body><pre id="out"></pre><script>
  var out = document.getElementById("out");
  try {
    var value = ${language === "json" ? "JSON.stringify(JSON.parse(" + JSON.stringify(code) + "), null, 2)" : JSON.stringify(code)};
    out.textContent = value;
  } catch (e) { out.textContent = "Parse error: " + e.message; }
</script></body></html>`;
}

export function SandboxFrame({
  onReady,
  onLog,
  preview,
}: {
  onReady?: (handle: SandboxHandle) => void;
  onLog?: (line: { level: string; text: string }) => void;
  preview: { language: SandboxLanguage; code: string } | null;
}) {
  const runnerRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<Map<string, (r: SandboxResult) => void>>(new Map());
  const [status, setStatus] = useState<"booting" | "ready" | "error">("booting");

  const run = useCallback((req: { callId: string; code: string; language: SandboxLanguage }) => {
    return new Promise<SandboxResult>((resolve) => {
      const frame = runnerRef.current;
      if (!frame?.contentWindow) {
        resolve({ callId: req.callId, ok: false, stdout: "", error: "Sandbox frame not mounted.", ms: 0 });
        return;
      }
      const timeout = TIMEOUT_MS[req.language] || 30000;
      const timer = setTimeout(() => {
        if (pendingRef.current.has(req.callId)) {
          pendingRef.current.delete(req.callId);
          resolve({ callId: req.callId, ok: false, stdout: "", error: `Sandbox timed out after ${timeout / 1000}s.`, ms: timeout });
        }
      }, timeout);

      pendingRef.current.set(req.callId, (r) => {
        clearTimeout(timer);
        resolve(r);
      });

      frame.contentWindow.postMessage(
        { __ohg_run: true, runId: req.callId, code: req.code, language: req.language },
        "*",
      );
    });
  }, []);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as BridgeMessage;
      if (!data || !data.__ohg) return;
      if (data.type === "ready") {
        readyRef.current = true;
        setStatus("ready");
        return;
      }
      if (data.type === "log") {
        onLog?.({ level: data.level || "info", text: data.text || "" });
        return;
      }
      if (data.type === "result" && data.runId) {
        const resolve = pendingRef.current.get(data.runId);
        pendingRef.current.delete(data.runId);
        resolve?.({
          callId: data.runId,
          ok: Boolean(data.ok),
          stdout: data.stdout || "",
          result: data.result,
          error: data.error,
          ms: data.ms || 0,
        });
      }
    };
    window.addEventListener("message", onMessage);
    const boot = setTimeout(() => {
      if (!readyRef.current) setStatus("error");
    }, 4000);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(boot);
    };
  }, [onLog]);

  useEffect(() => {
    if (onReady) onReady({ run });
  }, [onReady, run]);

  return (
    <>
      <iframe
        ref={runnerRef}
        title="ONE HEALTH AI sandbox runner"
        sandbox="allow-scripts"
        srcDoc={RUNTIME}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        aria-hidden
      />
      {preview && (
        <iframe
          key={`${preview.language}:${preview.code.length}:${preview.code.slice(0, 24)}`}
          title="Sandbox preview"
          sandbox="allow-scripts allow-popups allow-modals allow-forms"
          srcDoc={buildPreview(preview.language, preview.code)}
          className="h-full w-full bg-white"
        />
      )}
      {status === "error" && (
        <div className="a-mono absolute bottom-2 left-2 rounded-lg bg-red-soft px-2 py-1 text-[11px] text-ghana-red">
          sandbox runner did not report ready
        </div>
      )}
    </>
  );
}

export { buildPreview };
