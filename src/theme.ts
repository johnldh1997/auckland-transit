export const lightColors = {
  background: '#F6F8FB',
  surface: '#FFFFFF',
  primary: '#0B4F6C',
  primaryMuted: '#DCEBF2',
  accent: '#01A7C2',
  text: '#141B2E',
  textMuted: '#6B7280',
  border: '#E4E8EF',
  danger: '#D64545',
  dangerMuted: '#F9E1E1',
  success: '#2E9E5B',
  busLine: '#E4572E',
  trainLine: '#0B4F6C',
  ferryLine: '#01A7C2',
  // Extra icon accents — spread across menu/list icons that would otherwise all be
  // primary/textMuted, so recurring icon rows (side menu, place pickers) read as varied
  // rather than a single-hue wash.
  amber: '#D98E04',
  rose: '#D6336C',
  violet: '#7048B8',
  emerald: '#16A085',
};

export const darkColors: typeof lightColors = {
  background: '#0F1620',
  surface: '#1A2432',
  primary: '#4FA8D8',
  primaryMuted: '#1E3A4D',
  accent: '#3FD0EA',
  text: '#F0F2F5',
  textMuted: '#9AA5B1',
  border: '#2A3644',
  danger: '#F2726B',
  dangerMuted: '#3D2323',
  success: '#4FC97F',
  busLine: '#FF8A5C',
  trainLine: '#4FA8D8',
  ferryLine: '#3FD0EA',
  amber: '#F5B049',
  rose: '#F26FA0',
  violet: '#A585DE',
  emerald: '#3FC79A',
};

export type ThemeColors = typeof lightColors;

// Default export kept for any code that hasn't been converted to useThemeColors() yet —
// always resolves to the light palette, so it's a safe (if non-reactive) fallback.
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
};
