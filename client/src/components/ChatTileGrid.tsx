import { Plus } from "lucide-react";
import { useRef, useCallback } from "react";

interface TileItem {
  id: string;
  emoji?: string | string[];
  name: string;
  subtitle?: string; // Small text under the name (e.g., member names)
  unreadCount?: number;
  isPending?: boolean;
  isCreate?: boolean;
  isAdmin?: boolean;
}

interface ChatTileGridProps {
  items: TileItem[];
  onSelect: (id: string) => void;
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onLongPress?: (id: string) => void;
  showCreate?: boolean;
  onCreateClick?: () => void;
}

export default function ChatTileGrid({
  items,
  onSelect,
  onAccept,
  onDecline,
  onLongPress,
  showCreate,
  onCreateClick,
}: ChatTileGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4">
      {/* Create New Tile */}
      {showCreate && (
        <button
          onClick={onCreateClick}
          className="aspect-square rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/10 hover:scale-105 transition-all cursor-pointer group"
        >
          <Plus className="h-8 w-8 text-primary/60 group-hover:text-primary transition-colors" />
          <span className="text-sm font-medium text-primary/60 group-hover:text-primary transition-colors">
            Create
          </span>
        </button>
      )}

      {/* Tile Items */}
      {items.map((item) => (
        <TileButton
          key={item.id}
          item={item}
          onSelect={onSelect}
          onAccept={onAccept}
          onDecline={onDecline}
          onLongPress={onLongPress}
        />
      ))}
    </div>
  );
}

interface TileButtonProps {
  item: TileItem;
  onSelect: (id: string) => void;
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onLongPress?: (id: string) => void;
}

function TileButton({ item, onSelect, onAccept, onDecline, onLongPress }: TileButtonProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const handleTouchStart = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (onLongPress) {
        // Vibrate if available (mobile)
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
        onLongPress(item.id);
      }
    }, 500); // 500ms for long press
  }, [item.id, onLongPress]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    // Don't trigger click if it was a long press
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }
    onSelect(item.id);
  }, [item.id, onSelect]);

  // Context menu for desktop right-click (acts like long press)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (onLongPress) {
      e.preventDefault();
      onLongPress(item.id);
    }
  }, [item.id, onLongPress]);

  if (item.isPending) {
    return (
      <div className="relative">
        <div className="aspect-square rounded-xl border border-primary/30 bg-primary/5 flex flex-col items-center justify-center p-3 relative overflow-hidden">
          {/* Emoji Display */}
          <div className="text-2xl sm:text-3xl mb-1">
            {Array.isArray(item.emoji)
              ? item.emoji.join("")
              : item.emoji || "💬"}
          </div>
          <span className="text-xs sm:text-sm font-medium text-center line-clamp-1 mb-2 text-muted-foreground">
            {item.name}
          </span>
          {/* Accept/Decline Buttons */}
          <div className="flex gap-2 w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAccept?.(item.id);
              }}
              className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDecline?.(item.id);
              }}
              className="flex-1 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={handleContextMenu}
        className="w-full aspect-square rounded-xl border border-border bg-card flex flex-col items-center justify-center gap-1 p-2 hover:scale-105 hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer relative select-none"
      >
        {/* Emoji Display */}
        <div className="text-3xl sm:text-4xl">
          {Array.isArray(item.emoji)
            ? item.emoji.join("")
            : item.emoji || "💬"}
        </div>
        {/* Title/Name */}
        {item.name && (
          <span className="text-sm font-medium text-center px-1 line-clamp-1">
            {item.name}
          </span>
        )}
        {/* Subtitle - member names */}
        {item.subtitle && (
          <span className="text-[10px] text-muted-foreground text-center px-1 line-clamp-1">
            {item.subtitle}
          </span>
        )}
        {/* Unread Badge - inside tile, bottom right */}
        {typeof item.unreadCount === "number" && item.unreadCount > 0 && (
          <div className="absolute bottom-2 right-2 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {item.unreadCount > 99 ? "99+" : item.unreadCount}
          </div>
        )}
      </button>
    </div>
  );
}
