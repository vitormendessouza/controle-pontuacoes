import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL!
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY!

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // força storage do browser (evita SSR/Node quebrar):
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
})
