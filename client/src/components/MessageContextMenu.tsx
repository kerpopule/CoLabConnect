import { useState, useRef, useEffect } from "react";
import { Edit2, Trash2, X, Check, Loader2, Reply, VolumeX, Volume2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface MessageActionsProps {
  messageId: string;
  content: string;
  isOwnMessage: boolean;
  isDeleted: boolean;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onEditingChange?: (isEditing: boolean) => void;
}

/**
 * Message actions dropdown - triggered by long press on mobile or right-click on desktop
 */
export function MessageActions({
  messageId,
  content,
  isOwnMessage,
  isDeleted,
  onEdit,
  onDelete,
  onEditingChange,
}: MessageActionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  // Don't show for deleted messages or others' messages
  if (!isOwnMessage || isDeleted) {
    return null;
  }

  const handleEdit = async () => {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEdit();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditContent(content);
    }
  };

  // Edit mode UI
  if (isEditing) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <Input
          ref={inputRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 text-sm h-8"
          disabled={isSubmitting}
          placeholder="Edit message..."
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={handleEdit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4 text-green-500" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            setIsEditing(false);
            setEditContent(content);
          }}
          disabled={isSubmitting}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    );
  }

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
          <DropdownMenuItem
            onClick={() => {
              setEditContent(content);
              setIsEditing(true);
              setShowMenu(false);
            }}
            className="flex items-center gap-2"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
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
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

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

  return (
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
            // Own message actions: Edit & Delete
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowActions(false);
                  setIsEditing(true);
                }}
                className="flex items-center gap-2"
              >
                <Edit2 className="h-4 w-4" />
                Edit
              </Button>
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

      {/* Edit input below the message */}
      {isEditing && (
        <EditInput
          content={content}
          onSave={async (newContent) => {
            await onEdit(messageId, newContent);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      )}
    </div>
  );
}

/**
 * Edit input component
 */
function EditInput({
  content,
  onSave,
  onCancel,
}: {
  content: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(content);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, []);

  const handleSave = async () => {
    if (!value.trim() || value === content) {
      onCancel();
      return;
    }
    setIsSubmitting(true);
    try {
      await onSave(value.trim());
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        className="flex-1 text-sm h-8"
        disabled={isSubmitting}
        placeholder="Edit message..."
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        onClick={handleSave}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4 text-green-500" />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        onClick={onCancel}
        disabled={isSubmitting}
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </Button>
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
