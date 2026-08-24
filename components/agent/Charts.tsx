"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec, TableSpec } from "@/lib/agent/types";

const PALETTE = ["#0b7a43", "#0e7490", "#e8b923", "#c8102e", "#7c3aed", "#0891b2", "#65a30d", "#db2777"];

function toRows(spec: ChartSpec) {
  return spec.x.map((label, i) => {
    const row: Record<string, string | number> = { label };
    spec.series.forEach((s) => {
      row[s.name] = s.values[i] ?? 0;
    });
    return row;
  });
}

export function AgentChart({ spec }: { spec: ChartSpec }) {
  const rows = toRows(spec);
  const names = spec.series.map((s) => s.name);

  return (
    <figure className="a-card a-in overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <figcaption className="font-display text-base tracking-tight">{spec.title}</figcaption>
        {spec.unit && <span className="a-mono text-[11px] text-muted">{spec.unit}</span>}
      </div>
      <div className="h-64 w-full px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          {spec.kind === "pie" ? (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie data={rows} dataKey={names[0]} nameKey="label" outerRadius={90} label>
                {rows.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : spec.kind === "bar" ? (
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {names.map((n, i) => (
                <Bar key={n} dataKey={n} fill={PALETTE[i % PALETTE.length]} radius={[6, 6, 0, 0]} />
              ))}
            </BarChart>
          ) : spec.kind === "area" ? (
            <AreaChart data={rows}>
              <defs>
                {names.map((n, i) => (
                  <linearGradient key={n} id={`grad-${n}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {names.map((n, i) => (
                <Area key={n} type="monotone" dataKey={n} stroke={PALETTE[i % PALETTE.length]} fill={`url(#grad-${n})`} />
              ))}
            </AreaChart>
          ) : spec.kind === "scatter" ? (
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {names.map((n, i) => (
                <Scatter key={n} name={n} data={rows} dataKey={n} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </ScatterChart>
          ) : (
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {names.map((n, i) => (
                <Line
                  key={n}
                  type="monotone"
                  dataKey={n}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 4.5 }}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {spec.note && <div className="border-t border-line px-4 py-2 text-[11px] text-muted">{spec.note}</div>}
    </figure>
  );
}

export function AgentTable({ spec }: { spec: TableSpec }) {
  return (
    <figure className="a-card a-in overflow-hidden">
      {spec.title && (
        <figcaption className="border-b border-line px-4 py-3 font-display text-base tracking-tight">
          {spec.title}
        </figcaption>
      )}
      <div className="a-scroll max-h-96 overflow-auto">
        <table className="a-table">
          <thead>
            <tr>
              {spec.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map((row, i) => (
              <tr key={i}>
                {spec.columns.map((c) => (
                  <td key={c}>{String(row[c] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {spec.note && <div className="border-t border-line px-4 py-2 text-[11px] text-muted">{spec.note}</div>}
    </figure>
  );
}
