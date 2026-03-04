import { useCanvasStore } from '../store/canvasStore'
import type { CanvasObject } from '../types/canvas'
import type { VeinTrigger } from '../types/veins'

export const executeVeins = (sourceId: string, trigger: VeinTrigger) => {
  const state = useCanvasStore.getState()
  const { veins, updateObject, objects } = state
  const relevant = veins.filter((vein) => vein.sourceId === sourceId && vein.trigger === trigger)

  relevant.forEach((vein) => {
    const target = objects.find((obj) => obj.id === vein.targetId)
    if (!target) return

    switch (vein.action) {
      case 'set-state': {
        const labels = new Set([...(target.metadata?.labels ?? [])])
        vein.payload?.labels?.forEach((label) => labels.add(label))
        updateObject(target.id, {
          metadata: { ...target.metadata, labels: Array.from(labels) },
        })
        break
      }
      case 'set-visibility': {
        updateObject(target.id, { visible: vein.payload?.visible ?? false })
        break
      }
      case 'update-text': {
        if (target.type === 'text' || target.type === 'sticky') {
          updateObject(target.id, { text: vein.payload?.text ?? '' } as Partial<CanvasObject>)
        }
        if (target.type === 'task') {
          updateObject(target.id, { title: vein.payload?.text ?? target.title } as Partial<CanvasObject>)
        }
        break
      }
      case 'emit-event': {
        // Surface a small badge on target via metadata labels
        const labels = new Set([...(target.metadata?.labels ?? []), 'event'])
        updateObject(target.id, { metadata: { ...target.metadata, labels: Array.from(labels) } })
        break
      }
      default:
        break
    }
  })
}
