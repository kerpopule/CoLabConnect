import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, LogIn, Lock, MessageCircle, Users, Sparkles, Bell, BellOff, ArrowLeft, Trash2, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Topic, Message, Profile, PrivateMessage, getPrivateChatId } from "@/lib/supabase";
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

type AIMessage = {
  id: string;
  role: "user" | "ai";
  content: string;
  created_at: string;
};

// Fallback topics when database is empty
const FALLBACK_TOPICS = [
  { id: "general", slug: "general", name: "General", icon: "💬", description: "", created_at: "" },
  { id: "hiring", slug: "hiring", name: "Hiring", icon: "💼", description: "", created_at: "" },
  { id: "fundraising", slug: "fundraising", name: "Fundraising", icon: "💰", description: "", created_at: "" },
  { id: "tech", slug: "tech", name: "Tech", icon: "💻", description: "", created_at: "" },
  { id: "events", slug: "events", name: "Events", icon: "📅", description: "", created_at: "" },
];

type MessageWithProfile = Message & {
  profiles: Profile | null | undefined;
};

type PrivateChat = {
  otherId: string;
  profile: Profile;
};

export default function Chat() {
  const searchString = useSearch();
  const dmUserId = new URLSearchParams(searchString).get("dm");

  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [activeDm, setActiveDm] = useState<string | null>(dmUserId);
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState<"public" | "private" | "ai">(dmUserId ? "private" : "public");
  const [aiMessages, setAiMessages] = useState<AIMessage[]>(() => {
    // Load AI messages from localStorage
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
    // Refresh muted users list
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
    // Refresh muted users list
    queryClient.invalidateQueries({ queryKey: ["muted-users", user.id] });
    toast({
      title: "User unmuted",
      description: "You'll see their messages again.",
    });
  };

  // Reply to a user - adds @mention to input
  const handleReplyToUser = (senderName: string) => {
    setInput(`@${senderName} `);
    // Focus the input
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
      // Immediately invalidate and refetch the unread count query to update the badge
      queryClient.invalidateQueries({ queryKey: ["unread-messages-count"] });
      // Force immediate refetch
      queryClient.refetchQueries({ queryKey: ["unread-messages-count"] });
    }
  }, [user, queryClient]);

  // Update activeDm when URL changes
  useEffect(() => {
    if (dmUserId) {
      setActiveDm(dmUserId);
      setActiveTopic(null);
      setChatMode("private");
      // Mark messages from this user as read
      markMessagesAsRead(dmUserId);
    }
  }, [dmUserId, markMessagesAsRead]);

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

      // Sort topics by custom order
      const sortedData = (data as Topic[]).sort((a, b) => {
        const aIndex = TOPIC_ORDER.indexOf(a.slug?.toLowerCase() || a.name.toLowerCase());
        const bIndex = TOPIC_ORDER.indexOf(b.slug?.toLowerCase() || b.name.toLowerCase());

        // If both are in the custom order, sort by that order
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        // If only a is in custom order, a comes first
        if (aIndex !== -1) return -1;
        // If only b is in custom order, b comes first
        if (bIndex !== -1) return 1;
        // Otherwise keep original order (by created_at)
        return 0;
      });

      return sortedData;
    },
  });

  // Fetch my private chats (accepted connections)
  const { data: privateChats } = useQuery({
    queryKey: ["private-chats", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get connections where I'm involved and status is accepted
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

  // Get the active DM user profile
  const activeDmProfile = privateChats?.find((c) => c.otherId === activeDm)?.profile;

  // Only use real topics from database, fallback topics are just for display during loading
  const displayTopics = topics && topics.length > 0 ? topics : FALLBACK_TOPICS;
  const hasRealTopics = topics && topics.length > 0;

  // Cache key for storing last visited chat
  const LAST_CHAT_KEY = "colab-last-chat";

  // Save last visited chat to localStorage whenever it changes (only for real topics)
  useEffect(() => {
    if (activeTopic && !activeDm && chatMode === "public" && hasRealTopics) {
      localStorage.setItem(LAST_CHAT_KEY, JSON.stringify({ type: "topic", id: activeTopic }));
    } else if (activeDm && chatMode === "private") {
      localStorage.setItem(LAST_CHAT_KEY, JSON.stringify({ type: "dm", id: activeDm }));
    }
  }, [activeTopic, activeDm, chatMode, hasRealTopics]);

  // Set initial active topic - default to "general" or cached chat
  // Only run when real topics are loaded (not fallback topics)
  useEffect(() => {
    if (!activeDm && hasRealTopics && !activeTopic) {
      // Check for cached last chat
      const cachedChat = localStorage.getItem(LAST_CHAT_KEY);
      if (cachedChat) {
        try {
          const parsed = JSON.parse(cachedChat);
          if (parsed.type === "topic") {
            // Verify the topic still exists
            const topicExists = topics!.find(t => t.id === parsed.id);
            if (topicExists) {
              setActiveTopic(parsed.id);
              return;
            }
          }
          // For DMs, we don't auto-restore since the user navigated to public chat
        } catch {
          // Invalid cache, fall through to default
        }
      }

      // Default to "general" topic if it exists, otherwise first topic
      const generalTopic = topics!.find(t => t.slug === "general" || t.name.toLowerCase() === "general");
      if (generalTopic) {
        setActiveTopic(generalTopic.id);
      } else if (topics!.length > 0) {
        setActiveTopic(topics![0].id);
      }
    }
  }, [topics, hasRealTopics, activeTopic, activeDm]);

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
    enabled: !!activeTopic && !activeDm,
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
    enabled: !!user && !!activeDm,
  });

  // Real-time subscription for new messages (public)
  useEffect(() => {
    if (!activeTopic || activeDm) return;

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

          // Skip if this is from the current user (already added via optimistic update)
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
              // Check if message already exists (by id)
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
  }, [activeTopic, activeDm, queryClient, user?.id]);

  // Real-time subscription for private messages
  useEffect(() => {
    if (!user || !activeDm) return;

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

          // Skip if this is from the current user (already added via optimistic update)
          if (newMsg.sender_id === user.id) return;

          // Only add if it's between us and the active DM user
          if (
            (newMsg.sender_id === user.id && newMsg.receiver_id === activeDm) ||
            (newMsg.sender_id === activeDm && newMsg.receiver_id === user.id)
          ) {
            // Fetch sender profile
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
                // Check if message already exists (by id)
                if (old?.some(m => m.id === messageWithProfile.id)) return old;
                return [...(old || []), messageWithProfile];
              }
            );

            // Trigger DM notification prompt if user hasn't enabled notifications
            triggerDmPrompt();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeDm, queryClient, triggerDmPrompt]);

  // Check if user is at or near the bottom of the scroll
  const checkIfAtBottom = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return true;

    const threshold = 100; // pixels from bottom to consider "at bottom"
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    return distanceFromBottom < threshold;
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom);
  }, [checkIfAtBottom]);

  // Setup scroll listener
  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Scroll to bottom function - uses scrollTop to prevent outer window scroll
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

  // Scroll to bottom when new messages arrive (only if already at bottom)
  useEffect(() => {
    // Use setTimeout to ensure DOM has updated
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
  }, [messages, privateMessages, aiMessages, isAtBottom]);

  // Always scroll to bottom on initial load or chat switch
  useEffect(() => {
    setTimeout(() => {
      scrollToBottom(false);
    }, 200);
  }, [activeTopic, activeDm, chatMode, scrollToBottom]);

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
      // Call the real AI endpoint
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content,
          conversationHistory: aiMessages.slice(-10), // Send last 10 messages for context
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

  // Send public message mutation with optimistic update
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
      // Optimistic update - add message immediately
      if (!user || !activeTopic || !currentUserProfile) return;

      const optimisticMessage: MessageWithProfile = {
        id: `temp-${Date.now()}`,
        topic_id: activeTopic,
        user_id: user.id,
        content,
        created_at: new Date().toISOString(),
        profiles: currentUserProfile,
      };

      // Add to cache immediately
      queryClient.setQueryData<MessageWithProfile[]>(
        ["messages", activeTopic],
        (old) => [...(old || []), optimisticMessage]
      );

      return { optimisticMessage };
    },
    onError: (error, _content, context) => {
      console.error("Failed to send message:", error);
      // Remove optimistic message on error
      if (context?.optimisticMessage && activeTopic) {
        queryClient.setQueryData<MessageWithProfile[]>(
          ["messages", activeTopic],
          (old) => old?.filter(m => m.id !== context.optimisticMessage.id) || []
        );
      }
    },
    onSuccess: (data, _content, context) => {
      // Replace optimistic message with real one
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

  // Send private message mutation with optimistic update
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
      // Optimistic update - add message immediately
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

      // Add to cache immediately
      queryClient.setQueryData<PrivateMessage[]>(
        ["private-messages", user.id, activeDm],
        (old) => [...(old || []), optimisticMessage]
      );

      return { optimisticMessage };
    },
    onError: (error, _content, context) => {
      console.error("Failed to send private message:", error);
      // Remove optimistic message on error
      if (context?.optimisticMessage && user && activeDm) {
        queryClient.setQueryData<PrivateMessage[]>(
          ["private-messages", user.id, activeDm],
          (old) => old?.filter(m => m.id !== context.optimisticMessage.id) || []
        );
      }
    },
    onSuccess: (data, _content, context) => {
      // Replace optimistic message with real one
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

  // Edit public message
  const handleEditMessage = async (messageId: string, newContent: string) => {
    // Try with edited_at first, fall back to just content if column doesn't exist
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

    // If edited_at column doesn't exist, try without it
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

    // Update local cache
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
    // Try with deleted_at first, fall back to just clearing content if column doesn't exist
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

    // If deleted_at column doesn't exist, try with just content
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

    // Update local cache
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
    // Try with edited_at first, fall back to just content if column doesn't exist
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

    // If edited_at column doesn't exist, try without it
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

    // Update local cache
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
    // Try with deleted_at first, fall back to just clearing content if column doesn't exist
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

    // If deleted_at column doesn't exist, try with just content
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

    // Update local cache
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const content = input.trim();
    setInput("");

    // Keep focus on input so keyboard stays open - multiple attempts for reliability
    // Immediate focus
    inputRef.current?.focus();
    // Delayed focus as fallback (helps on mobile)
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    // Additional delayed focus for iOS Safari
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    if (chatMode === "ai") {
      await sendAiMessage(content);
    } else if (activeDm) {
      if (!user) return;
      await sendPrivateMessage.mutateAsync(content);
      // Trigger DM notification
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
    } else {
      if (!user) return;
      await sendMessage.mutateAsync(content);
      // Trigger chat notification for followed topic
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

        // Check for @mentions and send notifications
        const mentionRegex = /@([A-Za-z]+ [A-Za-z]+)/g;
        const mentions = content.match(mentionRegex);
        if (mentions && mentions.length > 0) {
          // Send mention notifications
          fetch("/api/notify/mention", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topicId: activeTopic,
              topicName: currentTopic.name,
              senderId: user.id,
              senderName: currentUserProfile.name,
              messagePreview: content,
              mentionedNames: mentions.map(m => m.substring(1)), // Remove @ prefix
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

  const currentTopic = displayTopics.find((t) => t.id === activeTopic);
  const isPrivateChat = !!activeDm && chatMode !== "ai";
  const isAiChat = chatMode === "ai";
  const isLoadingMessages = isAiChat ? false : isPrivateChat ? privateMessagesLoading : messagesLoading;
  // Filter out deleted messages and muted users (muted users only in public chats)
  const rawMessages = isAiChat ? aiMessages : isPrivateChat ? privateMessages : messages;
  const displayMessages = rawMessages?.filter((msg: any) => {
    // Always filter out deleted messages
    if (msg.deleted_at) return false;
    // In public chats, filter out muted users
    if (!isPrivateChat && !isAiChat && msg.user_id && mutedUserIds.includes(msg.user_id)) {
      return false;
    }
    return true;
  }) || [];
  const isPending = isAiChat ? aiPending : isPrivateChat ? sendPrivateMessage.isPending : sendMessage.isPending;

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
                  <p className="text-sm font-medium">Public Channels</p>
                  <p className="text-xs text-muted-foreground">Join topic discussions with the community</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-left bg-muted/30 rounded-lg p-3">
                <Lock className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Private Messages</p>
                  <p className="text-xs text-muted-foreground">Direct message your connections</p>
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
      {/* Topics Header / Scroll */}
      <div className="bg-muted/30 border-b border-border p-3 shrink-0">
        <div className="flex items-center gap-2">
          {/* Mode toggle button - left side (only show when not in AI mode) */}
          {chatMode !== "ai" && (
            <button
              onClick={() => {
                if (chatMode === "public") {
                  setChatMode("private");
                  if (privateChats && privateChats.length > 0) {
                    setActiveDm(privateChats[0].otherId);
                    setActiveTopic(null);
                    markMessagesAsRead(privateChats[0].otherId);
                  }
                } else {
                  setChatMode("public");
                  setActiveDm(null);
                  if (displayTopics.length > 0) {
                    setActiveTopic(displayTopics[0].id);
                  }
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0 bg-primary/10 text-primary border border-primary/30"
            >
              {chatMode === "public" ? (
                <>
                  <Lock className="h-4 w-4" />
                  <span className="hidden sm:inline">DMs</span>
                  {privateChats && privateChats.length > 0 && (
                    <span className="bg-primary text-primary-foreground text-[10px] rounded-full px-1.5 min-w-[18px] text-center">
                      {privateChats.length}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Public</span>
                </>
              )}
            </button>
          )}

          {/* Back button when in AI mode */}
          {chatMode === "ai" && (
            <button
              onClick={() => {
                setChatMode("public");
                setActiveDm(null);
                if (displayTopics.length > 0) {
                  setActiveTopic(displayTopics[0].id);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0 bg-primary/10 text-primary border border-primary/30"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Chats</span>
            </button>
          )}

          {/* Scrollable chat tabs */}
          <div
            className="flex-1 overflow-x-auto scrollbar-hide touch-pan-x"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="flex gap-2 min-w-max">
              {chatMode === "ai" ? (
                /* AI Chat - show single active tab with clear button */
                <>
                  <button
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap bg-gradient-to-r from-primary to-accent text-white shadow-md"
                  >
                    <Sparkles className="h-4 w-4" />
                    AI Assistant
                  </button>
                  {aiMessages.length > 1 && (
                    <button
                      onClick={clearAiChat}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
                      title="Clear AI chat history"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Clear</span>
                    </button>
                  )}
                </>
              ) : chatMode === "public" ? (
                /* Public topics */
                displayTopics.map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() => {
                      setActiveTopic(topic.id);
                      setActiveDm(null);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                      activeTopic === topic.id && !activeDm
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-background border border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span>{topic.icon || "#"}</span>
                    {topic.name}
                  </button>
                ))
              ) : (
                /* Private chats */
                privateChats && privateChats.length > 0 ? (
                  privateChats.map((chat) => (
                    <button
                      key={chat.otherId}
                      onClick={() => {
                        setActiveDm(chat.otherId);
                        setActiveTopic(null);
                        markMessagesAsRead(chat.otherId);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                        activeDm === chat.otherId
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "bg-background border border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Lock className="h-3 w-3" />
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={chat.profile.avatar_url || undefined} />
                        <AvatarFallback className="text-[8px]">
                          {getInitials(chat.profile.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="max-w-[100px] truncate">{chat.profile.name.split(" ")[0]}</span>
                    </button>
                  ))
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                    <MessageCircle className="h-4 w-4" />
                    No private chats yet. Connect with someone to start!
                  </div>
                )
              )}
            </div>
          </div>


          {/* AI Button - right side (only show when not in AI mode) */}
          {chatMode !== "ai" && (
            <button
              onClick={() => {
                setChatMode("ai");
                setActiveDm(null);
                setActiveTopic(null);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0 bg-gradient-to-r from-primary to-accent text-white hover:shadow-md hover:scale-105"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">AI</span>
            </button>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-background relative min-h-0">
        <div
          ref={scrollViewportRef}
          className="flex-1 p-4 min-h-0 overflow-y-auto scroll-smooth"
        >
          <div className="space-y-6">
            <div className="flex justify-center my-4">
              <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full flex items-center gap-2">
                {isAiChat && <Sparkles className="h-3 w-3" />}
                {isPrivateChat && <Lock className="h-3 w-3" />}
                {isAiChat
                  ? "Chat with your AI Assistant"
                  : isPrivateChat
                  ? `Private conversation with ${activeDmProfile?.name || "..."}`
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
                                // Custom link renderer for profile links
                                a: ({ href, children }) => {
                                  // Check if it's an internal profile link
                                  if (href?.startsWith("/profile/")) {
                                    return (
                                      <Link href={href} className="text-primary font-semibold hover:underline">
                                        {children}
                                      </Link>
                                    );
                                  }
                                  // External links
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
                                // Style bold text
                                strong: ({ children }) => (
                                  <strong className="font-bold text-foreground">{children}</strong>
                                ),
                                // Style lists
                                ul: ({ children }) => (
                                  <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
                                ),
                                li: ({ children }) => (
                                  <li className="text-foreground">{children}</li>
                                ),
                                // Style paragraphs
                                p: ({ children }) => (
                                  <p className="mb-2 last:mb-0">{children}</p>
                                ),
                                // Style code
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

                return (
                  <MessageWrapper
                    key={msg.id}
                    messageId={msg.id}
                    content={msg.content}
                    isOwnMessage={isOwn}
                    isDeleted={isDeleted}
                    onEdit={isPrivateChat ? handleEditPrivateMessage : handleEditMessage}
                    onDelete={isPrivateChat ? handleDeletePrivateMessage : handleDeleteMessage}
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
                            messageType={isPrivateChat ? "private" : "public"}
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
                              onEdit={isPrivateChat ? handleEditPrivateMessage : handleEditMessage}
                              onDelete={isPrivateChat ? handleDeletePrivateMessage : handleDeleteMessage}
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
                    : "No messages yet. Start the conversation!"}
                </p>
              </div>
            )}
            {/* Scroll anchor for auto-scroll to bottom */}
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

        {/* Input Area - Fixed at bottom */}
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
                  } else if (!isPrivateChat) {
                    toggleFollow();
                  }
                }}
                disabled={followLoading}
                title={
                  isPrivateChat
                    ? hasNotificationsEnabled ? "Notifications enabled" : "Enable notifications"
                    : isFollowingTopic ? "Disable notifications for this channel" : "Enable notifications for this channel"
                }
              >
                {followLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (isPrivateChat ? hasNotificationsEnabled : isFollowingTopic) ? (
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
                  // Send the image URL as a message
                  if (isPrivateChat) {
                    sendPrivateMessage.mutate(imageUrl);
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
      </div>

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
