import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Types for our database tables
export type Profile = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  avatar_url: string | null;
  tags: string[] | null;
  social_links: {
    linkedin?: string;
    website?: string;
    instagram?: string;
  } | null;
  phone: string | null;
  show_email: boolean;
  show_phone: boolean;
  created_at: string;
  updated_at: string;
};

export type Topic = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  description: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  topic_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  // Joined profile data
  profiles?: Profile;
};

export type Connection = {
  id: string;
  follower_id: string;
  following_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
};

export type PrivateMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  // Joined profile data
  sender_profile?: Profile;
  receiver_profile?: Profile;
};

// Helper to get a consistent channel ID for two users (alphabetically sorted)
export function getPrivateChatId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join('_');
}
