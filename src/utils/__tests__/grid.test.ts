import { describe, expect, it } from 'vitest'
import { GRID_UNIT, snapToGrid } from '../grid'
import { canvasObjectSchema } from '../../types/canvas'

describe('grid snapping', () => {
  it('rounds to nearest grid unit', () => {
    expect(snapToGrid(5)).toBe(GRID_UNIT)
    expect(snapToGrid(12)).toBe(16)
    expect(snapToGrid(15)).toBe(16)
    expect(snapToGrid(24)).toBe(24)
  })
})

describe('canvas schema', () => {
  it('validates base object shape', () => {
    const parsed = canvasObjectSchema.parse({
      id: '1',
      type: 'shape',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 80 },
      rotation: 0,
      layerIndex: 0,
    })
    expect(parsed.id).toBe('1')
  })
})
