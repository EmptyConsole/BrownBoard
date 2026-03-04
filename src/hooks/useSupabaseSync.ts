import { useEffect } from 'react'
import { getSupabaseClient } from '../lib/supabaseClient'
import { useCanvasStore } from '../store/canvasStore'
import { upsertObjects, upsertVeins } from '../services/realtime'

export const useSupabaseSync = () => {
  const objects = useCanvasStore((state) => state.objects)
  const veins = useCanvasStore((state) => state.veins)

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) {
      // Supabase disabled in local development
      return
    }
    const timer = window.setTimeout(() => {
      void upsertObjects(objects)
      void upsertVeins(veins)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [objects, veins])
}
