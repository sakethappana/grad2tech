"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Single-series charts. Mark colour validated for contrast and chroma; tables carry the exact values. */
const MARK = "#0E9A8B";
const GRID = "#E2E8F0";
const INK = "#475569";
const SURFACE = "#FFFFFF";

type Point = { label: string; date: string; percent: number };

function TipBox({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ background: "#0B1220", color: "#fff", padding: "8px 10px", borderRadius: 8, fontSize: 12, boxShadow: "0 8px 24px rgba(11,18,32,.25)" }}>
      <div style={{ color: "#A3B1C6" }}>{title}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  );
}

export function ScoreTrend({ data, passPercent }: { data: Point[]; passPercent?: number | null }) {
  return (
    <div style={{ width: "100%", height: 260 }} role="img" aria-label={`Test scores over time, ${data.length} graded attempts. Exact values are in the table below.`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} width={40} unit="%" />
          {passPercent ? <ReferenceLine y={passPercent} stroke="#94A3B8" strokeWidth={1} label={{ value: `Pass ${passPercent}%`, position: "insideTopRight", fill: INK, fontSize: 11 }} /> : null}
          <Tooltip
            cursor={{ stroke: "#94A3B8", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Point;
              return <TipBox title={`${p.label} · ${p.date}`} value={`${p.percent}%`} />;
            }}
          />
          <Line
            type="linear"
            dataKey="percent"
            stroke={MARK}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: MARK, stroke: SURFACE, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: MARK, stroke: SURFACE, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopicBars({ data }: { data: { topic: string; percent: number }[] }) {
  const height = Math.max(120, data.length * 36 + 30);
  return (
    <div style={{ width: "100%", height }} role="img" aria-label="Percentage of marks earned by topic. Exact values are in the table below.">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap={8}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} unit="%" />
          <YAxis type="category" dataKey="topic" width={130} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.12)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { topic: string; percent: number };
              return <TipBox title={p.topic} value={`${p.percent}% of marks`} />;
            }}
          />
          <Bar dataKey="percent" fill={MARK} maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="percent" position="right" formatter={(v: unknown) => `${v}%`} style={{ fill: INK, fontSize: 12, fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
