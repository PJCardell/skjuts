import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase-miljövariabler saknas. Kopiera .env.local.example till .env.local och fyll i värden.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
