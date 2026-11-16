export interface ChartThemeColors {
  background: string;
  text: string;
  grid: string;
  crosshair: string;
  border: string;
  bull: string;
  bear: string;
  rColor: string;
  info: string;
}

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}

export function getChartThemeColors(): ChartThemeColors {
  return {
    background: readCssVar('--surface-chart', '#090d16'),
    text: readCssVar('--chart-text', '#94a3b8'),
    grid: readCssVar('--chart-grid', 'rgba(30, 41, 59, 0.4)'),
    crosshair: readCssVar('--chart-crosshair', '#475569'),
    border: readCssVar('--border-subtle', '#1e293b'),
    bull: readCssVar('--chart-bull', '#10b981'),
    bear: readCssVar('--chart-bear', '#f43f5e'),
    rColor: readCssVar('--status-r', '#a855f7'),
    info: readCssVar('--status-info', '#3b82f6'),
  };
}
