import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type { ActionVein } from '../types/veins'
import type { CanvasObject, CanvasTool, PrototypeKind } from '../types/canvas'

type SelectionState = {
  selectedIds: string[]
  hoveredId?: string
}

type CanvasState = {
  objects: CanvasObject[]
  veins: ActionVein[]
  selection: SelectionState
  activeTool: CanvasTool
  addObject: (object: Omit<CanvasObject, 'id'> & { id?: string }) => string
  updateObject: (id: string, updates: Partial<CanvasObject>) => void
  removeObject: (id: string) => void
  setSelection: (ids: string[]) => void
  clearSelection: () => void
  setActiveTool: (tool: CanvasTool) => void
  addVein: (vein: ActionVein) => void
  removeVein: (id: string) => void
  groupSelection: () => void
  ungroupSelection: () => void
  setLockedForSelection: (locked: boolean) => void
  bumpLayer: (direction: 'up' | 'down') => void
  convertToPrototype: (id: string, prototypeType: PrototypeKind) => void
}

export const useCanvasStore = create<CanvasState>()(
  devtools(
    (set) => ({
      objects: [],
      veins: [],
      selection: { selectedIds: [] },
      activeTool: 'select',
      addObject: (object) => {
        const id = object.id ?? uuidv4()
        const nextObject = { ...object, id }
        set((state) => ({ objects: [...state.objects, nextObject] }))
        return id
      },
      updateObject: (id, updates) =>
        set((state) => ({
          objects: state.objects.map((obj) => (obj.id === id ? { ...obj, ...updates } : obj)),
        })),
      removeObject: (id) =>
        set((state) => ({
          objects: state.objects.filter((obj) => obj.id !== id),
          selection: {
            ...state.selection,
            selectedIds: state.selection.selectedIds.filter((selected) => selected !== id),
          },
        })),
      setSelection: (ids) => set(() => ({ selection: { selectedIds: ids } })),
      clearSelection: () => set(() => ({ selection: { selectedIds: [] } })),
      setActiveTool: (tool) => set(() => ({ activeTool: tool })),
      addVein: (vein) =>
        set((state) => ({
          veins: [...state.veins, { ...vein, id: vein.id ?? uuidv4() }],
        })),
      removeVein: (id) => set((state) => ({ veins: state.veins.filter((vein) => vein.id !== id) })),
      groupSelection: () =>
        set((state) => {
          if (!state.selection.selectedIds.length) return state
          const groupId = uuidv4()
          return {
            ...state,
            objects: state.objects.map((obj) =>
              state.selection.selectedIds.includes(obj.id) ? { ...obj, groupId } : obj,
            ),
          }
        }),
      ungroupSelection: () =>
        set((state) => ({
          ...state,
          objects: state.objects.map((obj) =>
            state.selection.selectedIds.includes(obj.id) ? { ...obj, groupId: undefined } : obj,
          ),
        })),
      setLockedForSelection: (locked) =>
        set((state) => ({
          ...state,
          objects: state.objects.map((obj) =>
            state.selection.selectedIds.includes(obj.id) ? { ...obj, locked } : obj,
          ),
        })),
      bumpLayer: (direction) =>
        set((state) => {
          const delta = direction === 'up' ? 1 : -1
          return {
            ...state,
            objects: state.objects.map((obj) =>
              state.selection.selectedIds.includes(obj.id)
                ? { ...obj, layerIndex: Math.max(0, obj.layerIndex + delta) }
                : obj,
            ),
          }
        }),
      convertToPrototype: (id, prototypeType) =>
        set((state) => ({
          ...state,
          objects: state.objects.map((obj) =>
            obj.id === id
              ? {
                  id: obj.id,
                  type: 'prototype',
                  position: obj.position,
                  size: obj.size,
                  rotation: obj.rotation,
                  layerIndex: obj.layerIndex,
                  metadata: obj.metadata,
                  locked: obj.locked,
                  prototypeType,
                  params: {},
                }
              : obj,
          ),
        })),
    }),
    { name: 'canvas-store' },
  ),
)
