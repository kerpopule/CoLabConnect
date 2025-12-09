import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, LogIn, Lock, MessageCircle, Users, Sparkles, Bell, BellOff, ArrowLeft, Trash2, ChevronDown, Settings, Plus, UserPlus, UserMinus, X, FileText, Shield, Pencil, GripVertical } from "lucide-react";
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
import { ChatImageUpload, ChatImage, ChatFile, isImageUrl, isFileUrl } from "@/components/ChatImageUpload";
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

// Admin email for general topics management
const GENERAL_TOPICS_ADMIN_EMAIL = "steve.darlow@gmail.com";

// Fallback topics when database is empty
// Order is controlled by display_order (admin can reorder)
const FALLBACK_TOPICS = [
  { id: "general", slug: "general", name: "General", icon: "💬", description: "", created_at: "", display_order: 0 },
  { id: "hiring", slug: "hiring", name: "Hiring", icon: "💼", description: "", created_at: "", display_order: 1 },
  { id: "fundraising", slug: "fundraising", name: "Fundraising", icon: "💰", description: "", created_at: "", display_order: 2 },
  { id: "bugs-requests", slug: "bugs-requests", name: "Bugs & Requests", icon: "🐛", description: "", created_at: "", display_order: 3 },
  { id: "events", slug: "events", name: "Events", icon: "📅", description: "", created_at: "", display_order: 4 },
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

  // Get cached chat state from sessionStorage (persists during session, clears on app close)
  const getCachedChatState = () => {
    try {
      const cached = sessionStorage.getItem("colab-chat-state");
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  };
  const cachedState = getCachedChatState();

  // Navigation state - URL params take priority, then cached state, then defaults
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    dmUserId ? "dms" : groupIdFromUrl ? "groups" : tabFromUrl || cachedState?.activeTab || "general"
  );
  const [viewMode, setViewMode] = useState<ViewMode>(
    dmUserId || groupIdFromUrl ? "chat" : cachedState?.viewMode || "list"
  );

  // Chat state - URL params take priority, then cached state
  const [activeTopic, setActiveTopic] = useState<string | null>(cachedState?.activeTopic || null);
  const [activeDm, setActiveDm] = useState<string | null>(dmUserId || cachedState?.activeDm || null);
  const [activeGroup, setActiveGroup] = useState<string | null>(groupIdFromUrl || cachedState?.activeGroup || null);
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
  const [inviteModalTab, setInviteModalTab] = useState<"connections" | "members">("connections");
  const [showGroupActions, setShowGroupActions] = useState(false);
  const [showAdminTransfer, setShowAdminTransfer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRenameGroup, setShowRenameGroup] = useState(false);
  const [groupRenameEmoji, setGroupRenameEmoji] = useState("");
  const [groupRenameName, setGroupRenameName] = useState("");

  // Topic admin state
  const [topicToManage, setTopicToManage] = useState<{ id: string; name: string; icon: string } | null>(null);
  const [showTopicManageModal, setShowTopicManageModal] = useState(false);
  const [topicEditName, setTopicEditName] = useState("");
  const [topicEditIcon, setTopicEditIcon] = useState("");
  const [showTopicMembers, setShowTopicMembers] = useState(false);
  const [showKickConfirm, setShowKickConfirm] = useState<{ userId: string; userName: string } | null>(null);
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicIcon, setNewTopicIcon] = useState("");
  const [isReorderingTopics, setIsReorderingTopics] = useState(false);
  const [pendingTopicOrder, setPendingTopicOrder] = useState<{ id: string; displayOrder: number }[]>([]);
  const [isReorderingGroups, setIsReorderingGroups] = useState(false);
  const [pendingGroupOrder, setPendingGroupOrder] = useState<{ id: string; displayOrder: number }[]>([]);

  // Image/file upload state (for previewing before send)
  const [pendingImages, setPendingImages] = useState<{ file: File; preview: string }[]>([]);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; fileName: string }[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  const { user, profile: currentUserProfile, loading: authLoading } = useAuth();
  const isGeneralTopicAdmin = user?.email?.toLowerCase() === GENERAL_TOPICS_ADMIN_EMAIL.toLowerCase();

  // Debug logging for admin check
  if (user?.email) {
    console.log('[Admin Check] User email:', user.email, 'Is admin:', isGeneralTopicAdmin);
  }
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Save chat state to sessionStorage whenever it changes
  useEffect(() => {
    const state = {
      activeTab,
      viewMode,
      activeTopic,
      activeDm,
      activeGroup,
    };
    sessionStorage.setItem("colab-chat-state", JSON.stringify(state));
  }, [activeTab, viewMode, activeTopic, activeDm, activeGroup]);

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

  // Fetch kicked users for current topic (for admin)
  const { data: kickedTopicUsers = [] } = useQuery({
    queryKey: ["kicked-topic-users", activeTopic],
    queryFn: async () => {
      if (!activeTopic) return [];
      const { data, error } = await supabase
        .from("kicked_topic_users")
        .select("user_id, profiles:user_id(id, name, avatar_url)")
        .eq("topic_id", activeTopic);
      if (error) {
        console.error("Error fetching kicked users:", error);
        return [];
      }
      return data || [];
    },
    enabled: !!activeTopic && isGeneralTopicAdmin,
  });

  // Check if current user is kicked from active topic
  const { data: isKickedFromTopic = false } = useQuery({
    queryKey: ["am-i-kicked", activeTopic, user?.id],
    queryFn: async () => {
      if (!activeTopic || !user) return false;
      const { data, error } = await supabase
        .from("kicked_topic_users")
        .select("id")
        .eq("topic_id", activeTopic)
        .eq("user_id", user.id)
        .single();
      if (error && error.code !== "PGRST116") {
        console.error("Error checking kick status:", error);
      }
      return !!data;
    },
    enabled: !!activeTopic && !!user,
  });

  // Kick user from topic (admin only)
  const handleKickFromTopic = async (userId: string, userName: string) => {
    if (!isGeneralTopicAdmin || !activeTopic || !user) return;
    const { error } = await supabase
      .from("kicked_topic_users")
      .insert({
        topic_id: activeTopic,
        user_id: userId,
        kicked_by: user.id,
      });
    if (error) {
      console.error("Error kicking user:", error);
      toast({
        variant: "destructive",
        title: "Failed to kick user",
        description: error.message,
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["kicked-topic-users", activeTopic] });
    toast({
      title: "User kicked",
      description: `${userName} has been kicked from this topic.`,
    });
    setShowKickConfirm(null);

    // Send push notification to kicked user
    const topicName = displayTopics.find((t) => t.id === activeTopic)?.name || "topic";
    try {
      await fetch("/api/notify/topic-kick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: userId,
          adminName: currentUserProfile?.name || "Admin",
          topicName,
        }),
      });
    } catch (err) {
      console.error("Failed to send kick notification:", err);
    }
  };

  // Invite user back to topic (admin only)
  const handleInviteBackToTopic = async (userId: string, userName: string) => {
    if (!isGeneralTopicAdmin || !activeTopic) return;
    const { error } = await supabase
      .from("kicked_topic_users")
      .delete()
      .eq("topic_id", activeTopic)
      .eq("user_id", userId);
    if (error) {
      console.error("Error inviting user back:", error);
      toast({
        variant: "destructive",
        title: "Failed to invite user back",
        description: error.message,
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["kicked-topic-users", activeTopic] });
    toast({
      title: "User invited back",
      description: `${userName} can now participate in this topic again.`,
    });

    // Send push notification to user being invited back
    const topicName = displayTopics.find((t) => t.id === activeTopic)?.name || "topic";
    try {
      await fetch("/api/notify/topic-invite-back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: userId,
          adminName: currentUserProfile?.name || "Admin",
          topicName,
          topicId: activeTopic,
        }),
      });
    } catch (err) {
      console.error("Failed to send invite back notification:", err);
    }
  };

  // Delete any message (admin only)
  const handleAdminDeleteMessage = async (messageId: string) => {
    if (!isGeneralTopicAdmin) return;
    const { error } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId);
    if (error) {
      console.error("Error deleting message:", error);
      toast({
        variant: "destructive",
        title: "Failed to delete message",
        description: error.message,
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["messages", activeTopic] });
    toast({
      title: "Message deleted",
      description: "The message has been removed.",
    });
  };

  // Update topic (admin only)
  const handleUpdateTopic = async () => {
    if (!isGeneralTopicAdmin || !topicToManage) return;
    const { error } = await supabase
      .from("topics")
      .update({
        name: topicEditName.trim(),
        icon: topicEditIcon.trim(),
      })
      .eq("id", topicToManage.id);
    if (error) {
      console.error("Error updating topic:", error);
      toast({
        variant: "destructive",
        title: "Failed to update topic",
        description: error.message,
      });
      return;
    }
    // Force refetch since topics query has staleTime: Infinity
    await queryClient.refetchQueries({ queryKey: ["topics"] });
    toast({
      title: "Topic updated",
      description: `Topic renamed to "${topicEditName}".`,
    });
    setShowTopicManageModal(false);
    setTopicToManage(null);
  };

  // Delete topic (admin only)
  const handleDeleteTopic = async () => {
    if (!isGeneralTopicAdmin || !topicToManage) return;
    const { error } = await supabase
      .from("topics")
      .delete()
      .eq("id", topicToManage.id);
    if (error) {
      console.error("Error deleting topic:", error);
      toast({
        variant: "destructive",
        title: "Failed to delete topic",
        description: error.message,
      });
      return;
    }
    // Force refetch since topics query has staleTime: Infinity
    await queryClient.refetchQueries({ queryKey: ["topics"] });
    toast({
      title: "Topic deleted",
      description: `Topic "${topicToManage.name}" has been deleted.`,
    });
    setShowTopicManageModal(false);
    setTopicToManage(null);
  };

  // Handle long press on topic tile (admin only)
  const handleTopicLongPress = (topicId: string) => {
    if (!isGeneralTopicAdmin) return;
    const topic = displayTopics.find((t) => t.id === topicId);
    if (topic) {
      setTopicToManage({ id: topic.id, name: topic.name, icon: topic.icon || "💬" });
      setTopicEditName(topic.name);
      setTopicEditIcon(topic.icon || "💬");
      setShowTopicManageModal(true);
    }
  };

  // Create new topic (admin only)
  const handleCreateTopic = async () => {
    if (!isGeneralTopicAdmin || !newTopicName.trim()) return;

    // Get the max display_order
    const maxOrder = displayTopics.reduce((max, t) => Math.max(max, t.display_order || 0), 0);

    const slug = newTopicName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const { error } = await supabase
      .from("topics")
      .insert({
        name: newTopicName.trim(),
        icon: newTopicIcon.trim() || "💬",
        slug,
        display_order: maxOrder + 1,
      });

    if (error) {
      console.error("Error creating topic:", error);
      toast({
        variant: "destructive",
        title: "Failed to create topic",
        description: error.message,
      });
      return;
    }

    // Force refetch since topics query has staleTime: Infinity
    await queryClient.refetchQueries({ queryKey: ["topics"] });
    toast({
      title: "Topic created",
      description: `Topic "${newTopicName}" has been created.`,
    });
    setShowCreateTopic(false);
    setNewTopicName("");
    setNewTopicIcon("");
  };

  // Start reordering topics (admin only)
  const startReorderingTopics = () => {
    setShowTopicManageModal(false);
    setIsReorderingTopics(true);
    setPendingTopicOrder([]);
  };

  // Handle topic reorder changes
  const handleTopicReorder = (reorderedItems: { id: string; displayOrder: number }[]) => {
    console.log('[Topic Reorder] handleTopicReorder called with', reorderedItems);
    setPendingTopicOrder(reorderedItems);
  };

  // Save topic order (admin only)
  const saveTopicOrder = async () => {
    console.log('[Topic Reorder] saveTopicOrder called', {
      isGeneralTopicAdmin,
      pendingTopicOrderLength: pendingTopicOrder.length,
      pendingTopicOrder
    });

    if (!isGeneralTopicAdmin || pendingTopicOrder.length === 0) {
      console.log('[Topic Reorder] Early exit - no changes to save');
      setIsReorderingTopics(false);
      return;
    }

    // Use server API to update topics (bypasses RLS with service role key)
    console.log('[Topic Reorder] Calling server API to reorder topics...');
    try {
      const response = await fetch("/api/topics/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: pendingTopicOrder,
          adminEmail: user?.email,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[Topic Reorder] Server error:', result.error);
        toast({
          variant: "destructive",
          title: "Error saving order",
          description: result.error || "Failed to save topic order",
        });
        setIsReorderingTopics(false);
        setPendingTopicOrder([]);
        return;
      }

      console.log('[Topic Reorder] Server returned updated topics:', result.topics);

      // Update React Query cache with fresh data from server
      queryClient.setQueryData(["topics"], result.topics);

      toast({
        title: "Topic order saved",
        description: "All users will now see topics in this order.",
      });

      // Delay exiting reorder mode to allow React to re-render with new data first
      setTimeout(() => {
        console.log('[Topic Reorder] Exiting reorder mode');
        setIsReorderingTopics(false);
        setPendingTopicOrder([]);
      }, 100);
    } catch (error: any) {
      console.error('[Topic Reorder] Network error:', error);
      toast({
        variant: "destructive",
        title: "Error saving order",
        description: "Network error - please try again",
      });
      setIsReorderingTopics(false);
      setPendingTopicOrder([]);
    }
  };

  // Cancel topic reordering
  const cancelTopicReordering = () => {
    setIsReorderingTopics(false);
    setPendingTopicOrder([]);
  };

  // Start reordering groups (for current user)
  const startReorderingGroups = () => {
    setShowGroupActions(false);
    setIsReorderingGroups(true);
    setPendingGroupOrder([]);
  };

  // Handle group reorder changes
  const handleGroupReorder = (reorderedItems: { id: string; displayOrder: number }[]) => {
    setPendingGroupOrder(reorderedItems);
  };

  // Save group order (for current user)
  const saveGroupOrder = async () => {
    if (!user || pendingGroupOrder.length === 0) {
      setIsReorderingGroups(false);
      return;
    }

    // Update each group membership's display_order
    for (const item of pendingGroupOrder) {
      await supabase
        .from("group_chat_members")
        .update({ display_order: item.displayOrder })
        .eq("group_id", item.id)
        .eq("user_id", user.id);
    }

    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
    toast({
      title: "Group order saved",
      description: "Your groups are now in your preferred order.",
    });
    setIsReorderingGroups(false);
    setPendingGroupOrder([]);
  };

  // Cancel group reordering
  const cancelGroupReordering = () => {
    setIsReorderingGroups(false);
    setPendingGroupOrder([]);
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

  // Detect keyboard visibility on mobile (for hiding tab bar)
  useEffect(() => {
    // Check if VisualViewport API is available
    if (!window.visualViewport) return;

    const handleResize = () => {
      // Compare visual viewport height to window height
      // When keyboard opens, visual viewport becomes smaller
      const isKeyboard = window.visualViewport!.height < window.innerHeight * 0.75;
      setIsKeyboardOpen(isKeyboard);
    };

    window.visualViewport.addEventListener('resize', handleResize);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, []);

  // Auto-resize textarea based on content
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Reset height to auto to get correct scrollHeight
    e.target.style.height = 'auto';
    // Set height to scrollHeight (capped at 150px)
    const newHeight = Math.min(e.target.scrollHeight, 150);
    e.target.style.height = `${newHeight}px`;
  };

  // Handle keyboard shortcuts in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter or Cmd+Enter, not on plain Enter
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (input.trim() || pendingImages.length > 0) {
        handleSend(e as unknown as React.FormEvent);
      }
    }
    // Plain Enter adds a new line (default behavior)
  };

  // Add image to pending queue (for preview before sending)
  const addPendingImage = (file: File, preview: string) => {
    console.log('[Chat] addPendingImage called with:', { fileName: file.name, fileType: file.type, preview });
    setPendingImages(prev => {
      const newImages = [...prev, { file, preview }];
      console.log('[Chat] pendingImages updated, count:', newImages.length);
      return newImages;
    });
  };

  // Remove image from pending queue
  const removePendingImage = (index: number) => {
    setPendingImages(prev => {
      const newImages = [...prev];
      // Clean up object URL
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  // Clear all pending images
  const clearPendingImages = () => {
    pendingImages.forEach(img => URL.revokeObjectURL(img.preview));
    setPendingImages([]);
  };

  // Add file to pending queue
  const addPendingFile = (file: File, fileName: string) => {
    setPendingFiles(prev => [...prev, { file, fileName }]);
  };

  // Remove file from pending queue
  const removePendingFile = (index: number) => {
    setPendingFiles(prev => {
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  // Clear all pending files
  const clearPendingFiles = () => {
    setPendingFiles([]);
  };

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

  // Track topic last read timestamps in localStorage
  const getTopicLastRead = useCallback((topicId: string): string | null => {
    if (!user) return null;
    const key = `topic_last_read_${user.id}_${topicId}`;
    return localStorage.getItem(key);
  }, [user]);

  const markTopicAsRead = useCallback((topicId: string) => {
    if (!user) return;
    const key = `topic_last_read_${user.id}_${topicId}`;
    localStorage.setItem(key, new Date().toISOString());
    queryClient.invalidateQueries({ queryKey: ["topic-unread-counts", user.id] });
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

  // Fetch topics - sorted by display_order (admin-controlled)
  const { data: topics, isLoading: topicsLoading } = useQuery({
    queryKey: ["topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as Topic[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Fetch unread counts for topics
  const { data: topicUnreadCounts } = useQuery({
    queryKey: ["topic-unread-counts", user?.id],
    queryFn: async () => {
      if (!user || !topics) return {};

      const counts: Record<string, number> = {};

      for (const topic of topics) {
        const lastRead = getTopicLastRead(topic.id);

        // Build query for messages after last read, excluding own messages
        let query = supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("topic_id", topic.id)
          .neq("user_id", user.id);

        if (lastRead) {
          query = query.gt("created_at", lastRead);
        }

        const { count } = await query;
        counts[topic.id] = count || 0;
      }

      return counts;
    },
    enabled: !!user && !!topics && topics.length > 0,
    refetchInterval: 30000, // Refetch every 30 seconds
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
              profiles:profiles!group_chat_members_user_id_fkey(*)
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

          // Fetch all members for this group (nested query may be limited by RLS)
          const { data: groupMembers } = await supabase
            .from("group_chat_members")
            .select(`
              *,
              profiles:profiles!group_chat_members_user_id_fkey(*)
            `)
            .eq("group_id", group.id);

          // Get latest message timestamp (use maybeSingle to avoid 406 error when no messages)
          const { data: latestMsgArray } = await supabase
            .from("group_messages")
            .select("created_at")
            .eq("group_id", group.id)
            .order("created_at", { ascending: false })
            .limit(1);
          const latestMsg = latestMsgArray?.[0] || null;

          // Count unread messages (excluding messages sent by the current user)
          let unreadCount = 0;
          if (membership.last_read_at) {
            const { count } = await supabase
              .from("group_messages")
              .select("*", { count: "exact", head: true })
              .eq("group_id", group.id)
              .gt("created_at", membership.last_read_at)
              .neq("user_id", user.id) // Exclude own messages
              .is("deleted_at", null);
            unreadCount = count || 0;
          } else if (membership.status === "accepted") {
            // If never read, count all messages except own
            const { count } = await supabase
              .from("group_messages")
              .select("*", { count: "exact", head: true })
              .eq("group_id", group.id)
              .neq("user_id", user.id) // Exclude own messages
              .is("deleted_at", null);
            unreadCount = count || 0;
          }

          return {
            ...group,
            members: groupMembers || [], // Use separately fetched members
            membership_status: membership.status,
            membership_role: membership.role,
            notifications_enabled: membership.notifications_enabled ?? true,
            display_order: membership.display_order ?? 0,
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
        // Get latest message (use array to avoid 406 when no messages)
        const { data: latestMsgArray } = await supabase
          .from("private_messages")
          .select("created_at")
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${chat.otherId}),and(sender_id.eq.${chat.otherId},receiver_id.eq.${user.id})`)
          .order("created_at", { ascending: false })
          .limit(1);
        const latestMsg = latestMsgArray?.[0] || null;

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

  // Real-time subscription for group membership changes (invites, etc.)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`group-members:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_chat_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Invalidate group chats query when membership changes
          queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_chat_members",
        },
        (payload) => {
          // If someone was added to a group the user is in, refresh
          const newMember = payload.new as any;
          if (newMember.invited_by === user.id || newMember.user_id === user.id) {
            queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Real-time subscription for new group messages (global - for unread counts)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`all-group-messages:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
        },
        (payload) => {
          const newMsg = payload.new as GroupMessage;
          // Don't update for own messages
          if (newMsg.user_id === user.id) return;
          // Invalidate group chats to update unread counts
          queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

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

  // Kick member from group (admin only)
  const handleKickMember = async (memberId: string, memberName: string) => {
    if (!user || !activeGroup) return;

    const confirmed = window.confirm(`Remove ${memberName} from this group?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from("group_chat_members")
      .delete()
      .eq("group_id", activeGroup)
      .eq("user_id", memberId);

    if (error) {
      console.error("Error kicking member:", error);
      toast({
        variant: "destructive",
        title: "Failed to remove member",
        description: "Please try again.",
      });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
    toast({
      title: "Member removed",
      description: `${memberName} has been removed from the group`,
    });
  };

  // Leave group
  const handleLeaveGroup = async () => {
    if (!user || !activeGroup || !activeGroupData) return;

    const currentUserMembership = activeGroupData.members?.find(
      (m: any) => m.user_id === user.id
    );
    const isAdmin = currentUserMembership?.role === "admin";
    // Other accepted members (excluding current user)
    const otherAcceptedMembers = activeGroupData.members?.filter(
      (m: any) => m.status === "accepted" && m.user_id !== user.id
    ) || [];

    // If admin and there are other members, show admin transfer UI
    if (isAdmin && otherAcceptedMembers.length > 0) {
      setShowGroupActions(false);
      setShowAdminTransfer(true);
      return;
    }

    // Check if this user is the last member BEFORE leaving
    const isLastMember = otherAcceptedMembers.length === 0;
    console.log("[handleLeaveGroup] isLastMember:", isLastMember, "otherAcceptedMembers:", otherAcceptedMembers.length);

    // If last member, delete the group directly
    if (isLastMember) {
      console.log("[handleLeaveGroup] Deleting group as last member...");
      const { error: deleteError } = await supabase
        .from("group_chats")
        .delete()
        .eq("id", activeGroup);

      if (deleteError) {
        console.error("Error deleting group:", deleteError);
        toast({
          variant: "destructive",
          title: "Failed to delete group",
          description: "Please try again.",
        });
        return;
      }

      console.log("[handleLeaveGroup] Group deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
      setActiveGroup(null);
      setViewMode("list");
      setShowGroupActions(false);
      toast({ title: "Group deleted" });
      return;
    }

    // Otherwise, just leave the group (keep it for other members)
    const { error } = await supabase
      .from("group_chat_members")
      .delete()
      .eq("group_id", activeGroup)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error leaving group:", error);
      toast({
        variant: "destructive",
        title: "Failed to leave group",
        description: "Please try again.",
      });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
    setActiveGroup(null);
    setViewMode("list");
    setShowGroupActions(false);
    toast({ title: "Left group" });
  };

  // Transfer admin and leave
  const handleTransferAdminAndLeave = async (newAdminId: string) => {
    if (!user || !activeGroup || !activeGroupData) return;

    // Make new admin
    const { error: adminError } = await supabase
      .from("group_chat_members")
      .update({ role: "admin" })
      .eq("group_id", activeGroup)
      .eq("user_id", newAdminId);

    if (adminError) {
      console.error("Error transferring admin:", adminError);
      toast({
        variant: "destructive",
        title: "Failed to transfer admin",
        description: "Please try again.",
      });
      return;
    }

    // Notify new admin
    const newAdmin = activeGroupData.members?.find((m: any) => m.user_id === newAdminId);
    fetch("/api/notify/group-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiverId: newAdminId,
        senderId: user.id,
        senderName: "System",
        groupName: `You are now admin of ${activeGroupData?.name || activeGroupData?.emojis?.join("")}`,
        groupId: activeGroup,
      }),
    }).catch(console.error);

    // Now leave
    const { error: leaveError } = await supabase
      .from("group_chat_members")
      .delete()
      .eq("group_id", activeGroup)
      .eq("user_id", user.id);

    if (leaveError) {
      console.error("Error leaving group:", leaveError);
    }

    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
    setActiveGroup(null);
    setViewMode("list");
    setShowAdminTransfer(false);
    toast({ title: "Admin transferred and left group" });
  };

  // Delete group (admin only) - show confirmation modal
  const handleDeleteGroup = () => {
    if (!user || !activeGroup || !activeGroupData) return;
    console.log("[handleDeleteGroup] Opening delete confirmation modal");
    setShowGroupActions(false);
    setShowDeleteConfirm(true);
  };

  // Actually delete the group after confirmation
  const confirmDeleteGroup = async () => {
    if (!user || !activeGroup || !activeGroupData) return;

    console.log("[confirmDeleteGroup] Deleting group:", activeGroup);

    // Notify all members
    const members = activeGroupData.members?.filter(
      (m: any) => m.status === "accepted" && m.user_id !== user.id
    ) || [];

    for (const member of members) {
      fetch("/api/notify/group-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: member.user_id,
          senderId: user.id,
          senderName: "System",
          groupName: `${activeGroupData?.name || activeGroupData?.emojis?.join("")} has been deleted`,
          groupId: activeGroup,
        }),
      }).catch(console.error);
    }

    // Delete the group (cascades to members and messages)
    const { error } = await supabase
      .from("group_chats")
      .delete()
      .eq("id", activeGroup);

    if (error) {
      console.error("Error deleting group:", error);
      toast({
        variant: "destructive",
        title: "Failed to delete group",
        description: "Please try again.",
      });
      setShowDeleteConfirm(false);
      return;
    }

    console.log("[confirmDeleteGroup] Group deleted successfully");
    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
    setActiveGroup(null);
    setViewMode("list");
    setShowDeleteConfirm(false);
    toast({ title: "Group deleted" });
  };

  // Open rename group modal (admin only)
  const openRenameGroup = () => {
    if (!activeGroupData) return;
    setGroupRenameEmoji(activeGroupData.emojis?.join("") || "");
    setGroupRenameName(activeGroupData.name || "");
    setShowGroupActions(false);
    setShowRenameGroup(true);
  };

  // Rename group (admin only)
  const handleRenameGroup = async () => {
    if (!user || !activeGroup || !activeGroupData) return;

    const oldName = activeGroupData.name || activeGroupData.emojis?.join("") || "Group";
    const newName = groupRenameName.trim() || groupRenameEmoji || "Group";
    const newEmojis = groupRenameEmoji ? [groupRenameEmoji] : activeGroupData.emojis || [];

    const { error } = await supabase
      .from("group_chats")
      .update({
        name: groupRenameName.trim() || null,
        emojis: newEmojis,
      })
      .eq("id", activeGroup);

    if (error) {
      console.error("Error renaming group:", error);
      toast({
        variant: "destructive",
        title: "Failed to rename group",
        description: error.message,
      });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
    setShowRenameGroup(false);
    toast({ title: "Group renamed", description: `Group renamed to "${newName}"` });

    // Send push notification to all members
    try {
      await fetch("/api/notify/group-rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: activeGroup,
          oldName,
          newName,
          adminId: user.id,
          adminName: currentUserProfile?.name || "Admin",
        }),
      });
    } catch (err) {
      console.error("Failed to send group rename notification:", err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0) return;

    const content = input.trim();
    setInput("");
    // Reset textarea height after sending
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    inputRef.current?.focus();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    // Upload pending images and files first
    const imagesToSend = [...pendingImages];
    const filesToSend = [...pendingFiles];
    clearPendingImages();
    clearPendingFiles();

    // Helper function to upload a single image (already compressed in ChatImageUpload)
    const uploadImage = async (imageData: { file: File; preview: string }) => {
      if (!user) return null;
      try {
        // File is already compressed to JPEG in ChatImageUpload component
        const fileName = `chat/${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from("chat-images")
          .upload(fileName, imageData.file, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (uploadError) {
          // Fallback to avatars bucket
          if (uploadError.message.includes("not found")) {
            const fallbackFileName = `chat-${user.id}-${Date.now()}.jpg`;
            const { error: fallbackError } = await supabase.storage
              .from("avatars")
              .upload(fallbackFileName, imageData.file, {
                contentType: "image/jpeg",
                upsert: false,
              });

            if (fallbackError) throw fallbackError;

            const { data: { publicUrl } } = supabase.storage
              .from("avatars")
              .getPublicUrl(fallbackFileName);

            return publicUrl;
          }
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from("chat-images")
          .getPublicUrl(fileName);

        return publicUrl;
      } catch (error) {
        console.error("Image upload error:", error);
        return null;
      }
    };

    // Helper function to upload a single file
    const uploadFile = async (fileData: { file: File; fileName: string }) => {
      if (!user) return null;
      try {
        // Sanitize filename and create unique path
        const ext = fileData.fileName.split(".").pop() || "file";
        const sanitizedName = fileData.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const fileName = `chat-files/${user.id}/${Date.now()}-${sanitizedName}`;

        console.log("[uploadFile] Uploading:", fileName, "type:", fileData.file.type, "size:", fileData.file.size);

        const { error: uploadError } = await supabase.storage
          .from("chat-images")
          .upload(fileName, fileData.file, {
            contentType: fileData.file.type || "application/octet-stream",
            upsert: false,
          });

        if (uploadError) {
          console.log("[uploadFile] Primary upload error:", uploadError.message);
          // Fallback to avatars bucket
          const fallbackFileName = `chat-file-${user.id}-${Date.now()}.${ext}`;
          console.log("[uploadFile] Trying fallback bucket with:", fallbackFileName);

          const { error: fallbackError } = await supabase.storage
            .from("avatars")
            .upload(fallbackFileName, fileData.file, {
              contentType: fileData.file.type || "application/octet-stream",
              upsert: false,
            });

          if (fallbackError) {
            console.error("[uploadFile] Fallback upload error:", fallbackError.message);
            toast({
              title: "Upload failed",
              description: `Could not upload "${fileData.fileName}". ${fallbackError.message}`,
            });
            return null;
          }

          const { data: { publicUrl } } = supabase.storage
            .from("avatars")
            .getPublicUrl(fallbackFileName);

          console.log("[uploadFile] Fallback success:", publicUrl);
          return publicUrl;
        }

        const { data: { publicUrl } } = supabase.storage
          .from("chat-images")
          .getPublicUrl(fileName);

        console.log("[uploadFile] Upload success:", publicUrl);
        return publicUrl;
      } catch (error: any) {
        console.error("[uploadFile] Exception:", error);
        toast({
          title: "Upload failed",
          description: `Could not upload "${fileData.fileName}". Please try again.`,
        });
        return null;
      }
    };

    // Helper function to send a message with the appropriate mutation
    const sendMsg = async (msgContent: string) => {
      if (activeTab === "dms" && activeDm) {
        await sendPrivateMessage.mutateAsync(msgContent);
      } else if (activeTab === "groups" && activeGroup) {
        await sendGroupMessage.mutateAsync(msgContent);
      } else if (activeTab === "general" && activeTopic) {
        await sendMessage.mutateAsync(msgContent);
      }
    };

    if (activeTab === "ai") {
      if (content) await sendAiMessage(content);
    } else if (!user) {
      return;
    } else {
      // Upload and send images first
      if (imagesToSend.length > 0 || filesToSend.length > 0) {
        setIsUploadingImages(true);
        try {
          for (const img of imagesToSend) {
            const imageUrl = await uploadImage(img);
            if (imageUrl) {
              await sendMsg(imageUrl);
            }
          }
          for (const fileData of filesToSend) {
            const fileUrl = await uploadFile(fileData);
            if (fileUrl) {
              await sendMsg(fileUrl);
            }
          }
        } finally {
          setIsUploadingImages(false);
        }
      }

      // Send text content
      if (content) {
        await sendMsg(content);

        // Send notifications
        if (activeTab === "dms" && activeDm && activeDmProfile && currentUserProfile) {
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
        } else if (activeTab === "groups" && activeGroup && activeGroupData && currentUserProfile) {
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
        } else if (activeTab === "general" && activeTopic) {
          const topicForNotify = displayTopics.find((t) => t.id === activeTopic);
          if (topicForNotify && currentUserProfile) {
            fetch("/api/notify/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topicId: activeTopic,
                topicName: topicForNotify.name,
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
                  topicName: topicForNotify.name,
                  senderId: user.id,
                  senderName: currentUserProfile.name,
                  messagePreview: content,
                  mentionedNames: mentions.map(m => m.substring(1)),
                }),
              }).catch(console.error);
            }
          }
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

  // Get member names subtitle for group tile - "Steve, Derek + 2" format
  const getGroupMemberNames = (group: any): string => {
    // Get all accepted members
    const allMembers = group.members?.filter((m: any) => m.status === "accepted") || [];
    if (allMembers.length === 0) return "";

    // Sort: admin first, then by join date
    const sortedMembers = [...allMembers].sort((a: any, b: any) => {
      if (a.role === "admin" && b.role !== "admin") return -1;
      if (a.role !== "admin" && b.role === "admin") return 1;
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    });

    // Get first names
    const getFirstName = (m: any) => m.profiles?.name?.split(" ")[0] || "";

    // Only 1 member (the admin)
    if (sortedMembers.length === 1) {
      const adminName = getFirstName(sortedMembers[0]);
      return adminName || "";
    }

    // 2 members - "Steve & Derek"
    if (sortedMembers.length === 2) {
      const name1 = getFirstName(sortedMembers[0]);
      const name2 = getFirstName(sortedMembers[1]);
      if (name1 && name2) return `${name1} & ${name2}`;
      return name1 || name2 || "";
    }

    // 3+ members - "Steve, Derek + 2"
    const name1 = getFirstName(sortedMembers[0]);
    const name2 = getFirstName(sortedMembers[1]);
    const remaining = sortedMembers.length - 2;

    if (name1 && name2) {
      return `${name1}, ${name2} + ${remaining}`;
    }
    return "";
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
    markTopicAsRead(topicId);
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

  // Handle long press on group tile (shows actions modal)
  const handleGroupLongPress = (groupId: string) => {
    setActiveGroup(groupId);
    setShowGroupActions(true);
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

  // Calculate total unread counts for tab badges
  const totalGroupUnread = (groupChats || [])
    .filter((g: any) => g.membership_status === "accepted")
    .reduce((sum: number, g: any) => sum + (g.unread_count || 0), 0);

  const totalDmUnread = (dmsWithHistory?.active || [])
    .reduce((sum: number, dm: any) => sum + (dm.unreadCount || 0), 0);

  const totalGeneralUnread = Object.values(topicUnreadCounts || {})
    .reduce((sum: number, count) => sum + (count as number), 0);

  // Check if current user is admin of the active group
  const isCurrentUserGroupAdmin = isGroupChat && activeGroupData?.membership_role === "admin";

  // Check if group notifications are enabled for current user
  const isGroupNotificationsEnabled = isGroupChat && activeGroupData?.notifications_enabled;

  // Toggle group notifications
  const handleToggleGroupNotifications = async () => {
    if (!user || !activeGroup) return;

    const newValue = !activeGroupData?.notifications_enabled;

    const { error } = await supabase
      .from("group_chat_members")
      .update({ notifications_enabled: newValue })
      .eq("group_id", activeGroup)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error toggling notifications:", error);
      toast({
        variant: "destructive",
        title: "Failed to update notification settings",
        description: "Please try again.",
      });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["group-chats", user.id] });
    toast({
      title: newValue ? "Notifications enabled" : "Notifications muted",
      description: newValue
        ? "You'll receive notifications from this group"
        : "You won't receive notifications from this group",
    });
  };

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
            <div className="flex items-center gap-1.5 bg-muted rounded-lg p-1">
              <button
                onClick={() => {
                  setActiveTab("groups");
                  setViewMode("list");
                }}
                className={`relative px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === "groups"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Groups
                {totalGroupUnread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                    {totalGroupUnread > 99 ? "99+" : totalGroupUnread}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setActiveTab("general");
                  setViewMode("list");
                }}
                className={`relative px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === "general"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                General
                {totalGeneralUnread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                    {totalGeneralUnread > 99 ? "99+" : totalGeneralUnread}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setActiveTab("dms");
                  setViewMode("list");
                }}
                className={`relative px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === "dms"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                DMs
                {totalDmUnread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                    {totalDmUnread > 99 ? "99+" : totalDmUnread}
                  </span>
                )}
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
                  {/* Admin button to manage kicked users */}
                  {isGeneralTopicAdmin && (
                    <button
                      onClick={() => setShowTopicMembers(true)}
                      className="ml-auto p-2 rounded-full hover:bg-muted transition-colors"
                      title="Manage members"
                    >
                      <Shield className="h-4 w-4 text-primary" />
                    </button>
                  )}
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
                    {activeGroupData.name || getGroupMemberNames(activeGroupData) || "Group Chat"}
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
                  .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
                  .map((g: any) => ({
                    id: g.id,
                    emoji: g.emojis,
                    name: g.name || "", // Show title if set, otherwise empty (just emojis)
                    subtitle: getGroupMemberNames(g), // Always show member names below
                    unreadCount: g.unread_count,
                    isAdmin: g.membership_role === "admin",
                    displayOrder: g.display_order,
                  }))}
                onSelect={isReorderingGroups ? () => {} : handleSelectGroup}
                onLongPress={!isReorderingGroups ? handleGroupLongPress : undefined}
                showCreate={!isReorderingGroups}
                onCreateClick={() => setShowCreateGroup(true)}
                onAccept={handleAcceptGroupInvite}
                onDecline={handleDeclineGroupInvite}
                isReordering={isReorderingGroups}
                onReorder={handleGroupReorder}
                onReorderCancel={cancelGroupReordering}
                onReorderSave={saveGroupOrder}
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
                          {g.name || getGroupMemberNames(g) || "Group"}
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
                  unreadCount: topicUnreadCounts?.[t.id] || 0,
                  displayOrder: t.display_order,
                }))}
                onSelect={isReorderingTopics ? () => {} : handleSelectTopic}
                onLongPress={isGeneralTopicAdmin && !isReorderingTopics ? handleTopicLongPress : undefined}
                showCreate={isGeneralTopicAdmin && !isReorderingTopics}
                onCreateClick={() => setShowCreateTopic(true)}
                isReordering={isReorderingTopics}
                onReorder={handleTopicReorder}
                onReorderCancel={cancelTopicReordering}
                onReorderSave={saveTopicOrder}
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

                    // Check if this is a general topic (not private chat, not group chat)
                    const isGeneralTopic = !isPrivateChat && !isGroupChat && activeTab === "general";

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
                        isGroupChat={isGroupChat}
                        isAdmin={isCurrentUserGroupAdmin}
                        onKick={handleKickMember}
                        isTopicAdmin={isGeneralTopic && isGeneralTopicAdmin && !isOwn}
                        onTopicAdminDelete={isGeneralTopic && isGeneralTopicAdmin ? handleAdminDeleteMessage : undefined}
                        onTopicAdminKick={isGeneralTopic && isGeneralTopicAdmin ? (userId: string, userName: string) => setShowKickConfirm({ userId, userName }) : undefined}
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
                              ) : isFileUrl(msg.content) ? (
                                <ChatFile src={msg.content} />
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
            <div className="shrink-0 px-3 py-2 pb-safe md:px-4 md:py-3 bg-card border-t border-border sticky bottom-0">
              {/* Kicked from topic message */}
              {activeTab === "general" && isKickedFromTopic && (
                <div className="text-center py-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                    <UserMinus className="h-4 w-4" />
                    <span className="text-sm font-medium">You have been removed from this topic</span>
                  </div>
                </div>
              )}
              {/* Image and file previews before sending */}
              {!isKickedFromTopic && (pendingImages.length > 0 || pendingFiles.length > 0) && (
                <div className="mb-3 flex gap-2 flex-wrap items-end">
                  {/* Image previews */}
                  {pendingImages.map((img, idx) => (
                    <div key={`img-${idx}`} className="relative group">
                      <img
                        src={img.preview}
                        alt={`Preview ${idx + 1}`}
                        className={`h-16 w-16 object-cover rounded-lg border-2 border-primary/30 ${
                          pendingImages.length > 1 ? (idx > 0 ? '-ml-4' : '') : ''
                        }`}
                        style={pendingImages.length > 1 && idx > 0 ? { marginLeft: '-8px', zIndex: pendingImages.length - idx } : undefined}
                      />
                      <button
                        type="button"
                        onClick={() => removePendingImage(idx)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {/* File previews */}
                  {pendingFiles.map((file, idx) => (
                    <div key={`file-${idx}`} className="relative group flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate max-w-[120px]">{file.fileName}</span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(idx)}
                        className="w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Hide form when kicked from topic */}
              {!(activeTab === "general" && isKickedFromTopic) && (
              <form onSubmit={handleSend} className="flex gap-2 items-center relative">
                {isAiChat ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground shrink-0 rounded-full h-11 w-11"
                  >
                    <Sparkles className="h-6 w-6" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`shrink-0 rounded-full transition-colors h-12 w-12 ${
                      isGroupChat
                        ? (isGroupNotificationsEnabled ? "text-primary" : "text-muted-foreground")
                        : isPrivateChat
                        ? (hasNotificationsEnabled ? "text-primary" : "text-muted-foreground")
                        : (isFollowingTopic ? "text-primary" : "text-muted-foreground")
                    }`}
                    onClick={() => {
                      if (isGroupChat) {
                        // For group chats, toggle group-specific notifications
                        if (!hasNotificationsEnabled) {
                          // First need to enable push notifications globally
                          setShowTopicPrompt(true);
                        } else {
                          handleToggleGroupNotifications();
                        }
                      } else if (isPrivateChat) {
                        if (!hasNotificationsEnabled) {
                          setShowDmPrompt(true);
                        }
                        // DMs don't have individual toggles, just global push
                      } else {
                        // Topic notifications
                        if (!hasNotificationsEnabled) {
                          setShowTopicPrompt(true);
                        } else {
                          toggleFollow();
                        }
                      }
                    }}
                    disabled={followLoading}
                    title={
                      isGroupChat
                        ? (isGroupNotificationsEnabled ? "Mute group notifications" : "Enable group notifications")
                        : isPrivateChat
                        ? (hasNotificationsEnabled ? "Notifications enabled" : "Enable notifications")
                        : (isFollowingTopic ? "Disable notifications for this channel" : "Enable notifications for this channel")
                    }
                  >
                    {followLoading ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : isGroupChat ? (
                      isGroupNotificationsEnabled ? <Bell className="h-8 w-8" /> : <BellOff className="h-8 w-8" />
                    ) : isPrivateChat ? (
                      hasNotificationsEnabled ? <Bell className="h-8 w-8" /> : <BellOff className="h-8 w-8" />
                    ) : (
                      isFollowingTopic ? <Bell className="h-8 w-8" /> : <BellOff className="h-8 w-8" />
                    )}
                  </Button>
                )}
                {/* Image/file upload button (not for AI chat) */}
                {!isAiChat && (
                  <ChatImageUpload
                    onImageSelected={addPendingImage}
                    onFileSelected={addPendingFile}
                    disabled={isPending || isUploadingImages}
                    iconSize="h-8 w-8"
                    buttonSize="h-12 w-12"
                  />
                )}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type here..."
                  className="flex-1 min-h-[44px] max-h-[150px] py-3 px-4 rounded-2xl bg-muted/50 border-transparent focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all pr-14 resize-none text-[15px] leading-relaxed overflow-y-auto"
                  disabled={isPending || isUploadingImages}
                  rows={1}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-transform hover:scale-105"
                  disabled={(!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0) || isPending || isUploadingImages}
                  title="Send (Ctrl+Enter)"
                >
                  {isPending || isUploadingImages ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </form>
              )}
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
            onClick={() => { setShowInviteMembers(false); setInviteModalTab("connections"); }}
          />
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Group Members</h2>
              <button
                onClick={() => { setShowInviteMembers(false); setInviteModalTab("connections"); }}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            </div>
            {/* Tab Switcher */}
            <div className="flex border-b">
              <button
                onClick={() => setInviteModalTab("connections")}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  inviteModalTab === "connections"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Invite Connections
              </button>
              <button
                onClick={() => setInviteModalTab("members")}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  inviteModalTab === "members"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Members ({activeGroupData?.members?.filter((m: any) => m.status === "accepted").length || 0})
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {inviteModalTab === "connections" ? (
                // Connections tab - invite new members
                invitableConnections.length === 0 ? (
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
                )
              ) : (
                // Members tab - show current members
                <div className="space-y-2">
                  {activeGroupData?.members
                    ?.filter((m: any) => m.status === "accepted")
                    .map((member: any) => {
                      const isAdmin = member.role === "admin";
                      const isCurrentUser = member.user_id === user?.id;
                      const currentUserIsAdmin = activeGroupData?.members?.find(
                        (m: any) => m.user_id === user?.id && m.role === "admin"
                      );
                      return (
                        <div
                          key={member.id}
                          className="w-full flex items-center justify-between p-3 rounded-xl border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage
                                src={member.profiles?.avatar_url || undefined}
                                alt={member.profiles?.name}
                              />
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {getInitials(member.profiles?.name || "?")}
                              </AvatarFallback>
                            </Avatar>
                            <div className="text-left">
                              <p className="font-medium">
                                {member.profiles?.name}
                                {isCurrentUser && " (You)"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {isAdmin ? "Admin" : "Member"}
                              </p>
                            </div>
                          </div>
                          {/* Kick button for admins (can't kick self or other admins) */}
                          {currentUserIsAdmin && !isCurrentUser && !isAdmin && (
                            <button
                              onClick={() => handleKickMember(member.user_id, member.profiles?.name)}
                              className="p-2 rounded-full hover:bg-red-500/10 text-red-500 transition-colors"
                              title="Remove from group"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Group Actions Modal (Delete/Leave) */}
      {showGroupActions && activeGroupData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowGroupActions(false)}
          />
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="p-4 text-center border-b">
              <div className="text-3xl mb-2">
                {activeGroupData.emojis?.join("") || "💬"}
              </div>
              <h2 className="text-lg font-semibold">
                {activeGroupData.name || "Group"}
              </h2>
            </div>
            <div className="p-4 space-y-2">
              <button
                onClick={startReorderingGroups}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-foreground"
              >
                <GripVertical className="h-5 w-5" />
                Move Groups
              </button>
              <button
                onClick={handleLeaveGroup}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-foreground"
              >
                <ArrowLeft className="h-5 w-5" />
                Leave Group
              </button>
              {activeGroupData.membership_role === "admin" && (
                <>
                  <button
                    onClick={openRenameGroup}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-foreground"
                  >
                    <Pencil className="h-5 w-5" />
                    Rename Group
                  </button>
                  <button
                    onClick={handleDeleteGroup}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-red-500"
                  >
                    <Trash2 className="h-5 w-5" />
                    Delete Group
                  </button>
                </>
              )}
            </div>
            <div className="p-4 border-t">
              <button
                onClick={() => setShowGroupActions(false)}
                className="w-full p-3 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Group Modal (Admin Only) */}
      {showRenameGroup && activeGroupData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowRenameGroup(false)}
          />
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="p-4 text-center border-b">
              <h2 className="text-lg font-semibold">Rename Group</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Change the group's emoji and name
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Group Emoji</label>
                <Input
                  value={groupRenameEmoji}
                  onChange={(e) => setGroupRenameEmoji(e.target.value)}
                  placeholder="Enter emoji(s)"
                  className="text-center text-2xl"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Group Name (optional)</label>
                <Input
                  value={groupRenameName}
                  onChange={(e) => setGroupRenameName(e.target.value)}
                  placeholder="Enter group name"
                  maxLength={50}
                />
              </div>
            </div>
            <div className="p-4 space-y-2 border-t">
              <button
                onClick={handleRenameGroup}
                disabled={!groupRenameEmoji.trim() && !groupRenameName.trim()}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-primary hover:bg-primary/90 transition-colors text-primary-foreground disabled:opacity-50"
              >
                <Pencil className="h-5 w-5" />
                Save Changes
              </button>
              <button
                onClick={() => setShowRenameGroup(false)}
                className="w-full p-3 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Transfer Modal */}
      {showAdminTransfer && activeGroupData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAdminTransfer(false)}
          />
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Transfer Admin Role</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select a member to make admin before leaving
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {activeGroupData.members
                ?.filter((m: any) => m.status === "accepted" && m.user_id !== user?.id)
                .map((member: any) => (
                  <button
                    key={member.id}
                    onClick={() => handleTransferAdminAndLeave(member.user_id)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage
                          src={member.profiles?.avatar_url || undefined}
                          alt={member.profiles?.name}
                        />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(member.profiles?.name || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left">
                        <p className="font-medium">{member.profiles?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {member.role === "admin" ? "Admin" : "Member"}
                        </p>
                      </div>
                    </div>
                    <div className="text-primary text-sm font-medium">
                      Make Admin
                    </div>
                  </button>
                ))}
            </div>
            <div className="p-4 border-t">
              <button
                onClick={() => setShowAdminTransfer(false)}
                className="w-full p-3 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Group Confirmation Modal */}
      {showDeleteConfirm && activeGroupData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="h-8 w-8 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Delete Group?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                This will permanently delete "{activeGroupData.name || activeGroupData.emojis?.join("")}" and all its messages. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 p-3 rounded-xl border border-border hover:bg-muted transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteGroup}
                  className="flex-1 p-3 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Topic Management Modal (Admin Only) */}
      {showTopicManageModal && topicToManage && isGeneralTopicAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowTopicManageModal(false);
              setTopicToManage(null);
            }}
          />
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Manage Topic</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Emoji</label>
                  <Input
                    value={topicEditIcon}
                    onChange={(e) => setTopicEditIcon(e.target.value)}
                    placeholder="💬"
                    className="mt-1"
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <Input
                    value={topicEditName}
                    onChange={(e) => setTopicEditName(e.target.value)}
                    placeholder="Topic name"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowTopicManageModal(false);
                    setTopicToManage(null);
                  }}
                  className="flex-1 p-3 rounded-xl border border-border hover:bg-muted transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateTopic}
                  className="flex-1 p-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium"
                >
                  Save
                </button>
              </div>
              <button
                onClick={startReorderingTopics}
                className="w-full mt-3 p-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium"
              >
                Move Topics
              </button>
              <button
                onClick={handleDeleteTopic}
                className="w-full mt-3 p-3 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors font-medium"
              >
                Delete Topic
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Topic Modal (Admin Only) */}
      {showCreateTopic && isGeneralTopicAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowCreateTopic(false);
              setNewTopicName("");
              setNewTopicIcon("");
            }}
          />
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Create New Topic</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Emoji</label>
                  <Input
                    value={newTopicIcon}
                    onChange={(e) => setNewTopicIcon(e.target.value)}
                    placeholder="💬"
                    className="mt-1 text-2xl text-center"
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Topic Name</label>
                  <Input
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="Enter topic name"
                    className="mt-1"
                    maxLength={50}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateTopic(false);
                    setNewTopicName("");
                    setNewTopicIcon("");
                  }}
                  className="flex-1 p-3 rounded-xl border border-border hover:bg-muted transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTopic}
                  disabled={!newTopicName.trim()}
                  className="flex-1 p-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Topic Members Modal (Admin Only) */}
      {showTopicMembers && activeTopic && isGeneralTopicAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowTopicMembers(false)}
          />
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden max-h-[80vh]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold">Kicked Users</h2>
              <button
                onClick={() => setShowTopicMembers(false)}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {kickedTopicUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No kicked users in this topic.
                </p>
              ) : (
                <div className="space-y-2">
                  {kickedTopicUsers.map((kicked: any) => (
                    <div
                      key={kicked.user_id}
                      className="flex items-center justify-between p-3 rounded-xl bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={kicked.profiles?.avatar_url} />
                          <AvatarFallback>
                            {kicked.profiles?.name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{kicked.profiles?.name || "Unknown"}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInviteBackToTopic(kicked.user_id, kicked.profiles?.name || "User")}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Invite Back
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kick User Confirmation (Admin Only) */}
      {showKickConfirm && isGeneralTopicAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowKickConfirm(null)}
          />
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <UserMinus className="h-8 w-8 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Kick User?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to kick {showKickConfirm.userName} from this topic? They won't be able to see or send messages until you invite them back.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowKickConfirm(null)}
                  className="flex-1 p-3 rounded-xl border border-border hover:bg-muted transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleKickFromTopic(showKickConfirm.userId, showKickConfirm.userName)}
                  className="flex-1 p-3 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors font-medium"
                >
                  Kick
                </button>
              </div>
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
