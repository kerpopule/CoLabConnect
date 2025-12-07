import { useState, useRef, useEffect } from "react";
import { Edit2, Trash2, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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

interface MessageContextMenuProps {
  children: React.ReactNode;
  messageId: string;
  content: string;
  isOwnMessage: boolean;
  isDeleted: boolean;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
}

export function MessageContextMenu({
  children,
  messageId,
  content,
  isOwnMessage,
  isDeleted,
  onEdit,
  onDelete,
}: MessageContextMenuProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Don't show menu for deleted messages or others' messages
  if (!isOwnMessage || isDeleted) {
    return <>{children}</>;
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

  // If editing, show the edit input instead of the message
  if (isEditing) {
    return (
      <div className="flex items-center gap-2 w-full">
        <Input
          ref={inputRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 text-sm"
          disabled={isSubmitting}
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
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-40">
          <ContextMenuItem
            onClick={() => {
              setEditContent(content);
              setIsEditing(true);
            }}
            className="flex items-center gap-2"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="flex items-center gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

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
