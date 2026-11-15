import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fijjtocoiaumfxzdjxbi.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpamp0b2NvaWF1bWZ4emRqeGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3MjczMDgsImV4cCI6MjExMDMwMzMwOH0.YIbmTT6kSvmWn5XKx5lXRLWvN2IBpoLexii9pq7QpHE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    },
    realtime: {
        params: {
            eventsPerSecond: 20
        }
    }
});
