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
  display_order?: number;
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

// Group chat types
export type GroupChat = {
  id: string;
  name: string | null;
  emojis: string[];
  created_by: string;
  created_at: string;
  // Joined data
  members?: GroupChatMember[];
  member_count?: number;
};

export type GroupChatMember = {
  id: string;
  group_id: string;
  user_id: string;
  invited_by: string | null;
  status: 'pending' | 'accepted' | 'declined';
  role: 'admin' | 'member';
  joined_at: string;
  last_read_at: string | null;
  display_order?: number;
  // Joined profile data
  profiles?: Profile;
};

export type GroupMessage = {
  id: string;
  group_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_id: string | null;
  reply_to_user_id: string | null;
  // Joined profile data
  profiles?: Profile;
  reply_to_profile?: Profile;
};

// Helper type for group with unread count
export type GroupChatWithUnread = GroupChat & {
  unread_count: number;
  latest_message_at: string | null;
};
