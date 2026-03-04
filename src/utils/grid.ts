export const GRID_UNIT = 8

export const snapToGrid = (value: number, step = GRID_UNIT) =>
  Math.round(value / step) * step
