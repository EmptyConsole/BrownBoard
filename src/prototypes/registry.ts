import type { PrototypeKind, Size } from '../types/canvas'

type PrototypePreset = {
  size: Size
  padding: number
  description: string
}

const presets: Record<PrototypeKind, PrototypePreset> = {
  button: { size: { width: 160, height: 48 }, padding: 16, description: 'Click interaction' },
  slider: { size: { width: 220, height: 48 }, padding: 12, description: 'Value change' },
  panel: { size: { width: 320, height: 200 }, padding: 16, description: 'Container/panel' },
  collider: { size: { width: 200, height: 120 }, padding: 8, description: 'Collision target' },
  player: { size: { width: 160, height: 80 }, padding: 12, description: 'Playable entity' },
  generic: { size: { width: 200, height: 120 }, padding: 12, description: 'Generic UI element' },
}

export const getPrototypePreset = (kind: PrototypeKind): PrototypePreset => presets[kind] ?? presets.generic
