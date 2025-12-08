import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, LogIn, Lock, MessageCircle, Users, Sparkles, Bell, BellOff, ArrowLeft, Trash2, ChevronDown, Settings, Plus, UserPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Topic, Message, Profile, PrivateMessage, getPrivateChatId, GroupChat, GroupMessage, GroupChatMember } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link, useLocation, useSearch } from "wouter";
import ReactMarkdown from "react-markdown";
import { useTopicFollow, usePushNotifications } from "@/hooks/usePushNotifications";
import { NotificationEnableButton, NotificationPrompt, useDmNotificationPrompt } from "@/components/NotificationPrompt";
import { MessageWrapper, DeletedMessage, EditedIndicator, MessageActions } from "@/components/MessageContextMenu";
import { MessageContent } from "@/components/LinkPreview";
import { EmojiReactions, AddReactionButton } from "@/components/EmojiReactions";
import { ChatImageUpload, ChatImage, isImageUrl } from "@/components/ChatImageUpload";
import { useToast } from "@/hooks/use-toast";
import ChatTileGrid from "@/components/ChatTileGrid";
import GroupCreateModal from "@/components/GroupCreateModal";
import ConnectionsList from "@/components/ConnectionsList";

type AIMessage = {
  id: string;
  role: "user" | "ai";
  content: string;
  created_at: string;
};

// Fallback topics when database is empty - MUST match TOPIC_ORDER below
const FALLBACK_TOPICS = [
  { id: "general", slug: "general", name: "General", icon: "💬", description: "", created_at: "" },
  { id: "events", slug: "events", name: "Events", icon: "📅", description: "", created_at: "" },
  { id: "tech", slug: "tech", name: "Tech", icon: "💻", description: "", created_at: "" },
  { id: "fundraising", slug: "fundraising", name: "Fundraising", icon: "💰", description: "", created_at: "" },
  { id: "hiring", slug: "hiring", name: "Hiring", icon: "💼", description: "", created_at: "" },
];

type MessageWithProfile = Message & {
  profiles: Profile | null | undefined;
};

type PrivateChat = {
  otherId: string;
  profile: Profile;
};

type ActiveTab = "groups" | "general" | "dms" | "ai";
type ViewMode = "list" | "chat";

