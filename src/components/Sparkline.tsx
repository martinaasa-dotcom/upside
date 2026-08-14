"use client";

import { cn } from "@/lib/format";

type Props = {
  points: number[];
  className?: string;
  width?: number;
  height?: number;
};

export function Sparkline({
  points,
  className,
  width = 96,
  height = 28,
}: Props) {
  if (!points.length) {
    return (
      <div
        className={cn("text-xs text-zinc-400", className)}
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((p - min) / range) * (height - 4);
      return `${x},${y}`;
    })
    .join(" ");

  const up = points[points.length - 1] >= points[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={up ? "#10B981" : "#F43F5E"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords}
      />
    </svg>
  );
}
