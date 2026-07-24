import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.https://somsquxikodnghjoatar.supabase.co
const supabaseAnonKey = import.meta.env.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbXNxdXhpa29kbmdoam9hdGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTAyMTIsImV4cCI6MjA5NTMyNjIxMn0.4gUiHWqgkQS0TSpswEr1Q4YkxXQcFb435EQ-ldPX_WA
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
