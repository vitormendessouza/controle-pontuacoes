import { createClient } from '@supabase/supabase-js'

const url =
  (import.meta as any).env?.VITE_SUPABASE_URL ??
  (globalThis as any).VITE_SUPABASE_URL ??
  ''
const anon =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ??
  (globalThis as any).VITE_SUPABASE_ANON_KEY ??
  ''

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // padrão, mas ajuda no first load pós redirect
    },
  }
)
