/**
 * Color utilities for theming and styling
 */

export function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith("rgba")) {
    return hex;
  }
  const cleanHex = hex.replace("#", "");
  const bigint = parseInt(cleanHex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Get risk color based on value and thresholds
 */
export function getRiskColor(value: number, highThreshold: number, mediumThreshold: number): string {
  if (value >= highThreshold) return "#fa8072";
  if (value >= mediumThreshold) return "#fbbf24";
  return "#6366f1";
}

/**
 * Get sentiment color
 */
export function getSentimentColor(sentiment: string): string {
  const colorMap: Record<string, string> = {
    positive: "#6366f1",
    neutral: "#cbd5f5",
    negative: "#fa8072",
  };
  return colorMap[sentiment.toLowerCase()] || "#cbd5f5";
}