import { createClient } from '@supabase/supabase-js'

const url =
  (import.meta as any).env?.VITE_SUPABASE_URL ??
  (globalThis as any).VITE_SUPABASE_URL ??
  ''
const anon =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ??
  (globalThis as any).VITE_SUPABASE_ANON_KEY ??
  ''

export const supabase = createClient(url, anon)
