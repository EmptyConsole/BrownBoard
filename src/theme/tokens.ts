export const colors = {
  background: '#0f1115',
  backgroundStrong: '#151922',
  gridLine: 'rgba(255,255,255,0.05)',
  text: '#e8ecf1',
  muted: '#9da7b8',
  panel: '#12141b',
  border: 'rgba(255,255,255,0.06)',
  accentBlue: '#4da3ff',
  accentViolet: '#8b7cff',
} as const

export const spacing = (units: number) => units * 8

export const typography = {
  sizes: [12, 14, 16, 20, 24],
  lineHeight: 1.4,
} as const
