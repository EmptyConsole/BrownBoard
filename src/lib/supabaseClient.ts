import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const SUPABASE_ENABLED = false // Disabled for local development

let client: SupabaseClient | null = null

export const getSupabaseClient = () => {
  if (!SUPABASE_ENABLED) {
    return null
  }
  if (client) return client
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Supabase environment variables are missing; realtime features disabled.')
    return null
  }

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })

  return client
}
