import { getSupabaseClient } from '../lib/supabaseClient'
import { useCanvasStore } from '../store/canvasStore'
import type { CanvasObject } from '../types/canvas'
import type { ActionVein } from '../types/veins'

type CanvasRow = {
  id: string
  type: string
  data: CanvasObject
}

type VeinRow = ActionVein & { updated_at?: string }

export const startRealtimeSync = () => {
  const client = getSupabaseClient()
  if (!client) return null

  const channel = client
    .channel('canvas-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'canvas_objects' },
      (payload) => {
        const data = (payload.new as CanvasRow | null) ?? (payload.old as CanvasRow | null)
        if (!data) return
        const object: CanvasObject = data.data
        if (payload.eventType === 'DELETE') {
          useCanvasStore.getState().removeObject(object.id)
        } else {
          const exists = useCanvasStore.getState().objects.find((obj) => obj.id === object.id)
          if (exists) {
            useCanvasStore.getState().updateObject(object.id, object)
          } else {
            useCanvasStore.getState().addObject(object)
          }
        }
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'veins' },
      (payload) => {
        const data = (payload.new as VeinRow | null) ?? (payload.old as VeinRow | null)
        if (!data) return
        const vein: ActionVein = data
        if (payload.eventType === 'DELETE') {
          useCanvasStore.getState().removeVein(vein.id)
        } else {
          useCanvasStore.getState().addVein(vein)
        }
      },
    )
    .subscribe()

  return channel
}

export const upsertObjects = async (objects: CanvasObject[]) => {
  const client = getSupabaseClient()
  if (!client) {
    // Local development: skip sync
    return
  }
  try {
    await client.from('canvas_objects').upsert(
      objects.map((obj) => ({
        id: obj.id,
        type: obj.type,
        data: obj,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'id' },
    )
  } catch (err) {
    console.error('Failed to sync objects to Supabase:', err)
  }
}

export const upsertVeins = async (veins: ActionVein[]) => {
  const client = getSupabaseClient()
  if (!client) {
    // Local development: skip sync
    return
  }
  try {
    await client.from('veins').upsert(
      veins.map((vein) => ({
        ...vein,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'id' },
    )
  } catch (err) {
    console.error('Failed to sync veins to Supabase:', err)
  }
}
