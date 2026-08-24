"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Braces,
  Code2,
  Copy,
  Download,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Move,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { prepareDiagram } from "@/lib/agent/diagram";
import type { DiagramSpec } from "@/lib/agent/types";

/**
 * Mermaid renderer.
 *
 * This is the diagram layer the commercial assistants converged on: the model
 * writes Mermaid text, the browser turns it into SVG, and the user can zoom it,
 * read the source and export it. Three details matter:
 *
 *   - securityLevel "strict" plus `prepareDiagram` means a diagram can never
 *     carry a link, a script or a style directive. Microsoft had to strip those
 *     from Copilot after a diagram was used to exfiltrate tenant data.
 *   - htmlLabels is off, so text is real SVG <text>. That keeps PNG export
 *     working in browsers that refuse to rasterise <foreignObject>.
 *   - mermaid is imported dynamically: ~1 MB of parser stays out of the agent's
 *     first paint and is only fetched the first time a diagram is drawn.
 */

type MermaidModule = typeof import("mermaid").default;

let mermaidPromise: Promise<MermaidModule> | null = null;

function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid")
      .then((mod) => {
        const mermaid = (mod.default ?? mod) as MermaidModule;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
          flowchart: { htmlLabels: false, curve: "basis", useMaxWidth: true, padding: 12 },
          sequence: { useMaxWidth: true, mirrorActors: false, wrap: true },
          gantt: { useMaxWidth: true },
          themeVariables: {
            background: "#ffffff",
            primaryColor: "#e8f6ee",
            primaryBorderColor: "#0b7a43",
            primaryTextColor: "#0a1020",
            lineColor: "#0e7490",
            secondaryColor: "#e6f6f8",
            tertiaryColor: "#fff6d8",
            clusterBkg: "#fbfcfe",
            clusterBorder: "#dde3ec",
            edgeLabelBackground: "#ffffff",
            titleColor: "#0a1020",
            nodeTextColor: "#0a1020",
            actorBkg: "#e8f6ee",
            actorBorder: "#0b7a43",
            actorTextColor: "#0a1020",
            signalColor: "#0e7490",
            signalTextColor: "#46526a",
            labelBoxBkgColor: "#e6f6f8",
            labelBoxBorderColor: "#0e7490",
            noteBkgColor: "#fff6d8",
            noteBorderColor: "#e8b923",
            noteTextColor: "#0a1020",
            activationBkgColor: "#e6f6f8",
            activationBorderColor: "#0e7490",
            sectionBkgColor: "#e8f6ee",
            altSectionBkgColor: "#fbfcfe",
            taskBkgColor: "#0b7a43",
            taskTextColor: "#ffffff",
            gridColor: "#e6eaf0",
            pie1: "#0b7a43",
            pie2: "#0e7490",
            pie3: "#e8b923",
            pie4: "#c8102e",
            pie5: "#7c3aed",
            pie6: "#0891b2",
            pie7: "#65a30d",
            pie8: "#db2777",
          },
        });
        return mermaid;
      })
      .catch((err) => {
        // Never cache a failed load - the next diagram gets a fresh attempt.
        mermaidPromise = null;
        throw err;
      });
  }
  return mermaidPromise;
}

let idSeq = 0;

