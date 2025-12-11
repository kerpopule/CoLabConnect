import { Link, useLocation } from "wouter";
import { Users, MessageCircle, Moon, Sun, LogOut, UserCog, UserCheck, User } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { QRCodeButton } from "./QRCodeButton";
import { PWAInstallPrompt } from "./PWAInstallPrompt";
import { NotificationPermissionPrompt } from "./NotificationPermissionPrompt";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { saveLastRoute } from "@/pages/Home";

// Detect if device is tablet (touch device with larger screen)
const isTablet = () => {
  if (typeof window === 'undefined') return false;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isLargeScreen = window.innerWidth >= 768;
  return hasTouch && isLargeScreen;
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  // Initialize from localStorage, then DOM state, then default to false
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem("colab_theme");
    if (stored) return stored === "dark";
    return document.documentElement.classList.contains("dark");
  });
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const sidebarRef = useRef<HTMLElement>(null);
  const { user, profile, signOut, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Track currently viewed chat to exclude from badge counts
  const [currentChatView, setCurrentChatView] = useState<{
    activeTab?: string;
    viewMode?: string;
    activeDm?: string | null;
    activeGroup?: string | null;
    activeTopic?: string | null;
  } | null>(null);

  // Listen for chat state changes from Chat.tsx (stored in sessionStorage)
  useEffect(() => {
    const updateChatView = () => {
      try {
        const cached = sessionStorage.getItem("colab-chat-state");
        if (cached) {
          setCurrentChatView(JSON.parse(cached));
        } else {
          setCurrentChatView(null);
        }
      } catch {
        setCurrentChatView(null);
      }
    };

    // Initial load
    updateChatView();

    // Listen for storage events (from same tab via custom event)
    const handleStorageChange = () => updateChatView();
    window.addEventListener("chat-state-changed", handleStorageChange);

    // Also poll when on chat page (sessionStorage doesn't fire events in same tab)
    const interval = setInterval(updateChatView, 1000);

    return () => {
      window.removeEventListener("chat-state-changed", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Fetch pending connection requests count
  const { data: pendingRequestsCount = 0 } = useQuery({
    queryKey: ["pending-requests-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { count, error } = await supabase
        .from("connections")
        .select("*", { count: "exact", head: true })
        .eq("following_id", user.id)
        .eq("status", "pending");

      if (error) return 0;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch DM mute settings for filtering
  const { data: dmMuteSettings = {} } = useQuery({
    queryKey: ["dm-mute-settings", user?.id],
    queryFn: async () => {
      if (!user) return {};
      const { data, error } = await supabase
        .from("dm_settings")
        .select("other_user_id, muted")
        .eq("user_id", user.id);
      if (error) return {};
      const settings: Record<string, boolean> = {};
      for (const row of data || []) {
        settings[row.other_user_id] = row.muted;
      }
      return settings;
    },
    enabled: !!user,
  });

  // Check if currently viewing a specific DM
  const isViewingDm = currentChatView?.viewMode === "chat" &&
                      currentChatView?.activeTab === "dms" &&
                      currentChatView?.activeDm;

  // Fetch unread private messages count (DMs) - excludes muted conversations and currently viewed DM
  const { data: unreadDmCount = 0 } = useQuery({
    queryKey: ["unread-messages-count", user?.id, dmMuteSettings, isViewingDm ? currentChatView?.activeDm : null],
    queryFn: async () => {
      if (!user) return 0;

      // Get all unread messages grouped by sender
      const { data, error } = await supabase
        .from("private_messages")
        .select("sender_id")
        .eq("receiver_id", user.id)
        .is("read_at", null);

      if (error || !data) return 0;

      // Filter out messages from muted senders and currently viewed DM
      const unmutedMessages = data.filter(msg => {
        if (dmMuteSettings[msg.sender_id]) return false;
        // Exclude messages from currently viewed DM
        if (isViewingDm && msg.sender_id === currentChatView?.activeDm) return false;
        return true;
      });
      return unmutedMessages.length;
    },
    enabled: !!user,
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  // Check if currently viewing a specific group
  const isViewingGroup = currentChatView?.viewMode === "chat" &&
                         currentChatView?.activeTab === "groups" &&
                         currentChatView?.activeGroup;

  // Fetch unread group messages count + pending invites (excludes muted groups and currently viewed group)
  const { data: unreadGroupCount = 0 } = useQuery({
    queryKey: ["unread-group-count", user?.id, isViewingGroup ? currentChatView?.activeGroup : null],
    queryFn: async () => {
      if (!user) return 0;

      // Get user's group memberships (includes muted status)
      const { data: memberships, error: memberError } = await supabase
        .from("group_chat_members")
        .select("group_id, status, last_read_at, muted")
        .eq("user_id", user.id);

      if (memberError || !memberships) return 0;

      let totalUnread = 0;

      for (const membership of memberships) {
        // Skip muted groups
        if (membership.muted) continue;
        // Skip currently viewed group
        if (isViewingGroup && membership.group_id === currentChatView?.activeGroup) continue;

        if (membership.status === "pending") {
          // Pending invites count as 1 unread each
          totalUnread += 1;
        } else if (membership.status === "accepted") {
          // Count unread messages in accepted groups
          let query = supabase
            .from("group_messages")
            .select("*", { count: "exact", head: true })
            .eq("group_id", membership.group_id)
            .neq("user_id", user.id)
            .is("deleted_at", null);

          if (membership.last_read_at) {
            query = query.gt("created_at", membership.last_read_at);
          }

          const { count } = await query;
          totalUnread += count || 0;
        }
      }

      return totalUnread;
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Check if currently viewing a specific topic
  const isViewingTopic = currentChatView?.viewMode === "chat" &&
                         currentChatView?.activeTab === "general" &&
                         currentChatView?.activeTopic;

  // Fetch unread topic messages count (General channels) - excludes muted topics and currently viewed topic
  const { data: unreadTopicCount = 0 } = useQuery({
    queryKey: ["unread-topic-count", user?.id, isViewingTopic ? currentChatView?.activeTopic : null],
    queryFn: async () => {
      if (!user) return 0;

      // Get all topics
      const { data: topics, error: topicsError } = await supabase
        .from("topics")
        .select("id");

      if (topicsError || !topics) return 0;

      // Get user's topic read status
      const { data: readStatus } = await supabase
        .from("topic_read_status")
        .select("topic_id, last_read_at")
        .eq("user_id", user.id);

      const readStatusMap: Record<string, string> = {};
      for (const rs of readStatus || []) {
        readStatusMap[rs.topic_id] = rs.last_read_at;
      }

      // Get user's topic mute settings
      const { data: topicMuteData } = await supabase
        .from("topic_settings")
        .select("topic_id, muted")
        .eq("user_id", user.id);

      const topicMuteMap: Record<string, boolean> = {};
      for (const ts of topicMuteData || []) {
        topicMuteMap[ts.topic_id] = ts.muted;
      }

      let totalUnread = 0;

      for (const topic of topics) {
        // Skip muted topics
        if (topicMuteMap[topic.id]) continue;
        // Skip currently viewed topic
        if (isViewingTopic && topic.id === currentChatView?.activeTopic) continue;

        const lastRead = readStatusMap[topic.id];

        let query = supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("topic_id", topic.id)
          .neq("user_id", user.id);

        if (lastRead) {
          query = query.gt("created_at", lastRead);
        }

        const { count } = await query;
        totalUnread += count || 0;
      }

      return totalUnread;
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Combined chat unread count
  const totalChatUnread = unreadDmCount + unreadGroupCount + unreadTopicCount;

  // Real-time subscription for badge counts
  useEffect(() => {
    if (!user) return;

    // Subscribe to connection changes for pending requests badge
    const connectionsChannel = supabase
      .channel(`layout-connections:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `following_id=eq.${user.id}`,
        },
        () => {
          // Refetch pending requests count on any change - invalidate both with and without user.id
          queryClient.invalidateQueries({ queryKey: ["pending-requests-count", user.id] });
          queryClient.invalidateQueries({ queryKey: ["pending-requests-count"] });
        }
      )
      .subscribe();

    // Subscribe to private message changes for unread DM badge
    const messagesChannel = supabase
      .channel(`layout-messages:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "private_messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          // Refetch unread messages count on any change
          queryClient.invalidateQueries({ queryKey: ["unread-messages-count"] });
        }
      )
      .subscribe();

    // Subscribe to group message changes for unread group badge
    const groupMessagesChannel = supabase
      .channel(`layout-group-messages:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
        },
        (payload) => {
          // Only update if not own message
          if ((payload.new as any).user_id !== user.id) {
            queryClient.invalidateQueries({ queryKey: ["unread-group-count", user.id] });
          }
        }
      )
      .subscribe();

    // Subscribe to group membership changes (invites, accept/decline)
    const groupMembersChannel = supabase
      .channel(`layout-group-members:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_chat_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["unread-group-count", user.id] });
        }
      )
      .subscribe();

    // Subscribe to topic message changes for unread topic badge
    const topicMessagesChannel = supabase
      .channel(`layout-topic-messages:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          // Only update if not own message
          if ((payload.new as any).user_id !== user.id) {
            queryClient.invalidateQueries({ queryKey: ["unread-topic-count", user.id] });
          }
        }
      )
      .subscribe();

    // Subscribe to topic read status changes (cross-device sync)
    const topicReadStatusChannel = supabase
      .channel(`layout-topic-read:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "topic_read_status",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["unread-topic-count", user.id] });
        }
      )
      .subscribe();

    // Subscribe to topics table changes (admin adds/renames/deletes topics)
    const topicsChannel = supabase
      .channel("layout-topics-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "topics",
        },
        () => {
          // Refetch topic unread count when topics change
          queryClient.invalidateQueries({ queryKey: ["unread-topic-count", user.id] });
        }
      )
      .subscribe();

    // Subscribe to group_chats table changes (name/emoji changes)
    const groupChatsChannel = supabase
      .channel(`layout-group-chats:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_chats",
        },
        () => {
          // Refetch group unread count when groups change
          queryClient.invalidateQueries({ queryKey: ["unread-group-count", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(connectionsChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(groupMessagesChannel);
      supabase.removeChannel(groupMembersChannel);
      supabase.removeChannel(topicMessagesChannel);
      supabase.removeChannel(topicReadStatusChannel);
      supabase.removeChannel(topicsChannel);
      supabase.removeChannel(groupChatsChannel);
    };
  }, [user, queryClient]);

  useEffect(() => {
    // Check localStorage first, then system preference
    const stored = localStorage.getItem("colab_theme");
    if (stored) {
      const shouldBeDark = stored === "dark";
      setIsDark(shouldBeDark);
      if (shouldBeDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }

    // Update meta theme-color immediately on mount
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      const currentIsDark = document.documentElement.classList.contains("dark");
      metaThemeColor.setAttribute("content", currentIsDark ? "#0f172a" : "#f8fafc");
    }
  }, []);

  // Detect keyboard visibility on mobile (for hiding tab bar)
  useEffect(() => {
    // Track if an input is focused - this is the source of truth for showing keyboard
    let inputIsFocused = false;

    const setKeyboardState = (isOpen: boolean) => {
      console.log('[Layout] setKeyboardState:', isOpen);
      setIsKeyboardOpen(isOpen);
      // Also add/remove body class AND data attribute for CSS-based hiding
      if (isOpen) {
        document.body.classList.add('keyboard-open');
        document.body.setAttribute('data-keyboard', 'open');
      } else {
        document.body.classList.remove('keyboard-open');
        document.body.removeAttribute('data-keyboard');
      }
    };

    // Check if an input is currently focused
    const isInputElement = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
    };

    // Method 1: Track focus on text inputs - PRIMARY METHOD
    // This is the most reliable way to know if keyboard should be visible
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (isInputElement(target)) {
        console.log('[Layout] Input focused, hiding nav');
        inputIsFocused = true;
        setKeyboardState(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      // Only show nav if not focusing another input
      if (!isInputElement(relatedTarget)) {
        // Delay to handle iOS quirks with keyboard transitions
        setTimeout(() => {
          // Double-check that no input is focused
          if (!isInputElement(document.activeElement)) {
            console.log('[Layout] No input focused, showing nav');
            inputIsFocused = false;
            setKeyboardState(false);
          }
        }, 200);
      }
    };

    // Method 2: VisualViewport API - SECONDARY check
    // Only use this to detect if keyboard is ALSO open (not to show nav)
    const handleViewportResize = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const ratio = viewportHeight / windowHeight;
        const viewportSaysKeyboard = ratio < 0.85;

        console.log('[Layout] Viewport resize:', { ratio: ratio.toFixed(2), viewportSaysKeyboard, inputIsFocused });

        // If input is focused, keyboard should always be hidden
        // Only show nav if BOTH: input not focused AND viewport is full height
        if (inputIsFocused) {
          // Input focused = always hide nav
          setKeyboardState(true);
        } else if (!viewportSaysKeyboard) {
          // Input not focused AND viewport is full = show nav
          setKeyboardState(false);
        }
        // If input not focused but viewport is small, keep current state
        // (might be in transition)
      }
    };

    // Check current state on mount
    if (isInputElement(document.activeElement)) {
      inputIsFocused = true;
      setKeyboardState(true);
    }

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    window.visualViewport?.addEventListener('resize', handleViewportResize);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      document.body.classList.remove('keyboard-open');
      document.body.removeAttribute('data-keyboard');
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Signed out",
        description: "You have been signed out successfully.",
      });
      setLocation("/");
    } catch (error) {
      console.error("Sign out error:", error);
      toast({
        variant: "destructive",
        title: "Sign out failed",
        description: "Please try again.",
      });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    localStorage.setItem("colab_theme", newDark ? "dark" : "light");
    if (newDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Desktop nav items (Profile instead of Home)
  const desktopNavItems = [
    { href: user ? "/my-profile" : "/login", icon: User, label: "Profile", badge: 0 },
    { href: "/directory", icon: Users, label: "Directory", badge: 0 },
    { href: "/connections", icon: UserCheck, label: "Connections", badge: pendingRequestsCount },
    { href: "/chat", icon: MessageCircle, label: "Chat", badge: totalChatUnread },
  ];

  // Mobile nav items (Profile instead of Home)
  const mobileNavItems = [
    { href: user ? "/my-profile" : "/login", icon: User, label: "Profile", badge: 0 },
    { href: "/directory", icon: Users, label: "Directory", badge: 0 },
    { href: "/connections", icon: UserCheck, label: "Connections", badge: pendingRequestsCount },
    { href: "/chat", icon: MessageCircle, label: "Chat", badge: totalChatUnread },
  ];

  // Chat page needs fixed height to prevent outer scroll
  const isChatPage = location === "/chat";

  // Add/remove chat-page-active class on body for mobile scroll lock
  useEffect(() => {
    if (isChatPage) {
      document.body.classList.add("chat-page-active");
    } else {
      document.body.classList.remove("chat-page-active");
    }
    return () => {
      document.body.classList.remove("chat-page-active");
    };
  }, [isChatPage]);

  // Update theme-color meta tag based on dark mode
  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      // Light mode: #f8fafc (very light cool gray), Dark mode: #0f172a (deep slate)
      metaThemeColor.setAttribute("content", isDark ? "#0f172a" : "#f8fafc");
    }
  }, [isDark]);

  // Lock to portrait orientation on mobile PWA
  useEffect(() => {
    // Only attempt on mobile devices (phones, not tablets)
    const isMobilePhone = window.innerWidth <= 480 ||
      (window.matchMedia && window.matchMedia('(max-width: 480px)').matches);

    // Check if running as installed PWA (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isMobilePhone && isStandalone && screen.orientation?.lock) {
      // Try to lock to portrait
      screen.orientation.lock('portrait-primary').catch((err) => {
        // Silently fail - not all browsers support this
        console.log('[Layout] Could not lock orientation:', err.message);
      });
    }

    return () => {
      // Unlock on cleanup (though this component rarely unmounts)
      if (screen.orientation?.unlock) {
        screen.orientation.unlock();
      }
    };
  }, []);

  // Save current route to localStorage for returning users
  useEffect(() => {
    if (user) {
      saveLastRoute(location);
    }
  }, [location, user]);

  // Expose global navigation function for push notification handling
  useEffect(() => {
    (window as any).__colabNavigate = setLocation;
    return () => {
      delete (window as any).__colabNavigate;
    };
  }, [setLocation]);

  // Sidebar collapse/expand behavior for desktop and tablet
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    // Only apply to desktop/tablet (md and up)
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    if (!mediaQuery.matches) return;

    const tablet = isTablet();

    if (tablet) {
      // Tablet: click anywhere on sidebar (not on buttons) to expand
      // Click outside to collapse
      const handleSidebarClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        // Check if click is on a link or button
        const isInteractive = target.closest('a, button, [role="button"]');
        if (!isInteractive && sidebarCollapsed) {
          e.preventDefault();
          e.stopPropagation();
          setSidebarCollapsed(false);
        }
      };

      const handleOutsideClick = (e: MouseEvent) => {
        if (!sidebar.contains(e.target as Node)) {
          setSidebarCollapsed(true);
        }
      };

      sidebar.addEventListener('click', handleSidebarClick);
      document.addEventListener('click', handleOutsideClick);

      return () => {
        sidebar.removeEventListener('click', handleSidebarClick);
        document.removeEventListener('click', handleOutsideClick);
      };
    } else {
      // Desktop: hover to expand, leave to collapse
      const handleMouseEnter = () => setSidebarCollapsed(false);
      const handleMouseLeave = () => setSidebarCollapsed(true);

      sidebar.addEventListener('mouseenter', handleMouseEnter);
      sidebar.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        sidebar.removeEventListener('mouseenter', handleMouseEnter);
        sidebar.removeEventListener('mouseleave', handleMouseLeave);
      };
    }
  }, [sidebarCollapsed]);

  return (
    <div className={`bg-background flex flex-col ${isKeyboardOpen ? 'pb-0' : 'pb-24'} md:pb-0 font-sans ${isChatPage ? "h-dvh overflow-hidden fixed inset-0 md:relative md:h-screen" : "min-h-screen"}`}>
      {/* Mobile Top Bar - only show on profile page */}
      {(location === "/my-profile" || location === "/profile/edit") && (
        <header className="md:hidden flex justify-end items-center p-4 fixed top-0 left-0 right-0 z-50">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-background/50 backdrop-blur-md border border-border shadow-sm"
            onClick={toggleTheme}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </header>
      )}

      {/* Desktop Sidebar / Mobile Bottom Nav */}
      <nav
        ref={sidebarRef}
        className={`mobile-nav fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-lg border-t border-border md:top-0 md:bottom-auto md:h-screen md:border-r md:border-t-0 md:flex md:flex-col md:p-4 transition-all duration-300 ease-in-out ${isKeyboardOpen ? 'translate-y-full md:translate-y-0' : ''} ${sidebarCollapsed ? 'md:w-20' : 'md:w-64 md:p-6'}`}
      >
        <div className="hidden md:block mb-8">
          <div className={`flex items-center mb-4 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            <h1 className="text-2xl font-display font-bold text-primary">Co:Lab</h1>
            {!sidebarCollapsed && (
              <Button variant="ghost" size="icon" onClick={toggleTheme}>
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
            )}
          </div>
          {/* User info */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center w-full p-2 rounded-xl hover:bg-muted transition-colors text-left ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.name || 'User'} />
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {profile ? getInitials(profile.name) : user.email?.[0].toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{profile?.name || user.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{profile?.role || 'Member'}</p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => setLocation("/profile/edit")}>
                  <UserCog className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : !loading ? (
            <Link href="/login">
              <Button variant="outline" className={`hover:bg-primary/10 hover:border-primary hover:scale-[1.02] hover:shadow-md transition-all ${sidebarCollapsed ? 'w-12 h-12 p-0' : 'w-full'}`}>
                {sidebarCollapsed ? <User className="h-5 w-5" /> : 'Sign In'}
              </Button>
            </Link>
          ) : null}
        </div>

        {/* Mobile Navigation */}
        <ul className="flex justify-around items-center h-20 md:hidden">
          {mobileNavItems.map((item) => {
            const isActive = location === item.href || (item.href === "/my-profile" && location.startsWith("/my-profile"));
            return (
              <li key={item.href} className="flex-1">
                <Link href={item.href}>
                  <div className={`relative flex flex-col items-center justify-center py-2 rounded-xl transition-all duration-200 cursor-pointer ${isActive ? "text-primary font-medium bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                    <div className="relative">
                      <item.icon className={`h-7 w-7 ${isActive ? "stroke-[2.5px]" : "stroke-2"}`} />
                      {item.badge > 0 && (
                        <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                          {item.badge > 9 ? "9+" : item.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-xs mt-1.5">{item.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
          {/* Mobile QR Code Button in Nav */}
          <li className="flex-1 flex justify-center">
            <QRCodeButton />
          </li>
        </ul>

        {/* Desktop Navigation */}
        <ul className="hidden md:flex md:flex-col md:space-y-2 md:items-stretch">
          {desktopNavItems.map((item) => {
            const isActive = location === item.href;
            return (
              <li key={item.href}>
                <Link href={item.href}>
                  <div className={`relative flex flex-row items-center px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer ${sidebarCollapsed ? 'justify-center' : 'justify-start'} ${isActive ? "text-primary font-medium bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                    <div className="relative flex-shrink-0">
                      <item.icon className={`h-6 w-6 ${sidebarCollapsed ? '' : 'mr-3'} ${isActive ? "stroke-[2.5px]" : "stroke-2"}`} />
                      {item.badge > 0 && (
                        <span className="absolute -top-1 -right-0 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                          {item.badge > 9 ? "9+" : item.badge}
                        </span>
                      )}
                    </div>
                    {!sidebarCollapsed && <span className="text-sm">{item.label}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Desktop QR Code Button */}
        <div className="hidden md:block mt-auto">
          <QRCodeButton mode={sidebarCollapsed ? "collapsed" : "desktop"} />
        </div>
      </nav>

      {/* Main content area - offset by sidebar width, then center content within remaining space */}
      <div className={`flex-1 flex flex-col min-h-0 transition-all duration-300 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        <main className={`p-4 md:p-8 max-w-5xl mx-auto w-full animate-in fade-in duration-500 ${isChatPage ? "overflow-hidden flex flex-col flex-1 min-h-0" : ""}`}>
          {children}
        </main>
      </div>

      {/* PWA Install Prompt - shows on first login and weekly until installed */}
      <PWAInstallPrompt isLoggedIn={!!user} />

      {/* Notification Permission Prompt - shows for PWA users and first-time web users */}
      <NotificationPermissionPrompt isLoggedIn={!!user} />
    </div>
  );
}
