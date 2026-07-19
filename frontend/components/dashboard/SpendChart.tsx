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
      // Fallback dummy points for premium visualization if no actual data exists
      return [
        { x: 0, y: 100 },
        { x: 20, y: 80 },
        { x: 40, y: 90 },
        { x: 60, y: 60 },
        { x: 80, y: 70 },
        { x: 100, y: 30 }
      ];
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

  // Generate SVG path strings
  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      // Draw straight line segments for modern polygonal look
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    return `${linePath} L 100 100 L 0 100 Z`;
  }, [points, linePath]);

  // Get coordinates for the last (current) dot
  const lastPoint = points[points.length - 1] || { x: 0, y: 100 };

  return (
    <div className="relative w-full h-[120px] mt-4">
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Orange gradient for the filled area under the line */}
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
          </linearGradient>
          {/* Drop shadow filter for the glowing orange line */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#f97316" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* Fill Area */}
        <path d={areaPath} fill="url(#chartGradient)" />

        {/* Stroke Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow)"
        />

        {/* Glowing Indicator Dot at the last point */}
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="2.5"
          fill="#ffffff"
          stroke="#f97316"
          strokeWidth="1.5"
          className="animate-pulse"
          style={{ transformOrigin: `${lastPoint.x}px ${lastPoint.y}px` }}
        />
      </svg>
    </div>
  );
}
