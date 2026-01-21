import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Same Supabase instance as V1 web platform
// Fallback values for Expo Go development (anon keys are safe to include)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xsncgdnctnbzvokmxlex.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbmNnZG5jdG5ienZva214bGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MzI0NjQsImV4cCI6MjA3NjIwODQ2NH0.bSNroVQHNbB4jYReAr1QSlTQU6wSGLdqsYcesBE6BTU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

