import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { RealtimeChannel } from "@supabase/supabase-js";

interface PresenceState {
  onlineUsers: Set<string>;
  isUserOnline: (userId: string) => boolean;
}

const PresenceContext = createContext<PresenceState>({
  onlineUsers: new Set(),
  isUserOnline: () => false,
});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user) {
      // Clear online users when not logged in
      setOnlineUsers(new Set());
      return;
    }

    // Create a presence channel
    const presenceChannel = supabase.channel("online-users", {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    // Handle presence sync (initial state and updates)
    presenceChannel.on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      const users = new Set<string>();

      // Each key in the presence state is a user ID
      Object.keys(state).forEach((key) => {
        users.add(key);
      });

      setOnlineUsers(users);
    });

    // Handle when someone joins
    presenceChannel.on("presence", { event: "join" }, ({ key }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    });

    // Handle when someone leaves
    presenceChannel.on("presence", { event: "leave" }, ({ key }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    });

    // Subscribe and track presence
    presenceChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Track this user's presence
        await presenceChannel.track({
          user_id: user.id,
          online_at: new Date().toISOString(),
        });
      }
    });

    setChannel(presenceChannel);

    // Cleanup on unmount or user change
    return () => {
      presenceChannel.unsubscribe();
    };
  }, [user]);

  // Handle visibility change - untrack when tab is hidden, retrack when visible
  useEffect(() => {
    if (!channel || !user) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden") {
        // User switched tabs or minimized - untrack
        await channel.untrack();
      } else if (document.visibilityState === "visible") {
        // User came back - retrack
        await channel.track({
          user_id: user.id,
          online_at: new Date().toISOString(),
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [channel, user]);

  const isUserOnline = useCallback(
    (userId: string) => {
      return onlineUsers.has(userId);
    },
    [onlineUsers]
  );

  return (
    <PresenceContext.Provider value={{ onlineUsers, isUserOnline }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}
