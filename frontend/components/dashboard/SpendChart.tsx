"use client";

import React, { useMemo } from "react";

interface DataPoint {
  date: string;
  amount: number;
}

interface SpendChartProps {
  data: DataPoint[];
}

export default function SpendChart({ data }: SpendChartProps) {
  const points = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    // Sort by date ascending
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    
    // If only 1 point, duplicate it to show a line
    const chartData = sorted.length === 1 ? [sorted[0], sorted[0]] : sorted;
    
    const maxVal = Math.max(...chartData.map(d => d.amount), 1);
    const minVal = Math.min(...chartData.map(d => d.amount), 0);
    const range = maxVal - minVal;

    return chartData.map((d, index) => {
      const x = (index / (chartData.length - 1)) * 100;
      // Invert Y so higher value is at the top (SVG coords)
      // Leave 10% padding top/bottom
      const y = 90 - ((d.amount - minVal) / range) * 80;
      return { x, y };
    });
  }, [data]);

  // Generate smooth SVG cubic bezier path strings
  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      path += ` C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return path;
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    return `${linePath} L 100 100 L 0 100 Z`;
  }, [points, linePath]);

  // Get coordinates for the last (current) dot
  const lastPoint = points[points.length - 1] || { x: 0, y: 100 };

  if (points.length === 0) {
    return (
      <div className="relative w-full h-[120px] mt-4 flex items-center justify-center border border-dashed border-border rounded-lg">
        <p className="text-xs text-muted-foreground">No spend data yet</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[120px] mt-4">
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary, #c2410c)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-primary, #c2410c)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Subtle Horizontal Reference Grid Lines */}
        <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="80" x2="100" y2="80" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />

        {/* Fill Area */}
        <path d={areaPath} fill="url(#chartGradient)" />

        {/* Stroke Line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-primary, #c2410c)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Clean Indicator Dot at the last point */}
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="2.5"
          fill="var(--color-card, #ffffff)"
          stroke="var(--color-primary, #c2410c)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
