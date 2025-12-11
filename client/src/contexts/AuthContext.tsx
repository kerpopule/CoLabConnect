import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, Profile } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, profileData: Partial<Profile>) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_CACHE_KEY = 'colab_profile_cache';

// Load cached profile from localStorage
const loadCachedProfile = (): Profile | null => {
  try {
    const cached = localStorage.getItem(PROFILE_CACHE_KEY);
    if (cached) {
      const { profile, timestamp } = JSON.parse(cached);
      // Cache valid for 24 hours
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        return profile;
      }
    }
  } catch {
    // Ignore cache errors
  }
  return null;
};

// Save profile to localStorage cache
const cacheProfile = (profile: Profile | null) => {
  try {
    if (profile) {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
        profile,
        timestamp: Date.now(),
      }));
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // Ignore cache errors
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Initialize profile from cache for instant loading
  const [profile, setProfile] = useState<Profile | null>(() => loadCachedProfile());
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Track if we've already fetched for this session
  const fetchedRef = useRef<string | null>(null);

  // Fetch user profile from database
  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    // Skip if we already fetched for this user in this session
    if (fetchedRef.current === userId) {
      return profile;
    }

    console.log('Fetching profile for user:', userId);
    fetchedRef.current = userId;

    try {
      // Use Promise.race for timeout - 3 seconds max
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout')), 3000);
      });

      const fetchPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      // Cache the profile for next page load
      if (data) {
        cacheProfile(data as Profile);
      }

      return data as Profile | null;
    } catch (err: any) {
      console.error('Profile fetch failed:', err.message);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log('Auth event:', event, 'User:', session?.user?.email);

        // Update state synchronously first
        setSession(session);
        setUser(session?.user ?? null);

        // Only fetch profile on INITIAL_SESSION to avoid duplicate requests
        // SIGNED_IN fires before INITIAL_SESSION and often has network issues
        if (event === 'INITIAL_SESSION' && session?.user) {
          // If we have a cached profile for this user, we're good
          // Still fetch in background to get fresh data
          const cachedProfile = loadCachedProfile();
          if (cachedProfile && cachedProfile.id === session.user.id) {
            setProfile(cachedProfile);
            setLoading(false);
            // Fetch fresh data in background
            fetchProfile(session.user.id).then(freshProfile => {
              if (mounted && freshProfile) {
                setProfile(freshProfile);
              }
            });
            return;
          }

          // No valid cache, fetch from server
          try {
            const profileData = await fetchProfile(session.user.id);
            if (mounted && profileData) {
              setProfile(profileData);
            }
          } catch (err) {
            console.error('Failed to fetch profile:', err);
          }
        } else if (event === 'SIGNED_OUT' || !session) {
          setProfile(null);
          cacheProfile(null);
          fetchedRef.current = null;
        }

        setLoading(false);
      }
    );

    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;

      // If no session, clear loading immediately
      if (!session) {
        setLoading(false);
        setProfile(null);
        cacheProfile(null);
      }
      // Otherwise, INITIAL_SESSION event will handle it
    }).catch(err => {
      console.error('getSession error:', err);
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, profileData: Partial<Profile>) => {
    const redirectUrl = `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) return { error };

    // Check if user already exists - Supabase returns user with empty identities array
    // when the email is already registered and confirmed
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return {
        error: {
          message: 'An account with this email already exists. Please sign in instead.',
          name: 'AuthApiError',
          status: 400
        } as AuthError
      };
    }

    // Create profile record after successful signup
    if (data.user && data.user.identities && data.user.identities.length > 0) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        name: profileData.name || '',
        role: profileData.role || null,
        company: profileData.company || null,
        bio: profileData.bio || null,
        avatar_url: profileData.avatar_url || null,
        tags: profileData.tags || [],
        social_links: profileData.social_links || {},
      } as any);

      if (profileError) {
        console.error('Error creating profile:', profileError);
      }
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    const redirectUrl = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });
    return { error };
  };

  const signOut = async () => {
    try {
      // Use scope: 'global' to sign out from all tabs/windows
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        console.error('Sign out error:', error);
      }
    } catch (err) {
      console.error('Sign out exception:', err);
    } finally {
      // Always clear state, regardless of whether signOut succeeded
      setUser(null);
      setSession(null);
      setProfile(null);
      fetchedRef.current = null;
      // Clear cached profile and auth token
      cacheProfile(null);
      localStorage.removeItem('sb-oyneqfcajnioyipoixix-auth-token');
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('No user logged in') };

    console.log('Updating profile for user:', user.id);
    console.log('Updates:', updates);

    try {
      // Use UPDATE to modify existing profile (not UPSERT to avoid NOT NULL issues)
      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select()
        .single();

      console.log('Update response - data:', data, 'error:', error);

      if (error) {
        console.error('Profile update error:', error);
        return { error: new Error(error.message) };
      }

      // Update local state with the returned data and cache it
      if (data) {
        setProfile(data as Profile);
        cacheProfile(data as Profile);
      } else if (profile) {
        const updatedProfile = { ...profile, ...updates };
        setProfile(updatedProfile);
        cacheProfile(updatedProfile);
      }

      return { error: null };
    } catch (err: any) {
      console.error('Profile update exception:', err);
      return { error: new Error(err.message || 'Failed to update profile') };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
