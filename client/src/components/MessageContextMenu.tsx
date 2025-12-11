import { useState, useRef, useEffect, createContext, useContext } from "react";
import { Edit2, Trash2, X, Check, Loader2, Reply, VolumeX, Volume2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Context for inline editing state - allows parent to know when editing is active
interface EditingContextType {
  isEditing: boolean;
  editContent: string;
  setEditContent: (content: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const EditingContext = createContext<EditingContextType | null>(null);

export function useEditing() {
  return useContext(EditingContext);
}

interface MessageActionsProps {
  messageId: string;
  content: string;
  isOwnMessage: boolean;
  isDeleted: boolean;
  isMedia?: boolean; // If true, don't show edit option (only delete)
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onEditingChange?: (isEditing: boolean) => void;
}

/**
 * Message actions dropdown - triggered by hover on desktop
 * Note: This component is used for desktop hover actions. Inline editing is handled by MessageWrapper.
 */
export function MessageActions({
  messageId,
  content,
  isOwnMessage,
  isDeleted,
  isMedia = false,
  onEdit,
  onDelete,
  onEditingChange,
}: MessageActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Don't show for deleted messages or others' messages
  if (!isOwnMessage || isDeleted) {
    return null;
  }

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      await onDelete(messageId);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Failed to delete message:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = () => {
    onEditingChange?.(true);
    setShowMenu(false);
  };

  return (
    <>
      <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute top-1 right-1 p-1 rounded hover:bg-muted/80 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(true);
            }}
          >
            <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          {!isMedia && (
            <DropdownMenuItem
              onClick={handleStartEdit}
              className="flex items-center gap-2"
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              setShowDeleteDialog(true);
              setShowMenu(false);
            }}
            className="flex items-center gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Wrapper component that handles long-press for mobile
 */
interface MessageWrapperProps {
  children: React.ReactNode;
  messageId: string;
  content: string;
  isOwnMessage: boolean;
  isDeleted: boolean;
  isMedia?: boolean; // If true, don't show edit option (only delete)
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  // New props for Reply/Mute on others' messages
  senderName?: string;
  senderId?: string;
  onReply?: (senderName: string) => void;
  onMute?: (userId: string) => Promise<void>;
  onUnmute?: (userId: string) => Promise<void>;
  isMuted?: boolean;
  isPrivateChat?: boolean;
  // Admin kick functionality for group chats
  isGroupChat?: boolean;
  isAdmin?: boolean;
  onKick?: (userId: string, userName: string) => Promise<void>;
  // Topic admin functionality (general topics)
  isTopicAdmin?: boolean;
  onTopicAdminDelete?: (messageId: string) => Promise<void>;
  onTopicAdminKick?: (userId: string, userName: string) => void;
}

export function MessageWrapper({
  children,
  messageId,
  content,
  isOwnMessage,
  isDeleted,
  isMedia = false,
  onEdit,
  onDelete,
  senderName,
  senderId,
  onReply,
  onMute,
  onUnmute,
  isMuted = false,
  isPrivateChat = false,
  isGroupChat = false,
  isAdmin = false,
  onKick,
  isTopicAdmin = false,
  onTopicAdminDelete,
  onTopicAdminKick,
}: MessageWrapperProps) {
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea and focus when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      // Focus and select all text
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
        // Auto-resize to fit content
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
      }, 50);
    }
  }, [isEditing]);

  // Handle save
  const handleSave = async () => {
    if (!editContent.trim() || editContent === content) {
      setIsEditing(false);
      setEditContent(content);
      return;
    }

    setIsSubmitting(true);
    try {
      await onEdit(messageId, editContent.trim());
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to edit message:", error);
      setEditContent(content);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setIsEditing(false);
    setEditContent(content);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  // Don't add interactions for deleted messages
  // For DMs, only show actions for own messages (edit/delete)
  if (isDeleted) {
    return <>{children}</>;
  }

  // In private chats, only own messages get context menu
  if (isPrivateChat && !isOwnMessage) {
    return <>{children}</>;
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    longPressTimer.current = setTimeout(() => {
      setShowActions(true);
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

    // Cancel if user moved too much (scrolling)
    if (deltaX > 10 || deltaY > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowActions(true);
  };

  // Provide editing context to children
  const editingContext: EditingContextType = {
    isEditing,
    editContent,
    setEditContent,
    onSave: handleSave,
    onCancel: handleCancel,
    isSubmitting,
  };

  return (
    <EditingContext.Provider value={editingContext}>
      <div
        className="group relative select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={handleContextMenu}
      >
        {children}

        {/* Actions overlay for long-press on mobile */}
        {showActions && !isEditing && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-2xl flex items-center justify-center gap-4 z-10">
            {isOwnMessage ? (
              // Own message actions: Edit (if not media) & Delete
              <>
                {!isMedia && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowActions(false);
                      setEditContent(content);
                      setIsEditing(true);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Edit2 className="h-4 w-4" />
                    Edit
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await onDelete(messageId);
                    } catch (error) {
                      console.error("Failed to delete:", error);
                    }
                    setShowActions(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </>
            ) : (
              // Others' message actions: Reply & Mute/Unmute & Kick (admin only)
              <>
                {onReply && senderName && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onReply(senderName);
                      setShowActions(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Reply className="h-4 w-4" />
                    Reply
                  </Button>
                )}
                {senderId && (isMuted ? onUnmute : onMute) && (
                  <Button
                    size="sm"
                    variant={isMuted ? "outline" : "secondary"}
                    onClick={async () => {
                      try {
                        if (isMuted && onUnmute) {
                          await onUnmute(senderId);
                        } else if (onMute) {
                          await onMute(senderId);
                        }
                      } catch (error) {
                        console.error("Failed to mute/unmute:", error);
                      }
                      setShowActions(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    {isMuted ? (
                      <>
                        <Volume2 className="h-4 w-4" />
                        Unmute
                      </>
                    ) : (
                      <>
                        <VolumeX className="h-4 w-4" />
                        Mute
                      </>
                    )}
                  </Button>
                )}
                {/* Kick button for group chat admins */}
                {isGroupChat && isAdmin && senderId && senderName && onKick && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      try {
                        await onKick(senderId, senderName);
                      } catch (error) {
                        console.error("Failed to kick:", error);
                      }
                      setShowActions(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <UserMinus className="h-4 w-4" />
                    Kick
                  </Button>
                )}
                {/* Topic admin actions: Kick & Delete */}
                {isTopicAdmin && senderId && senderName && onTopicAdminKick && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      onTopicAdminKick(senderId, senderName);
                      setShowActions(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <UserMinus className="h-4 w-4" />
                    Kick
                  </Button>
                )}
                {isTopicAdmin && onTopicAdminDelete && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      try {
                        await onTopicAdminDelete(messageId);
                      } catch (error) {
                        console.error("Failed to delete:", error);
                      }
                      setShowActions(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                )}
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowActions(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </EditingContext.Provider>
  );
}

/**
 * Inline edit component - renders inside the message bubble when editing
 * Use this inside the message content area, checking useEditing() context
 */
export function InlineEditInput() {
  const editing = useEditing();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing?.isEditing && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
        // Move cursor to end
        const len = textareaRef.current?.value.length || 0;
        textareaRef.current?.setSelectionRange(len, len);
        // Auto-resize
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
      }, 50);
    }
  }, [editing?.isEditing]);

  if (!editing || !editing.isEditing) return null;

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    editing.setEditContent(e.target.value);
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      editing.onSave();
    } else if (e.key === "Escape") {
      editing.onCancel();
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        value={editing.editContent}
        onChange={handleTextareaChange}
        onKeyDown={handleKeyDown}
        className="min-h-[60px] text-[15px] leading-relaxed resize-none bg-transparent border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        disabled={editing.isSubmitting}
        placeholder="Edit message..."
        rows={1}
      />
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/50">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={editing.onCancel}
          disabled={editing.isSubmitting}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={editing.onSave}
          disabled={editing.isSubmitting}
        >
          {editing.isSubmitting ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Check className="h-3 w-3 mr-1" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}

/**
 * Displays a deleted message placeholder
 */
export function DeletedMessage() {
  return (
    <span className="text-muted-foreground italic text-sm">
      Message deleted
    </span>
  );
}

/**
 * Displays the edited indicator
 */
export function EditedIndicator() {
  return (
    <span className="text-[10px] text-muted-foreground ml-1">(edited)</span>
  );
}

// Keep old export for backwards compatibility
export const MessageContextMenu = MessageWrapper;
