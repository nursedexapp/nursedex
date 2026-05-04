"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { DailyPoint } from "@/lib/analytics/nurse-stats";

interface StatsChartProps {
  daily: DailyPoint[];
}

export function StatsChart({ daily }: StatsChartProps) {
  const data = daily.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    "Profile views": d.profileViews,
    Saves: d.saves,
    Reveals: d.reveals,
  }));

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
        >
          <CartesianGrid stroke="#E5E2D8" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#636E72" }}
            stroke="#C7C2B3"
            interval={Math.max(0, Math.floor(data.length / 8) - 1)}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#636E72" }}
            stroke="#C7C2B3"
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #E5E2D8",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="Profile views"
            stroke="#2A7B6F"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Saves"
            stroke="#D4A52E"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Reveals"
            stroke="#7BA890"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
