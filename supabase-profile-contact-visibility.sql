-- Migration: Add phone number and contact visibility settings to profiles
-- Run this in Supabase SQL Editor

-- Add phone number field
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add email visibility toggle (defaults to true - visible by default)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_email BOOLEAN DEFAULT true;

-- Add phone visibility toggle (defaults to false - hidden by default)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_phone BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN profiles.phone IS 'Optional phone number for the user';
COMMENT ON COLUMN profiles.show_email IS 'Whether to show email on public profile (default: true)';
COMMENT ON COLUMN profiles.show_phone IS 'Whether to show phone on public profile (default: false)';
