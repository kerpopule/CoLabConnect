import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { Smile, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Common emoji reactions like iMessage
const QUICK_EMOJIS = [
  ["❤️", "👍", "👎", "😂", "😮"],
  ["😢", "👋", "😠", "🤷", "😎"],
];

interface Reaction {
  id: string;
  message_id: string;
  message_type: "public" | "private";
  user_id: string;
  emoji: string;
  created_at: string;
}

interface ReactionCount {
  emoji: string;
  count: number;
  userReacted: boolean;
}

interface EmojiReactionsProps {
  messageId: string;
  messageType: "public" | "private";
  messageSenderId?: string; // The user who sent the message (for notifications)
  onReactionChange?: () => void;
}

// Cache for reactions to reduce database calls
const reactionsCache = new Map<string, Reaction[]>();

export function EmojiReactions({ messageId, messageType, messageSenderId, onReactionChange }: EmojiReactionsProps) {
  const { user, profile: currentUserProfile } = useAuth();
  const queryClient = useQueryClient();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const cacheKey = `${messageType}:${messageId}`;

  // Load reactions
  useEffect(() => {
    const loadReactions = async () => {
      // Check cache first
      if (reactionsCache.has(cacheKey)) {
        setReactions(reactionsCache.get(cacheKey) || []);
      }

      try {
        const { data, error } = await supabase
          .from("message_reactions")
          .select("*")
          .eq("message_id", messageId)
          .eq("message_type", messageType);

        if (error) {
          // Table might not exist yet - silently fail
          console.log("Reactions not available:", error.message);
          return;
        }

        const reactionsData = data || [];
        reactionsCache.set(cacheKey, reactionsData);
        setReactions(reactionsData);
      } catch (err) {
        console.log("Reactions feature not available");
      }
    };

    loadReactions();
  }, [messageId, messageType, cacheKey]);

  // Subscribe to real-time reactions
  useEffect(() => {
    const channel = supabase
      .channel(`reactions:${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `message_id=eq.${messageId}`,
        },
        async () => {
          // Refetch reactions on any change
          const { data } = await supabase
            .from("message_reactions")
            .select("*")
            .eq("message_id", messageId)
            .eq("message_type", messageType);

          if (data) {
            reactionsCache.set(cacheKey, data);
            setReactions(data);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, messageType, cacheKey]);

  // Calculate reaction counts
  const reactionCounts: ReactionCount[] = reactions.reduce((acc, reaction) => {
    const existing = acc.find(r => r.emoji === reaction.emoji);
    if (existing) {
      existing.count++;
      if (reaction.user_id === user?.id) {
        existing.userReacted = true;
      }
    } else {
      acc.push({
        emoji: reaction.emoji,
        count: 1,
        userReacted: reaction.user_id === user?.id,
      });
    }
    return acc;
  }, [] as ReactionCount[]);

  // Toggle reaction
  const toggleReaction = async (emoji: string) => {
    if (!user || isLoading) return;

    setIsLoading(true);
    setShowPicker(false);

    try {
      // Check if user already reacted with this emoji
      const existingReaction = reactions.find(
        r => r.user_id === user.id && r.emoji === emoji
      );

      if (existingReaction) {
        // Remove reaction
        await supabase
          .from("message_reactions")
          .delete()
          .eq("id", existingReaction.id);

        // Update local state
        const newReactions = reactions.filter(r => r.id !== existingReaction.id);
        reactionsCache.set(cacheKey, newReactions);
        setReactions(newReactions);
      } else {
        // Add reaction
        const { data, error } = await supabase
          .from("message_reactions")
          .insert({
            message_id: messageId,
            message_type: messageType,
            user_id: user.id,
            emoji,
          })
          .select()
          .single();

        if (error) throw error;

        // Update local state
        const newReactions = [...reactions, data];
        reactionsCache.set(cacheKey, newReactions);
        setReactions(newReactions);

        // Send push notification to the message sender (not to self)
        if (messageSenderId && messageSenderId !== user.id && currentUserProfile) {
          fetch("/api/notify/reaction", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              receiverId: messageSenderId,
              senderId: user.id,
              senderName: currentUserProfile.name,
              emoji,
              messageType,
            }),
          }).catch(console.error);
        }
      }

      onReactionChange?.();
    } catch (err) {
      console.error("Reaction error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {/* Display existing reactions */}
      {reactionCounts.map(({ emoji, count, userReacted }) => (
        <button
          key={emoji}
          onClick={() => toggleReaction(emoji)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all ${
            userReacted
              ? "bg-primary/20 border border-primary/40"
              : "bg-muted/50 border border-transparent hover:bg-muted"
          }`}
          disabled={isLoading}
        >
          <span>{emoji}</span>
          <span className={userReacted ? "text-primary font-medium" : "text-muted-foreground"}>
            {count}
          </span>
        </button>
      ))}

      {/* Add reaction button */}
      <Popover open={showPicker} onOpenChange={setShowPicker}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center justify-center w-6 h-6 rounded-full bg-muted/30 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            disabled={isLoading}
          >
            <Plus className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex flex-col gap-1">
            {QUICK_EMOJIS.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-1">
                {row.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => toggleReaction(emoji)}
                    className="w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-muted transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Inline reaction button for message hover actions
export function AddReactionButton({ messageId, messageType }: { messageId: string; messageType: "public" | "private" }) {
  const { user } = useAuth();
  const [showPicker, setShowPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const addReaction = async (emoji: string) => {
    if (!user || isLoading) return;

    setIsLoading(true);
    setShowPicker(false);

    try {
      await supabase
        .from("message_reactions")
        .insert({
          message_id: messageId,
          message_type: messageType,
          user_id: user.id,
          emoji,
        });
    } catch (err) {
      console.error("Reaction error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Popover open={showPicker} onOpenChange={setShowPicker}>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Add reaction"
        >
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <div className="flex flex-col gap-1">
          {QUICK_EMOJIS.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1">
              {row.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => addReaction(emoji)}
                  className="w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-muted transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
