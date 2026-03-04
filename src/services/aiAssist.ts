import { v4 as uuidv4 } from 'uuid'
import { useCanvasStore } from '../store/canvasStore'
import { GRID_UNIT, snapToGrid } from '../utils/grid'
import type { CanvasObject } from '../types/canvas'

export const runLayoutAssistant = () => {
  const state = useCanvasStore.getState()
  const suggestions = state.objects.filter((obj) => obj.type === 'ai-suggestion')
  suggestions.forEach((suggestion) => state.removeObject(suggestion.id))

  const overlaps: { targetIds: string[]; area: { x: number; y: number; width: number; height: number } }[] = []
  const objs = state.objects.filter((obj) => obj.type !== 'ai-suggestion')
  for (let i = 0; i < objs.length; i += 1) {
    for (let j = i + 1; j < objs.length; j += 1) {
      const a = objs[i]
      const b = objs[j]
      const intersect =
        a.position.x < b.position.x + b.size.width &&
        a.position.x + a.size.width > b.position.x &&
        a.position.y < b.position.y + b.size.height &&
        a.position.y + a.size.height > b.position.y
      if (intersect) {
        const area = {
          x: Math.min(a.position.x, b.position.x),
          y: Math.min(a.position.y, b.position.y),
          width: Math.max(a.position.x + a.size.width, b.position.x + b.size.width),
          height: Math.max(a.position.y + a.size.height, b.position.y + b.size.height),
        }
        overlaps.push({ targetIds: [a.id, b.id], area })
      }
    }
  }

  if (overlaps.length) {
    overlaps.forEach((overlap) => {
      const obj: CanvasObject = {
        id: uuidv4(),
        type: 'ai-suggestion',
        position: { x: snapToGrid(overlap.area.x - GRID_UNIT), y: snapToGrid(overlap.area.y - GRID_UNIT) },
        size: {
          width: snapToGrid(overlap.area.width + GRID_UNIT * 2),
          height: snapToGrid(overlap.area.height + GRID_UNIT * 2),
        },
        rotation: 0,
        layerIndex: 9999,
        metadata: { semantic: 'ui' },
        suggestion: 'Objects overlap — tidy spacing?',
        targetIds: overlap.targetIds,
      }
      state.addObject(obj)
    })
  } else if (objs.length > 8) {
    const center = objs.reduce(
      (acc, obj) => ({
        x: acc.x + obj.position.x + obj.size.width / 2,
        y: acc.y + obj.position.y + obj.size.height / 2,
      }),
      { x: 0, y: 0 },
    )
    const avg = { x: center.x / objs.length, y: center.y / objs.length }
    const obj: CanvasObject = {
      id: uuidv4(),
      type: 'ai-suggestion',
      position: { x: snapToGrid(avg.x - 120), y: snapToGrid(avg.y - 60) },
      size: { width: 240, height: 120 },
      rotation: 0,
      layerIndex: 9999,
      metadata: { semantic: 'ui' },
      suggestion: 'Consider grouping related elements or adding a frame.',
      targetIds: objs.map((o) => o.id),
    }
    state.addObject(obj)
  }
}