function svgToPng(svgMarkup: string, scale = 2): Promise<Blob | null> {
  return new Promise((resolve) => {
    const box = /viewBox="([^"]+)"/.exec(svgMarkup)?.[1]?.split(/\s+/).map(Number);
    const width = box && box.length === 4 ? box[2] : 900;
    const height = box && box.length === 4 ? box[3] : 600;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function download(blob: Blob | string, filename: string) {
  const url = typeof blob === "string" ? blob : URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  if (typeof blob !== "string") setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(title: string, kind: string) {
  const base = (title || kind || "diagram").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base || "diagram";
}

export function Diagram({
  spec,
  live,
}: {
  spec: DiagramSpec;
  /** True while the answer is still streaming - defer rendering until it lands. */
  live?: boolean;
}) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showSource, setShowSource] = useState(false);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const prepared = prepareDiagram(spec.source);
  const source = prepared.source || spec.source;
  const kind = spec.kind || prepared.kind || "diagram";
  const title = spec.title || `${prepared.kind} diagram`;

  useEffect(() => {
    if (live) return;
    let cancelled = false;

    if (!prepared.ok) {
      setSvg("");
      setError(`${prepared.error}${prepared.line ? ` (line ${prepared.line})` : ""}`);
      return;
    }

    loadMermaid()
      .then(async (mermaid) => {
        idSeq += 1;
        const rendered = await mermaid.render(`ohg-diagram-${idSeq}`, source);
        if (cancelled) return;
        // Defence in depth. Measured behaviour: mermaid's securityLevel "strict"
        // disables JS click callbacks but STILL emits <a href="…"> for a
        // `click Node "https://…"` directive - which is exactly the vector used
        // to exfiltrate data through a Copilot-rendered diagram. prepareDiagram
        // already removes the directive before rendering; this strips anything
        // that survives, plus handlers and scripts.
        const clean = String(rendered.svg)
          .replace(/<a\s[\s\S]*?>/gi, "<g>")
          .replace(/<\/a>/gi, "</g>")
          .replace(/\s(xlink:href|href)\s*=\s*"[^"]*"/gi, "")
          .replace(/\s(xlink:href|href)\s*=\s*'[^']*'/gi, "")
          .replace(/\son(click|load|error|mouseover|focus)\s*=\s*"[^"]*"/gi, "")
          .replace(/<script[\s\S]*?<\/script>/gi, "");
        setSvg(clean);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setSvg("");
        const message = String(err?.message || err || "render failed");
        setError(
          /Parse error/i.test(message)
            ? `Mermaid could not parse this diagram: ${message.slice(0, 260)}`
            : `Diagram could not be drawn: ${message.slice(0, 260)}`,
        );
      });

    return () => {
      cancelled = true;
    };
    // Re-render only when the source actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, live]);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [source]);

  const fit = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => Math.min(4, Math.max(0.35, Number((z - e.deltaY * 0.0015).toFixed(3)))));
  }, []);

  const saveSvg = () => {
    if (!svg) return;
    const wrapped = svg.includes("xmlns")
      ? svg
      : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    download(wrapped, `${slug(title, kind)}.svg`);
  };

  const savePng = async () => {
    if (!svg) return;
    const wrapped = svg.includes("xmlns")
      ? svg
      : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const blob = await svgToPng(wrapped, 2);
    if (blob) download(blob, `${slug(title, kind)}.png`);
  };

  const body = (
    <div
      ref={hostRef}
      className={`a-diagram-canvas relative overflow-hidden bg-white ${full ? "h-full" : "h-[22rem] sm:h-[26rem]"}`}
      onWheel={onWheel}
      onMouseDown={(e) => {
        dragRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        setDragging(true);
      }}
      onMouseMove={(e) => {
        if (!dragRef.current) return;
        setOffset({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
      }}
      onMouseUp={() => {
        dragRef.current = null;
        setDragging(false);
      }}
      onMouseLeave={() => {
        dragRef.current = null;
        setDragging(false);
      }}
      style={{ cursor: dragging ? "grabbing" : svg ? "grab" : "default" }}
    >
      {live && (
        <div className="absolute inset-0 grid place-items-center gap-2 p-6 text-center">
          <div>
            <div className="a-shimmer mx-auto h-3 w-56" />
            <p className="a-mono mt-3 text-[11px] text-muted">Drawing {kind.toLowerCase()}…</p>
          </div>
        </div>
      )}

      {!live && error && (
        <div className="absolute inset-0 overflow-auto p-4">
          <div className="mx-auto max-w-xl rounded-2xl border border-red-soft bg-red-soft/60 p-4">
            <div className="flex items-start gap-2 text-[12px] font-semibold text-ghana-red">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              The source is shown below so nothing is lost. Ask the agent to fix it, or correct it and re-run.
            </p>
            <pre className="a-mono a-scroll mt-2 max-h-40 overflow-auto rounded-xl bg-white p-3 text-[11px] text-ink">
              {source}
            </pre>
          </div>
        </div>
      )}

      {!live && !error && showSource && (
        <pre className="a-mono absolute inset-0 overflow-auto whitespace-pre-wrap bg-[#0a1020] p-4 text-[11px] leading-5 text-[#e6ecf5]">
          {source}
        </pre>
      )}

      {!live && !error && !showSource && svg && (
        <div
          className="absolute inset-0 grid place-items-center transition-transform duration-100"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          // Mermaid output is sanitised above and rendered with securityLevel
          // "strict", so this contains text, paths and no scripts or handlers.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-1.5">
      <button className="a-chip !px-2 !py-1" onClick={() => setZoom((z) => Math.min(4, z * 1.2))} title="Zoom in">
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
      <button className="a-chip !px-2 !py-1" onClick={() => setZoom((z) => Math.max(0.35, z / 1.2))} title="Zoom out">
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <button className="a-chip !px-2 !py-1" onClick={fit} title="Reset zoom and position">
        <Move className="h-3.5 w-3.5" /> {Math.round(zoom * 100)}%
      </button>
      <span className="flex-1" />
      <button
        className="a-chip !px-2 !py-1"
        data-on={showSource}
        onClick={() => setShowSource((v) => !v)}
        title="Toggle Mermaid source"
      >
        {showSource ? <Braces className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />} Source
      </button>
      <button
        className="a-chip !px-2 !py-1"
        title="Copy Mermaid source"
        onClick={async () => {
          await navigator.clipboard?.writeText(source);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
      </button>
      <button className="a-chip !px-2 !py-1" onClick={saveSvg} title="Download SVG" disabled={!svg}>
        <Download className="h-3.5 w-3.5" /> SVG
      </button>
      <button className="a-chip !px-2 !py-1" onClick={() => void savePng()} title="Download PNG" disabled={!svg}>
        <ImageIcon className="h-3.5 w-3.5" /> PNG
      </button>
      <button
        className="a-chip !px-2 !py-1"
        onClick={() => setFull((v) => !v)}
        title={full ? "Exit full screen" : "Full screen"}
      >
        {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );

  if (full) {
    return (
      <div className="a-diagram-full fixed inset-0 z-[90] flex flex-col bg-white">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg tracking-tight">{title}</div>
            <div className="a-mono text-[11px] text-muted">{kind} · drag to pan · ⌘/Ctrl + scroll to zoom</div>
          </div>
          <button className="a-chip" onClick={() => setFull(false)}>
            <Minimize2 className="h-3.5 w-3.5" /> Close
          </button>
        </div>
        <div className="min-h-0 flex-1">{body}</div>
        {toolbar}
      </div>
    );
  }

  return (
    <figure className="a-card a-in my-1 overflow-hidden">
      <figcaption className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="min-w-0 truncate font-display text-base tracking-tight">{title}</span>
        <span className="a-mono shrink-0 text-[10px] uppercase tracking-wider text-muted">{kind}</span>
      </figcaption>
      {body}
      {toolbar}
      {(spec.note || prepared.repairs.length > 0) && (
        <div className="border-t border-line px-4 py-2 text-[11px] text-muted">
          {spec.note}
          {prepared.repairs.length > 0 && (
            <span className={spec.note ? "mt-1 block" : ""}>
              Auto-corrected: {prepared.repairs.join("; ")}.
            </span>
          )}
        </div>
      )}
    </figure>
  );
}