export default function Chat() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const dmUserId = searchParams.get("dm");
  const groupIdFromUrl = searchParams.get("group");
  const tabFromUrl = searchParams.get("tab") as ActiveTab | null;

  // Navigation state
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    dmUserId ? "dms" : groupIdFromUrl ? "groups" : tabFromUrl || "general"
  );
  const [viewMode, setViewMode] = useState<ViewMode>(
    dmUserId || groupIdFromUrl ? "chat" : "list"
  );

  // Chat state
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [activeDm, setActiveDm] = useState<string | null>(dmUserId);
  const [activeGroup, setActiveGroup] = useState<string | null>(groupIdFromUrl);
  const [input, setInput] = useState("");

  // AI state
  const [aiMessages, setAiMessages] = useState<AIMessage[]>(() => {
    const saved = localStorage.getItem("colab-ai-messages");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [{
      id: "welcome",
      role: "ai" as const,
      content: "Hi! I'm your Co:Lab AI Guide. Ask me anything like 'Who works in fintech?' or 'How do I connect with investors?'",
      created_at: new Date().toISOString(),
    }];
  });
  const [aiPending, setAiPending] = useState(false);

  // Modal state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showInviteMembers, setShowInviteMembers] = useState(false);

  const { user, profile: currentUserProfile, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Fetch muted users for the current user
  const { data: mutedUserIds = [] } = useQuery({
    queryKey: ["muted-users", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("muted_users")
        .select("muted_user_id")
        .eq("user_id", user.id);
      if (error) {
        console.error("Error fetching muted users:", error);
        return [];
      }
      return data.map((row: { muted_user_id: string }) => row.muted_user_id);
    },
    enabled: !!user,
  });

  // Mute a user
  const handleMuteUser = async (mutedUserId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("muted_users")
      .insert({ user_id: user.id, muted_user_id: mutedUserId });
    if (error) {
      console.error("Error muting user:", error);
      toast({
        variant: "destructive",
        title: "Failed to mute user",
        description: "Please try again.",
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["muted-users", user.id] });
    toast({
      title: "User muted",
      description: "You won't see their messages in group chats anymore.",
    });
  };

  // Unmute a user
  const handleUnmuteUser = async (mutedUserId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("muted_users")
      .delete()
      .eq("user_id", user.id)
      .eq("muted_user_id", mutedUserId);
    if (error) {
      console.error("Error unmuting user:", error);
      toast({
        variant: "destructive",
        title: "Failed to unmute user",
        description: "Please try again.",
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["muted-users", user.id] });
    toast({
      title: "User unmuted",
      description: "You'll see their messages again.",
    });
  };

  // Reply to a user - adds @mention to input
  const handleReplyToUser = (senderName: string) => {
    setInput(`@${senderName} `);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Topic follow for notifications
  const { isFollowing: isFollowingTopic, isLoading: followLoading, toggleFollow } = useTopicFollow(activeTopic);

  // Push notifications state
  const { isSubscribed: hasNotificationsEnabled } = usePushNotifications();

  // DM notification prompt (weekly)
  const { showPrompt: showDmPrompt, setShowPrompt: setShowDmPrompt, triggerPrompt: triggerDmPrompt } = useDmNotificationPrompt();

  // Topic notification prompt (when clicking bell)
  const [showTopicPrompt, setShowTopicPrompt] = useState(false);

  // Save AI messages to localStorage
  useEffect(() => {
    if (aiMessages.length > 0) {
      localStorage.setItem("colab-ai-messages", JSON.stringify(aiMessages));
    }
  }, [aiMessages]);

  // Mark messages as read when opening a private chat
  const markMessagesAsRead = useCallback(async (senderId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from("private_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", senderId)
      .eq("receiver_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("Error marking messages as read:", error);
    } else {
      queryClient.invalidateQueries({ queryKey: ["unread-messages-count"] });
      queryClient.refetchQueries({ queryKey: ["unread-messages-count"] });
    }
  }, [user, queryClient]);

  // Update group last_read_at when viewing group chat
  const markGroupAsRead = useCallback(async (groupId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from("group_chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("group_id", groupId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error marking group as read:", error);
    } else {
      queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
    }
  }, [user, queryClient]);

  // Handle URL parameter changes for navigation from push notifications
  useEffect(() => {
    if (dmUserId) {
      setActiveTab("dms");
      setActiveDm(dmUserId);
      setViewMode("chat");
      markMessagesAsRead(dmUserId);
    } else if (groupIdFromUrl) {
      setActiveTab("groups");
      setActiveGroup(groupIdFromUrl);
      setViewMode("chat");
      markGroupAsRead(groupIdFromUrl);
    } else if (tabFromUrl) {
      setActiveTab(tabFromUrl);
      setViewMode("list");
    }
  }, [dmUserId, groupIdFromUrl, tabFromUrl, markMessagesAsRead, markGroupAsRead]);

  // Custom topic order: General first, then Events, Tech, Fundraising, Hiring, then others
  const TOPIC_ORDER = ["general", "events", "tech", "fundraising", "hiring"];

  // Fetch topics
  const { data: topics, isLoading: topicsLoading } = useQuery({
    queryKey: ["topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;

      const sortedData = (data as Topic[]).sort((a, b) => {
        const aIndex = TOPIC_ORDER.indexOf(a.slug?.toLowerCase() || a.name.toLowerCase());
        const bIndex = TOPIC_ORDER.indexOf(b.slug?.toLowerCase() || b.name.toLowerCase());

        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return 0;
      });

      return sortedData;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Fetch my private chats (accepted connections)
  const { data: privateChats } = useQuery({
    queryKey: ["private-chats", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: sentConnections } = await supabase
        .from("connections")
        .select(`
          *,
          following_profile:profiles!connections_following_id_fkey(*)
        `)
        .eq("follower_id", user.id)
        .eq("status", "accepted");

      const { data: receivedConnections } = await supabase
        .from("connections")
        .select(`
          *,
          follower_profile:profiles!connections_follower_id_fkey(*)
        `)
        .eq("following_id", user.id)
        .eq("status", "accepted");

      const chats: PrivateChat[] = [];
      const seenIds = new Set<string>();

      if (sentConnections) {
        sentConnections.forEach((c: any) => {
          if (c.following_profile && !seenIds.has(c.following_id)) {
            seenIds.add(c.following_id);
            chats.push({
              otherId: c.following_id,
              profile: c.following_profile,
            });
          }
        });
      }

      if (receivedConnections) {
        receivedConnections.forEach((c: any) => {
          if (c.follower_profile && !seenIds.has(c.follower_id)) {
            seenIds.add(c.follower_id);
            chats.push({
              otherId: c.follower_id,
              profile: c.follower_profile,
            });
          }
        });
      }

      return chats;
    },
    enabled: !!user,
  });

  // Fetch group chats
  const { data: groupChats } = useQuery({
    queryKey: ["group-chats", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get groups where user is a member
      const { data: memberData, error: memberError } = await supabase
        .from("group_chat_members")
        .select(`
          *,
          group:group_chats(
            *,
            members:group_chat_members(
              *,
              profiles(*)
            )
          )
        `)
        .eq("user_id", user.id);

      if (memberError) {
        console.error("Error fetching group chats:", memberError);
        return [];
      }

      // Transform data and calculate unread counts
      const groups = await Promise.all(
        (memberData || []).map(async (membership: any) => {
          const group = membership.group;
          if (!group) return null;

          // Get latest message timestamp
          const { data: latestMsg } = await supabase
            .from("group_messages")
            .select("created_at")
            .eq("group_id", group.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          // Count unread messages
          let unreadCount = 0;
          if (membership.last_read_at) {
            const { count } = await supabase
              .from("group_messages")
              .select("*", { count: "exact", head: true })
              .eq("group_id", group.id)
              .gt("created_at", membership.last_read_at)
              .is("deleted_at", null);
            unreadCount = count || 0;
          } else if (membership.status === "accepted") {
            // If never read, count all messages
            const { count } = await supabase
              .from("group_messages")
              .select("*", { count: "exact", head: true })
              .eq("group_id", group.id)
              .is("deleted_at", null);
            unreadCount = count || 0;
          }

          return {
            ...group,
            membership_status: membership.status,
            membership_role: membership.role,
            unread_count: unreadCount,
            latest_message_at: latestMsg?.created_at || group.created_at,
          };
        })
      );

      // Filter out nulls and sort by latest activity
      return groups
        .filter(Boolean)
        .sort((a: any, b: any) =>
          new Date(b.latest_message_at).getTime() - new Date(a.latest_message_at).getTime()
        );
    },
    enabled: !!user,
  });

  // Get DMs with message history for sorting
  const { data: dmsWithHistory } = useQuery({
    queryKey: ["dms-with-history", user?.id, privateChats],
    queryFn: async () => {
      if (!user || !privateChats) return { active: [], connections: [] };

      const activeChats: { profile: Profile; lastMessageAt: string | null; unreadCount: number }[] = [];
      const connectionsOnly: { profile: Profile; lastMessageAt: string | null; unreadCount: number }[] = [];

      for (const chat of privateChats) {
        // Get latest message
        const { data: latestMsg } = await supabase
          .from("private_messages")
          .select("created_at")
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${chat.otherId}),and(sender_id.eq.${chat.otherId},receiver_id.eq.${user.id})`)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        // Get unread count
        const { count: unreadCount } = await supabase
          .from("private_messages")
          .select("*", { count: "exact", head: true })
          .eq("sender_id", chat.otherId)
          .eq("receiver_id", user.id)
          .is("read_at", null);

        const item = {
          profile: chat.profile,
          lastMessageAt: latestMsg?.created_at || null,
          unreadCount: unreadCount || 0,
        };

        if (latestMsg) {
          activeChats.push(item);
        } else {
          connectionsOnly.push(item);
        }
      }

      // Sort active chats by most recent message
      activeChats.sort((a, b) =>
        new Date(b.lastMessageAt!).getTime() - new Date(a.lastMessageAt!).getTime()
      );

      return { active: activeChats, connections: connectionsOnly };
    },
    enabled: !!user && !!privateChats,
  });

  // Get the active DM user profile
  const activeDmProfile = privateChats?.find((c) => c.otherId === activeDm)?.profile;

  // Get active group details
  const activeGroupData = groupChats?.find((g: any) => g.id === activeGroup);

  // Only use real topics from database, fallback topics are just for display during loading
  const displayTopics = topics && topics.length > 0 ? topics : FALLBACK_TOPICS;
  const hasRealTopics = topics && topics.length > 0;

  // Fetch messages for active topic (public chat)
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", activeTopic],
    queryFn: async () => {
      if (!activeTopic) return [];

      const { data, error } = await supabase
        .from("messages")
        .select(`
          *,
          profiles:user_id (*)
        `)
        .eq("topic_id", activeTopic)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      return data as MessageWithProfile[];
    },
    enabled: !!activeTopic && viewMode === "chat" && activeTab === "general",
  });

  // Fetch private messages for active DM
  const { data: privateMessages, isLoading: privateMessagesLoading } = useQuery({
    queryKey: ["private-messages", user?.id, activeDm],
    queryFn: async () => {
      if (!user || !activeDm) return [];

      const { data, error } = await supabase
        .from("private_messages")
        .select(`
          *,
          sender_profile:profiles!private_messages_sender_id_fkey(*),
          receiver_profile:profiles!private_messages_receiver_id_fkey(*)
        `)
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeDm}),and(sender_id.eq.${activeDm},receiver_id.eq.${user.id})`)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      return data as PrivateMessage[];
    },
    enabled: !!user && !!activeDm && viewMode === "chat" && activeTab === "dms",
  });

  // Fetch group messages
  const { data: groupMessages, isLoading: groupMessagesLoading } = useQuery({
    queryKey: ["group-messages", activeGroup],
    queryFn: async () => {
      if (!activeGroup) return [];

      const { data, error } = await supabase
        .from("group_messages")
        .select(`
          *,
          profiles:user_id (*)
        `)
        .eq("group_id", activeGroup)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      return data as (GroupMessage & { profiles: Profile | null })[];
    },
    enabled: !!activeGroup && viewMode === "chat" && activeTab === "groups",
  });

  // Real-time subscription for new messages (public)
  useEffect(() => {
    if (!activeTopic || viewMode !== "chat" || activeTab !== "general") return;

    const channel = supabase
      .channel(`messages:${activeTopic}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `topic_id=eq.${activeTopic}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;

          if (newMsg.user_id === user?.id) return;

          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", newMsg.user_id)
            .single();

          const newMessage: MessageWithProfile = {
            ...newMsg,
            profiles: profileData || undefined,
          };

          queryClient.setQueryData<MessageWithProfile[]>(
            ["messages", activeTopic],
            (old) => {
              if (old?.some(m => m.id === newMessage.id)) return old;
              return [...(old || []), newMessage];
            }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTopic, viewMode, activeTab, queryClient, user?.id]);

  // Real-time subscription for private messages
  useEffect(() => {
    if (!user || !activeDm || viewMode !== "chat" || activeTab !== "dms") return;

    const channel = supabase
      .channel(`private:${getPrivateChatId(user.id, activeDm)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_messages",
        },
        async (payload) => {
          const newMsg = payload.new as PrivateMessage;

          if (newMsg.sender_id === user.id) return;

          if (
            (newMsg.sender_id === user.id && newMsg.receiver_id === activeDm) ||
            (newMsg.sender_id === activeDm && newMsg.receiver_id === user.id)
          ) {
            const { data: senderProfile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", newMsg.sender_id)
              .single();

            const messageWithProfile: PrivateMessage = {
              ...newMsg,
              sender_profile: senderProfile || undefined,
            };

            queryClient.setQueryData<PrivateMessage[]>(
              ["private-messages", user.id, activeDm],
              (old) => {
                if (old?.some(m => m.id === messageWithProfile.id)) return old;
                return [...(old || []), messageWithProfile];
              }
            );

            triggerDmPrompt();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeDm, viewMode, activeTab, queryClient, triggerDmPrompt]);

  // Real-time subscription for group messages
  useEffect(() => {
    if (!user || !activeGroup || viewMode !== "chat" || activeTab !== "groups") return;

    const channel = supabase
      .channel(`group:${activeGroup}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${activeGroup}`,
        },
        async (payload) => {
          const newMsg = payload.new as GroupMessage;

          if (newMsg.user_id === user.id) return;

          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", newMsg.user_id)
            .single();

          const newMessage = {
            ...newMsg,
            profiles: profileData || undefined,
          };

          queryClient.setQueryData(
            ["group-messages", activeGroup],
            (old: any) => {
              if (old?.some((m: any) => m.id === newMessage.id)) return old;
              return [...(old || []), newMessage];
            }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeGroup, viewMode, activeTab, queryClient]);

  // Scroll handling
  const checkIfAtBottom = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return true;

    const threshold = 100;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    return distanceFromBottom < threshold;
  }, []);

  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom);
  }, [checkIfAtBottom]);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToBottom = useCallback((smooth = true) => {
    const viewport = scrollViewportRef.current;
    if (viewport) {
      if (smooth) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: "smooth"
        });
      } else {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
    setShowScrollButton(false);
    setIsAtBottom(true);
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    setTimeout(() => {
      if (isAtBottom) {
        const viewport = scrollViewportRef.current;
        if (viewport) {
          viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: "smooth"
          });
        }
      }
    }, 100);
  }, [messages, privateMessages, groupMessages, aiMessages, isAtBottom]);

  // Always scroll to bottom on chat switch
  useEffect(() => {
    if (viewMode === "chat") {
      setTimeout(() => {
        scrollToBottom(false);
      }, 200);
    }
  }, [activeTopic, activeDm, activeGroup, viewMode, scrollToBottom]);

  // Send AI message
  const sendAiMessage = async (content: string) => {
    const userMessage: AIMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    setAiMessages((prev) => [...prev, userMessage]);
    setAiPending(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content,
          conversationHistory: aiMessages.slice(-10),
        }),
      });

      if (!response.ok) {
        throw new Error("AI service error");
      }

      const data = await response.json();

      const aiResponse: AIMessage = {
        id: `ai-${Date.now()}`,
        role: "ai",
        content: data.response || "I'm sorry, I couldn't generate a response.",
        created_at: new Date().toISOString(),
      };
      setAiMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error("AI chat error:", error);
      const errorResponse: AIMessage = {
        id: `ai-${Date.now()}`,
        role: "ai",
        content: "I'm sorry, I encountered an error. Please try again in a moment.",
        created_at: new Date().toISOString(),
      };
      setAiMessages((prev) => [...prev, errorResponse]);
    } finally {
      setAiPending(false);
    }
  };

  // Send public message mutation
  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !activeTopic) throw new Error("Not authenticated");

      const { data, error } = await supabase.from("messages").insert({
        topic_id: activeTopic,
        user_id: user.id,
        content,
      } as any).select().single();

      if (error) throw error;
      return data;
    },
    onMutate: async (content: string) => {
      if (!user || !activeTopic || !currentUserProfile) return;

      const optimisticMessage: MessageWithProfile = {
        id: `temp-${Date.now()}`,
        topic_id: activeTopic,
        user_id: user.id,
        content,
        created_at: new Date().toISOString(),
        profiles: currentUserProfile,
      };

      queryClient.setQueryData<MessageWithProfile[]>(
        ["messages", activeTopic],
        (old) => [...(old || []), optimisticMessage]
      );

      return { optimisticMessage };
    },
    onError: (error, _content, context) => {
      console.error("Failed to send message:", error);
      if (context?.optimisticMessage && activeTopic) {
        queryClient.setQueryData<MessageWithProfile[]>(
          ["messages", activeTopic],
          (old) => old?.filter(m => m.id !== context.optimisticMessage.id) || []
        );
      }
    },
    onSuccess: (data, _content, context) => {
      if (context?.optimisticMessage && data && activeTopic) {
        queryClient.setQueryData<MessageWithProfile[]>(
          ["messages", activeTopic],
          (old) => old?.map(m =>
            m.id === context.optimisticMessage.id
              ? { ...data, profiles: currentUserProfile }
              : m
          ) || []
        );
      }
    },
  });

  // Send private message mutation
  const sendPrivateMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !activeDm) throw new Error("Not authenticated");

      const { data, error } = await supabase.from("private_messages").insert({
        sender_id: user.id,
        receiver_id: activeDm,
        content,
      } as any).select().single();

      if (error) throw error;
      return data;
    },
    onMutate: async (content: string) => {
      if (!user || !activeDm || !currentUserProfile) return;

      const optimisticMessage: PrivateMessage = {
        id: `temp-${Date.now()}`,
        sender_id: user.id,
        receiver_id: activeDm,
        content,
        created_at: new Date().toISOString(),
        read_at: null,
        sender_profile: currentUserProfile,
      };

      queryClient.setQueryData<PrivateMessage[]>(
        ["private-messages", user.id, activeDm],
        (old) => [...(old || []), optimisticMessage]
      );

      return { optimisticMessage };
    },
    onError: (error, _content, context) => {
      console.error("Failed to send private message:", error);
      if (context?.optimisticMessage && user && activeDm) {
        queryClient.setQueryData<PrivateMessage[]>(
          ["private-messages", user.id, activeDm],
          (old) => old?.filter(m => m.id !== context.optimisticMessage.id) || []
        );
      }
    },
    onSuccess: (data, _content, context) => {
      if (context?.optimisticMessage && data && user && activeDm) {
        queryClient.setQueryData<PrivateMessage[]>(
          ["private-messages", user.id, activeDm],
          (old) => old?.map(m =>
            m.id === context.optimisticMessage.id
              ? { ...data, sender_profile: currentUserProfile }
              : m
          ) || []
        );
      }
    },
  });

  // Send group message mutation
  const sendGroupMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !activeGroup) throw new Error("Not authenticated");

      const { data, error } = await supabase.from("group_messages").insert({
        group_id: activeGroup,
        user_id: user.id,
        content,
      }).select().single();

      if (error) throw error;
      return data;
    },
    onMutate: async (content: string) => {
      if (!user || !activeGroup || !currentUserProfile) return;

      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        group_id: activeGroup,
        user_id: user.id,
        content,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        profiles: currentUserProfile,
      };

      queryClient.setQueryData(
        ["group-messages", activeGroup],
        (old: any) => [...(old || []), optimisticMessage]
      );

      return { optimisticMessage };
    },
    onError: (error, _content, context) => {
      console.error("Failed to send group message:", error);
      if (context?.optimisticMessage && activeGroup) {
        queryClient.setQueryData(
          ["group-messages", activeGroup],
          (old: any) => old?.filter((m: any) => m.id !== context.optimisticMessage.id) || []
        );
      }
    },
    onSuccess: (data, _content, context) => {
      if (context?.optimisticMessage && data && activeGroup) {
        queryClient.setQueryData(
          ["group-messages", activeGroup],
          (old: any) => old?.map((m: any) =>
            m.id === context.optimisticMessage.id
              ? { ...data, profiles: currentUserProfile }
              : m
          ) || []
        );
      }
    },
  });

  // Edit public message
  const handleEditMessage = async (messageId: string, newContent: string) => {
    let error;
    const result = await supabase
      .from("messages")
      .update({
        content: newContent,
        edited_at: new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("user_id", user?.id);

    error = result.error;

    if (error && error.message?.includes("edited_at")) {
      const fallbackResult = await supabase
        .from("messages")
        .update({ content: newContent })
        .eq("id", messageId)
        .eq("user_id", user?.id);
      error = fallbackResult.error;
    }

    if (error) {
      console.error("Edit message error:", error);
      throw error;
    }

    if (activeTopic) {
      queryClient.setQueryData<MessageWithProfile[]>(
        ["messages", activeTopic],
        (old) => old?.map(m =>
          m.id === messageId
            ? { ...m, content: newContent, edited_at: new Date().toISOString() }
            : m
        ) || []
      );
    }
  };

  // Delete public message (soft delete)
  const handleDeleteMessage = async (messageId: string) => {
    let error;
    const result = await supabase
      .from("messages")
      .update({
        deleted_at: new Date().toISOString(),
        content: "",
      })
      .eq("id", messageId)
      .eq("user_id", user?.id);

    error = result.error;

    if (error && error.message?.includes("deleted_at")) {
      const fallbackResult = await supabase
        .from("messages")
        .update({ content: "[Message deleted]" })
        .eq("id", messageId)
        .eq("user_id", user?.id);
      error = fallbackResult.error;
    }

    if (error) {
      console.error("Delete message error:", error);
      throw error;
    }

    if (activeTopic) {
      queryClient.setQueryData<MessageWithProfile[]>(
        ["messages", activeTopic],
        (old) => old?.map(m =>
          m.id === messageId
            ? { ...m, deleted_at: new Date().toISOString(), content: "" }
            : m
        ) || []
      );
    }
  };

  // Edit private message
  const handleEditPrivateMessage = async (messageId: string, newContent: string) => {
    let error;
    const result = await supabase
      .from("private_messages")
      .update({
        content: newContent,
        edited_at: new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("sender_id", user?.id);

    error = result.error;

    if (error && error.message?.includes("edited_at")) {
      const fallbackResult = await supabase
        .from("private_messages")
        .update({ content: newContent })
        .eq("id", messageId)
        .eq("sender_id", user?.id);
      error = fallbackResult.error;
    }

    if (error) {
      console.error("Edit private message error:", error);
      throw error;
    }

    if (user && activeDm) {
      queryClient.setQueryData<PrivateMessage[]>(
        ["private-messages", user.id, activeDm],
        (old) => old?.map(m =>
          m.id === messageId
            ? { ...m, content: newContent, edited_at: new Date().toISOString() }
            : m
        ) || []
      );
    }
  };

  // Delete private message (soft delete)
  const handleDeletePrivateMessage = async (messageId: string) => {
    let error;
    const result = await supabase
      .from("private_messages")
      .update({
        deleted_at: new Date().toISOString(),
        content: "",
      })
      .eq("id", messageId)
      .eq("sender_id", user?.id);

    error = result.error;

    if (error && error.message?.includes("deleted_at")) {
      const fallbackResult = await supabase
        .from("private_messages")
        .update({ content: "[Message deleted]" })
        .eq("id", messageId)
        .eq("sender_id", user?.id);
      error = fallbackResult.error;
    }

    if (error) {
      console.error("Delete private message error:", error);
      throw error;
    }

    if (user && activeDm) {
      queryClient.setQueryData<PrivateMessage[]>(
        ["private-messages", user.id, activeDm],
        (old) => old?.map(m =>
          m.id === messageId
            ? { ...m, deleted_at: new Date().toISOString(), content: "" }
            : m
        ) || []
      );
    }
  };

  // Edit group message
  const handleEditGroupMessage = async (messageId: string, newContent: string) => {
    const { error } = await supabase
      .from("group_messages")
      .update({
        content: newContent,
        edited_at: new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("user_id", user?.id);

    if (error) {
      console.error("Edit group message error:", error);
      throw error;
    }

    if (activeGroup) {
      queryClient.setQueryData(
        ["group-messages", activeGroup],
        (old: any) => old?.map((m: any) =>
          m.id === messageId
            ? { ...m, content: newContent, edited_at: new Date().toISOString() }
            : m
        ) || []
      );
    }
  };

  // Delete group message (soft delete)
  const handleDeleteGroupMessage = async (messageId: string) => {
    const { error } = await supabase
      .from("group_messages")
      .update({
        deleted_at: new Date().toISOString(),
        content: "",
      })
      .eq("id", messageId)
      .eq("user_id", user?.id);

    if (error) {
      console.error("Delete group message error:", error);
      throw error;
    }

    if (activeGroup) {
      queryClient.setQueryData(
        ["group-messages", activeGroup],
        (old: any) => old?.map((m: any) =>
          m.id === messageId
            ? { ...m, deleted_at: new Date().toISOString(), content: "" }
            : m
        ) || []
      );
    }
  };

  // Create group
  const handleCreateGroup = async (emojis: string[], name: string | null, memberIds: string[]) => {
    if (!user) return;

    // Create the group
    const { data: group, error: groupError } = await supabase
      .from("group_chats")
      .insert({
        name,
        emojis,
        created_by: user.id,
      })
      .select()
      .single();

    if (groupError) throw groupError;

    // Add creator as admin member
    const { error: creatorError } = await supabase
      .from("group_chat_members")
      .insert({
        group_id: group.id,
        user_id: user.id,
        invited_by: user.id,
        status: "accepted",
        role: "admin",
        last_read_at: new Date().toISOString(),
      });

    if (creatorError) throw creatorError;

    // Invite selected members
    if (memberIds.length > 0) {
      const memberInserts = memberIds.map(memberId => ({
        group_id: group.id,
        user_id: memberId,
        invited_by: user.id,
        status: "pending",
        role: "member",
      }));

      const { error: membersError } = await supabase
        .from("group_chat_members")
        .insert(memberInserts);

      if (membersError) throw membersError;

      // Send notifications to invited members
      for (const memberId of memberIds) {
        fetch("/api/notify/group-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiverId: memberId,
            senderId: user.id,
            senderName: currentUserProfile?.name,
            groupName: name || emojis.join(""),
            groupId: group.id,
          }),
        }).catch(console.error);
      }
    }

    // Refresh group chats
    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });

    toast({
      title: "Group created!",
      description: memberIds.length > 0
        ? `Invites sent to ${memberIds.length} member${memberIds.length > 1 ? "s" : ""}`
        : "Your group is ready",
    });
  };

  // Accept group invite
  const handleAcceptGroupInvite = async (groupId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from("group_chat_members")
      .update({
        status: "accepted",
        last_read_at: new Date().toISOString(),
      })
      .eq("group_id", groupId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error accepting invite:", error);
      toast({
        variant: "destructive",
        title: "Failed to accept invite",
        description: "Please try again.",
      });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
    toast({
      title: "Joined group!",
      description: "You can now chat with this group.",
    });
  };

  // Decline group invite
  const handleDeclineGroupInvite = async (groupId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from("group_chat_members")
      .update({ status: "declined" })
      .eq("group_id", groupId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error declining invite:", error);
      toast({
        variant: "destructive",
        title: "Failed to decline invite",
        description: "Please try again.",
      });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
  };

  // Invite members to existing group
  const handleInviteToGroup = async (memberIds: string[]) => {
    if (!user || !activeGroup) return;

    const memberInserts = memberIds.map(memberId => ({
      group_id: activeGroup,
      user_id: memberId,
      invited_by: user.id,
      status: "pending",
      role: "member",
    }));

    const { error } = await supabase
      .from("group_chat_members")
      .insert(memberInserts);

    if (error) {
      console.error("Error inviting members:", error);
      toast({
        variant: "destructive",
        title: "Failed to invite members",
        description: "Please try again.",
      });
      return;
    }

    // Send notifications
    for (const memberId of memberIds) {
      fetch("/api/notify/group-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: memberId,
          senderId: user.id,
          senderName: currentUserProfile?.name,
          groupName: activeGroupData?.name || activeGroupData?.emojis?.join(""),
          groupId: activeGroup,
        }),
      }).catch(console.error);
    }

    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
    setShowInviteMembers(false);

    toast({
      title: "Invites sent!",
      description: `${memberIds.length} member${memberIds.length > 1 ? "s" : ""} invited`,
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const content = input.trim();
    setInput("");

    inputRef.current?.focus();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    if (activeTab === "ai") {
      await sendAiMessage(content);
    } else if (activeTab === "dms" && activeDm) {
      if (!user) return;
      await sendPrivateMessage.mutateAsync(content);
      if (activeDmProfile && currentUserProfile) {
        fetch("/api/notify/dm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiverId: activeDm,
            senderId: user.id,
            senderName: currentUserProfile.name,
            messagePreview: content,
          }),
        }).catch(console.error);
      }
    } else if (activeTab === "groups" && activeGroup) {
      if (!user) return;
      await sendGroupMessage.mutateAsync(content);
      // Send group message notification
      if (activeGroupData && currentUserProfile) {
        fetch("/api/notify/group-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: activeGroup,
            groupName: activeGroupData.name || activeGroupData.emojis?.join(""),
            senderId: user.id,
            senderName: currentUserProfile.name,
            messagePreview: content,
          }),
        }).catch(console.error);

        // Check for @mentions
        const mentionRegex = /@([A-Za-z]+ [A-Za-z]+)/g;
        const mentions = content.match(mentionRegex);
        if (mentions && mentions.length > 0) {
          fetch("/api/notify/mention", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              groupId: activeGroup,
              groupName: activeGroupData.name || activeGroupData.emojis?.join(""),
              senderId: user.id,
              senderName: currentUserProfile.name,
              messagePreview: content,
              mentionedNames: mentions.map(m => m.substring(1)),
            }),
          }).catch(console.error);
        }
      }
    } else if (activeTab === "general" && activeTopic) {
      if (!user) return;
      await sendMessage.mutateAsync(content);
      const currentTopic = displayTopics.find((t) => t.id === activeTopic);
      if (activeTopic && currentTopic && currentUserProfile) {
        fetch("/api/notify/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicId: activeTopic,
            topicName: currentTopic.name,
            senderId: user.id,
            senderName: currentUserProfile.name,
            messagePreview: content,
          }),
        }).catch(console.error);

        const mentionRegex = /@([A-Za-z]+ [A-Za-z]+)/g;
        const mentions = content.match(mentionRegex);
        if (mentions && mentions.length > 0) {
          fetch("/api/notify/mention", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topicId: activeTopic,
              topicName: currentTopic.name,
              senderId: user.id,
              senderName: currentUserProfile.name,
              messagePreview: content,
              mentionedNames: mentions.map(m => m.substring(1)),
            }),
          }).catch(console.error);
        }
      }
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

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const clearAiChat = () => {
    const welcomeMessage: AIMessage = {
      id: "welcome",
      role: "ai",
      content: "Hi! I'm your Co:Lab AI Guide. Ask me anything like 'Who works in fintech?' or 'How do I connect with investors?'",
      created_at: new Date().toISOString(),
    };
    setAiMessages([welcomeMessage]);
    localStorage.setItem("colab-ai-messages", JSON.stringify([welcomeMessage]));
  };

  // Get group display name
  const getGroupDisplayName = (group: any) => {
    if (group.name) return group.name;

    // Show member first names
    const members = group.members?.filter((m: any) => m.status === "accepted" && m.user_id !== user?.id) || [];
    if (members.length === 0) return group.emojis?.join("") || "Group";

    const names = members
      .slice(0, 2)
      .map((m: any) => m.profiles?.name?.split(" ")[0] || "")
      .filter(Boolean);

    if (members.length > 2) {
      return `${names.join(", ")} +${members.length - 2}`;
    }
    return names.join(", ") || group.emojis?.join("") || "Group";
  };

  // Handle back button
  const handleBack = () => {
    setViewMode("list");
    setActiveTopic(null);
    setActiveDm(null);
    setActiveGroup(null);
  };

  // Handle topic selection
  const handleSelectTopic = (topicId: string) => {
    setActiveTopic(topicId);
    setViewMode("chat");
  };

  // Handle DM selection
  const handleSelectDm = (userId: string) => {
    setActiveDm(userId);
    setViewMode("chat");
    markMessagesAsRead(userId);
  };

  // Handle group selection
  const handleSelectGroup = (groupId: string) => {
    setActiveGroup(groupId);
    setViewMode("chat");
    markGroupAsRead(groupId);
  };

  const currentTopic = displayTopics.find((t) => t.id === activeTopic);
  const isPrivateChat = activeTab === "dms" && !!activeDm && viewMode === "chat";
  const isGroupChat = activeTab === "groups" && !!activeGroup && viewMode === "chat";
  const isAiChat = activeTab === "ai";
  const isLoadingMessages = isAiChat
    ? false
    : isPrivateChat
    ? privateMessagesLoading
    : isGroupChat
    ? groupMessagesLoading
    : messagesLoading;

  // Filter out deleted messages and muted users
  const rawMessages = isAiChat
    ? aiMessages
    : isPrivateChat
    ? privateMessages
    : isGroupChat
    ? groupMessages
    : messages;

  const displayMessages = rawMessages?.filter((msg: any) => {
    if (msg.deleted_at) return false;
    if (!isPrivateChat && !isAiChat && msg.user_id && mutedUserIds.includes(msg.user_id)) {
      return false;
    }
    return true;
  }) || [];

  const isPending = isAiChat
    ? aiPending
    : isPrivateChat
    ? sendPrivateMessage.isPending
    : isGroupChat
    ? sendGroupMessage.isPending
    : sendMessage.isPending;

  // Connections for group creation (exclude existing group members if inviting to existing group)
  const availableConnections = privateChats?.map(c => c.profile) || [];
  const existingMemberIds = activeGroupData?.members
    ?.map((m: any) => m.user_id)
    .filter(Boolean) || [];
  const invitableConnections = availableConnections.filter(
    p => !existingMemberIds.includes(p.id)
  );

  // Require login to access chat
  if (!user && !authLoading) {
    return (
      <div className="max-w-md mx-auto space-y-6 pb-20">
        <Card className="border-border/50 shadow-lg overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/20" />
          <CardContent className="pt-6 pb-8 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageCircle className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-display font-bold mb-2">Sign In to Chat</h2>
              <p className="text-muted-foreground">
                Join the Co:Lab community to participate in discussions, connect with other members, and chat with our AI assistant.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3 text-left bg-muted/30 rounded-lg p-3">
                <Users className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Group Chats</p>
                  <p className="text-xs text-muted-foreground">Create private groups with your connections</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-left bg-muted/30 rounded-lg p-3">
                <MessageCircle className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Public Channels</p>
                  <p className="text-xs text-muted-foreground">Join topic discussions with the community</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-left bg-muted/30 rounded-lg p-3">
                <Lock className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Direct Messages</p>
                  <p className="text-xs text-muted-foreground">Private conversations with connections</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-left bg-muted/30 rounded-lg p-3">
                <Sparkles className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">AI Assistant</p>
                  <p className="text-xs text-muted-foreground">Get help finding the right people</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Link href="/login?redirect=/chat">
                <Button className="w-full rounded-full" size="lg">
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In to Chat
                </Button>
              </Link>
              <Link href="/directory">
                <Button variant="outline" className="w-full rounded-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Browse Directory
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-3xl overflow-hidden border border-border bg-card shadow-sm">
      {/* Header with Tab Buttons */}
      <div className="bg-muted/30 border-b border-border p-3 shrink-0">
        <div className="flex items-center gap-2">
          {/* Back button when in chat view */}
          {viewMode === "chat" && activeTab !== "ai" && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0 bg-muted hover:bg-muted/80 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}

          {/* Tab Buttons - hidden when in chat view */}
          {(viewMode === "list" || activeTab === "ai") && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => {
                  setActiveTab("groups");
                  setViewMode("list");
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === "groups"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Groups
              </button>
              <button
                onClick={() => {
                  setActiveTab("general");
                  setViewMode("list");
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === "general"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                General
              </button>
              <button
                onClick={() => {
                  setActiveTab("dms");
                  setViewMode("list");
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === "dms"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                DMs
              </button>
            </div>
          )}

          {/* Chat title when in chat view */}
          {viewMode === "chat" && activeTab !== "ai" && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {activeTab === "general" && currentTopic && (
                <>
                  <span className="text-xl">{currentTopic.icon || "💬"}</span>
                  <span className="font-medium truncate">{currentTopic.name}</span>
                </>
              )}
              {activeTab === "dms" && activeDmProfile && (
                <>
                  <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage src={activeDmProfile.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px]">
                      {getInitials(activeDmProfile.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium truncate">{activeDmProfile.name}</span>
                </>
              )}
              {activeTab === "groups" && activeGroupData && (
                <>
                  <span className="text-xl">{activeGroupData.emojis?.join("") || "👥"}</span>
                  <span className="font-medium truncate">
                    {activeGroupData.name || getGroupDisplayName(activeGroupData)}
                  </span>
                  {/* Invite button */}
                  <button
                    onClick={() => setShowInviteMembers(true)}
                    className="ml-auto p-2 rounded-full hover:bg-muted transition-colors"
                    title="Invite members"
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* AI Chat clear button */}
          {activeTab === "ai" && aiMessages.length > 1 && (
            <button
              onClick={clearAiChat}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
              title="Clear AI chat history"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          {/* AI Button */}
          <button
            onClick={() => {
              setActiveTab("ai");
              setViewMode("chat");
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
              activeTab === "ai"
                ? "bg-gradient-to-r from-primary to-accent text-white shadow-md"
                : "bg-gradient-to-r from-primary to-accent text-white hover:shadow-md hover:scale-105"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">AI</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col bg-background relative min-h-0">
        {/* List Views */}
        {viewMode === "list" && (
          <div className="flex-1 overflow-y-auto">
            {/* Groups List */}
            {activeTab === "groups" && (
              <ChatTileGrid
                items={(groupChats || [])
                  .filter((g: any) => g.membership_status === "accepted")
                  .map((g: any) => ({
                    id: g.id,
                    emoji: g.emojis,
                    name: g.name || getGroupDisplayName(g),
                    unreadCount: g.unread_count,
                  }))}
                onSelect={handleSelectGroup}
                showCreate
                onCreateClick={() => setShowCreateGroup(true)}
                onAccept={handleAcceptGroupInvite}
                onDecline={handleDeclineGroupInvite}
              />
            )}

            {/* Pending Group Invites */}
            {activeTab === "groups" && groupChats?.some((g: any) => g.membership_status === "pending") && (
              <div className="px-4 pb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Pending Invites
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {(groupChats || [])
                    .filter((g: any) => g.membership_status === "pending")
                    .map((g: any) => (
                      <div
                        key={g.id}
                        className="aspect-square rounded-xl border border-primary/30 bg-primary/5 flex flex-col items-center justify-center p-3 relative overflow-hidden"
                      >
                        <div className="text-2xl sm:text-3xl mb-1">
                          {g.emojis?.join("") || "👥"}
                        </div>
                        <span className="text-xs sm:text-sm font-medium text-center line-clamp-1 mb-2 text-muted-foreground">
                          {g.name || getGroupDisplayName(g)}
                        </span>
                        <div className="flex gap-2 w-full">
                          <button
                            onClick={() => handleAcceptGroupInvite(g.id)}
                            className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDeclineGroupInvite(g.id)}
                            className="flex-1 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20 transition-colors"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* General Topics List */}
            {activeTab === "general" && (
              <ChatTileGrid
                items={displayTopics.map((t) => ({
                  id: t.id,
                  emoji: t.icon || "💬",
                  name: t.name,
                }))}
                onSelect={handleSelectTopic}
              />
            )}

            {/* DMs List */}
            {activeTab === "dms" && (
              <ConnectionsList
                activeChats={dmsWithHistory?.active || []}
                connections={dmsWithHistory?.connections || []}
                onMessageClick={handleSelectDm}
              />
            )}
          </div>
        )}

        {/* Chat View */}
        {(viewMode === "chat" || activeTab === "ai") && (
          <>
            <div
              ref={scrollViewportRef}
              className="flex-1 p-4 min-h-0 overflow-y-auto scroll-smooth"
            >
              <div className="space-y-6">
                <div className="flex justify-center my-4">
                  <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full flex items-center gap-2">
                    {isAiChat && <Sparkles className="h-3 w-3" />}
                    {isPrivateChat && <Lock className="h-3 w-3" />}
                    {isGroupChat && <Users className="h-3 w-3" />}
                    {isAiChat
                      ? "Chat with your AI Assistant"
                      : isPrivateChat
                      ? `Private conversation with ${activeDmProfile?.name || "..."}`
                      : isGroupChat
                      ? `${activeGroupData?.name || activeGroupData?.emojis?.join("") || "Group"} chat`
                      : `Beginning of #${currentTopic?.name || "chat"} history`}
                  </span>
                </div>

                {isLoadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : displayMessages && displayMessages.length > 0 ? (
                  displayMessages.map((msg: any) => {
                    // Handle AI messages differently
                    if (isAiChat) {
                      const isUser = msg.role === "user";
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
                        >
                          <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${
                            isUser
                              ? "bg-primary text-primary-foreground"
                              : "bg-gradient-to-br from-primary to-accent text-white"
                          }`}>
                            {isUser ? (
                              currentUserProfile ? getInitials(currentUserProfile.name) : "U"
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                          </div>
                          <div className="max-w-[85%] space-y-1">
                            <div
                              className={`flex items-baseline gap-2 ${
                                isUser ? "justify-end" : ""
                              }`}
                            >
                              <span className="text-xs font-bold text-foreground">
                                {isUser ? "You" : "AI Assistant"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatTime(msg.created_at)}
                              </span>
                            </div>
                            <div
                              className={`p-3 rounded-2xl text-sm ${
                                isUser
                                  ? "bg-primary/10 text-foreground rounded-tr-none border border-primary/20"
                                  : "bg-gradient-to-br from-primary/5 to-accent/5 text-foreground rounded-tl-none border border-primary/10"
                              }`}
                            >
                              {isUser ? (
                                msg.content
                              ) : (
                                <ReactMarkdown
                                  components={{
                                    a: ({ href, children }) => {
                                      if (href?.startsWith("/profile/")) {
                                        return (
                                          <Link href={href} className="text-primary font-semibold hover:underline">
                                            {children}
                                          </Link>
                                        );
                                      }
                                      return (
                                        <a
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-primary hover:underline"
                                        >
                                          {children}
                                        </a>
                                      );
                                    },
                                    strong: ({ children }) => (
                                      <strong className="font-bold text-foreground">{children}</strong>
                                    ),
                                    ul: ({ children }) => (
                                      <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
                                    ),
                                    ol: ({ children }) => (
                                      <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
                                    ),
                                    li: ({ children }) => (
                                      <li className="text-foreground">{children}</li>
                                    ),
                                    p: ({ children }) => (
                                      <p className="mb-2 last:mb-0">{children}</p>
                                    ),
                                    code: ({ children }) => (
                                      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                                    ),
                                  }}
                                >
                                  {msg.content}
                                </ReactMarkdown>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Regular messages
                    const isOwn = isPrivateChat
                      ? msg.sender_id === user?.id
                      : msg.user_id === user?.id;
                    const senderProfile = isPrivateChat
                      ? msg.sender_profile
                      : msg.profiles;
                    const senderName = senderProfile?.name || "Unknown";
                    const senderId = isPrivateChat ? msg.sender_id : msg.user_id;

                    const isDeleted = !!msg.deleted_at;
                    const isEdited = !!msg.edited_at && !isDeleted;
                    const isMuted = senderId ? mutedUserIds.includes(senderId) : false;

                    const editHandler = isPrivateChat
                      ? handleEditPrivateMessage
                      : isGroupChat
                      ? handleEditGroupMessage
                      : handleEditMessage;

                    const deleteHandler = isPrivateChat
                      ? handleDeletePrivateMessage
                      : isGroupChat
                      ? handleDeleteGroupMessage
                      : handleDeleteMessage;

                    return (
                      <MessageWrapper
                        key={msg.id}
                        messageId={msg.id}
                        content={msg.content}
                        isOwnMessage={isOwn}
                        isDeleted={isDeleted}
                        onEdit={editHandler}
                        onDelete={deleteHandler}
                        senderName={senderName}
                        senderId={senderId}
                        onReply={handleReplyToUser}
                        onMute={handleMuteUser}
                        onUnmute={handleUnmuteUser}
                        isMuted={isMuted}
                        isPrivateChat={isPrivateChat}
                      >
                        <div className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
                          <Avatar className="w-8 h-8 shrink-0">
                            <AvatarImage
                              src={senderProfile?.avatar_url || undefined}
                              alt={senderName}
                            />
                            <AvatarFallback
                              className={`text-xs font-bold ${
                                isOwn
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-secondary-foreground"
                              }`}
                            >
                              {getInitials(senderName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="max-w-[75%] space-y-1">
                            <div
                              className={`flex items-baseline gap-2 ${
                                isOwn ? "justify-end" : ""
                              }`}
                            >
                              <span className="text-xs font-bold text-foreground">
                                {isOwn ? "You" : senderName}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatTime(msg.created_at)}
                              </span>
                              {isEdited && <EditedIndicator />}
                            </div>
                            <div
                              className={`p-3 rounded-2xl text-sm ${
                                isDeleted
                                  ? "bg-muted/50 text-muted-foreground border border-border/50 italic"
                                  : isOwn
                                  ? "bg-primary/10 text-foreground rounded-tr-none border border-primary/20"
                                  : "bg-muted text-foreground rounded-tl-none border border-border"
                              }`}
                            >
                              {isDeleted ? (
                                <DeletedMessage />
                              ) : isImageUrl(msg.content) ? (
                                <ChatImage src={msg.content} />
                              ) : (
                                <MessageContent content={msg.content} />
                              )}
                            </div>
                            {/* Emoji reactions */}
                            {!isDeleted && (
                              <EmojiReactions
                                messageId={msg.id}
                                messageType={isPrivateChat ? "private" : isGroupChat ? "group" : "public"}
                                messageSenderId={isPrivateChat ? msg.sender_id : msg.user_id}
                              />
                            )}
                            {/* Desktop hover actions - only for own non-deleted messages */}
                            {isOwn && !isDeleted && (
                              <div className="hidden md:block">
                                <MessageActions
                                  messageId={msg.id}
                                  content={msg.content}
                                  isOwnMessage={isOwn}
                                  isDeleted={isDeleted}
                                  onEdit={editHandler}
                                  onDelete={deleteHandler}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </MessageWrapper>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">
                      {isAiChat
                        ? "Ask me anything about Co:Lab!"
                        : isPrivateChat
                        ? "No messages yet. Start a private conversation!"
                        : isGroupChat
                        ? "No messages yet. Start the conversation!"
                        : "No messages yet. Start the conversation!"}
                    </p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Scroll to bottom button */}
            {showScrollButton && (
              <button
                onClick={() => scrollToBottom(true)}
                className="absolute bottom-20 right-4 z-10 w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all hover:scale-110 animate-in fade-in slide-in-from-bottom-2"
                aria-label="Scroll to latest messages"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            )}

            {/* Input Area */}
            <div className="shrink-0 p-3 md:p-4 pb-safe bg-card border-t border-border sticky bottom-0">
              <form onSubmit={handleSend} className="flex gap-2 relative">
                {isAiChat ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground shrink-0 rounded-full"
                  >
                    <Sparkles className="h-5 w-5" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`shrink-0 rounded-full transition-colors ${
                      (isPrivateChat ? hasNotificationsEnabled : isFollowingTopic)
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => {
                      if (!hasNotificationsEnabled) {
                        if (isPrivateChat) {
                          setShowDmPrompt(true);
                        } else {
                          setShowTopicPrompt(true);
                        }
                      } else if (!isPrivateChat && !isGroupChat) {
                        toggleFollow();
                      }
                    }}
                    disabled={followLoading}
                    title={
                      isPrivateChat || isGroupChat
                        ? hasNotificationsEnabled ? "Notifications enabled" : "Enable notifications"
                        : isFollowingTopic ? "Disable notifications for this channel" : "Enable notifications for this channel"
                    }
                  >
                    {followLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (isPrivateChat || isGroupChat ? hasNotificationsEnabled : isFollowingTopic) ? (
                      <Bell className="h-5 w-5" />
                    ) : (
                      <BellOff className="h-5 w-5" />
                    )}
                  </Button>
                )}
                {/* Image upload button (not for AI chat) */}
                {!isAiChat && (
                  <ChatImageUpload
                    onImageUploaded={(imageUrl) => {
                      if (isPrivateChat) {
                        sendPrivateMessage.mutate(imageUrl);
                      } else if (isGroupChat) {
                        sendGroupMessage.mutate(imageUrl);
                      } else {
                        sendMessage.mutate(imageUrl);
                      }
                    }}
                    disabled={isPending}
                  />
                )}
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isAiChat
                      ? "Ask the AI anything..."
                      : isPrivateChat
                      ? `Message ${activeDmProfile?.name?.split(" ")[0] || "privately"}...`
                      : isGroupChat
                      ? `Message ${activeGroupData?.name || "group"}...`
                      : `Message #${currentTopic?.name || "chat"}...`
                  }
                  className="rounded-full bg-muted/50 border-transparent focus:bg-background transition-all pr-12"
                  disabled={isPending}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="absolute right-1 top-1 h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-transform hover:scale-105"
                  disabled={!input.trim() || isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <GroupCreateModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        connections={availableConnections}
        onCreateGroup={handleCreateGroup}
      />

      {/* Invite Members Modal (for existing groups) */}
      {showInviteMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowInviteMembers(false)}
          />
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Invite Members</h2>
              <button
                onClick={() => setShowInviteMembers(false)}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {invitableConnections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>All your connections are already in this group</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {invitableConnections.map((connection) => (
                    <button
                      key={connection.id}
                      onClick={() => handleInviteToGroup([connection.id])}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/30 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            src={connection.avatar_url || undefined}
                            alt={connection.name}
                          />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(connection.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-left">
                          <p className="font-medium">{connection.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {connection.role || "Member"}
                          </p>
                        </div>
                      </div>
                      <Plus className="h-5 w-5 text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification Prompts */}
      <NotificationPrompt
        open={showDmPrompt}
        onOpenChange={setShowDmPrompt}
        type="dm"
      />
      <NotificationPrompt
        open={showTopicPrompt}
        onOpenChange={setShowTopicPrompt}
        type="topic"
        topicName={currentTopic?.name}
      />
    </div>
  );
}
