import { createClient } from '@supabase/supabase-js'

// Prefer build-time env vars (set in .env locally, or in the Cloudflare build
// environment). Fall back to the project's public values so the app still boots
// if those vars aren't configured — the anon key is a publishable client key
// (it ships in the browser bundle either way; RLS is what protects your data).
const FALLBACK_URL = 'https://somsquxikodnghjoatar.supabase.co'
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbXNxdXhpa29kbmdoam9hdGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTAyMTIsImV4cCI6MjA5NTMyNjIxMn0.4gUiHWqgkQS0TSpswEr1Q4YkxXQcFb435EQ-ldPX_WA'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
