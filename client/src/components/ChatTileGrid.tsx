import { Plus, GripVertical } from "lucide-react";
import { useRef, useCallback, useState, useEffect } from "react";

interface TileItem {
  id: string;
  emoji?: string | string[];
  name: string;
  subtitle?: string; // Small text under the name (e.g., member names)
  unreadCount?: number;
  isPending?: boolean;
  isCreate?: boolean;
  isAdmin?: boolean;
  isWide?: boolean; // Spans 2 columns on mobile
  displayOrder?: number;
}

interface ChatTileGridProps {
  items: TileItem[];
  onSelect: (id: string) => void;
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onLongPress?: (id: string) => void;
  showCreate?: boolean;
  onCreateClick?: () => void;
  // Reordering support
  isReordering?: boolean;
  onReorder?: (reorderedItems: { id: string; displayOrder: number }[]) => void;
  onReorderCancel?: () => void;
  onReorderSave?: () => void;
}

export default function ChatTileGrid({
  items,
  onSelect,
  onAccept,
  onDecline,
  onLongPress,
  showCreate,
  onCreateClick,
  isReordering,
  onReorder,
  onReorderCancel,
  onReorderSave,
}: ChatTileGridProps) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<TileItem[]>(items);
  // Track previous reordering state to detect when it ends
  const wasReorderingRef = useRef(isReordering);
  // Track if a save operation just completed (to skip sync with stale props)
  const skipNextSyncRef = useRef(false);

  // Detect when reordering ends
  useEffect(() => {
    if (wasReorderingRef.current && !isReordering) {
      // Reordering just ended - skip the next props sync because localItems already has correct order
      console.log('[ChatTileGrid] Reordering ended, skipping next sync');
      skipNextSyncRef.current = true;
    }
    wasReorderingRef.current = isReordering;
  }, [isReordering]);

  // Sync with props, but skip once after reordering ends
  useEffect(() => {
    if (isReordering) return; // Don't sync during reordering

    if (skipNextSyncRef.current) {
      console.log('[ChatTileGrid] Skipping sync, using local order:', localItems.map(i => i.name));
      skipNextSyncRef.current = false;
      return;
    }

    console.log('[ChatTileGrid] Syncing with props:', items.map(i => i.name));
    setLocalItems(items);
  }, [items, isReordering]);

  const handleDragStart = useCallback((e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", itemId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedItem && draggedItem !== itemId) {
      setDragOverItem(itemId);
    }
  }, [draggedItem]);

  const handleDragLeave = useCallback(() => {
    setDragOverItem(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverItem(null);

    if (!draggedItem || draggedItem === targetId) {
      setDraggedItem(null);
      return;
    }

    const newItems = [...localItems];
    const draggedIndex = newItems.findIndex(item => item.id === draggedItem);
    const targetIndex = newItems.findIndex(item => item.id === targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [removed] = newItems.splice(draggedIndex, 1);
      newItems.splice(targetIndex, 0, removed);

      // Update display order
      const reorderedItems = newItems.map((item, index) => ({
        id: item.id,
        displayOrder: index,
      }));

      setLocalItems(newItems);
      onReorder?.(reorderedItems);
    }

    setDraggedItem(null);
  }, [draggedItem, localItems, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverItem(null);
  }, []);

  // Touch-based reordering for mobile
  const touchStartPos = useRef<{ x: number; y: number; itemId: string } | null>(null);
  const touchMoveItem = useRef<string | null>(null);

  const handleTouchStartReorder = useCallback((e: React.TouchEvent, itemId: string) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY, itemId };
    touchMoveItem.current = itemId;
    setDraggedItem(itemId);
  }, []);

  const handleTouchMoveReorder = useCallback((e: React.TouchEvent) => {
    if (!touchMoveItem.current) return;

    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const tileElement = element?.closest('[data-tile-id]');

    if (tileElement) {
      const targetId = tileElement.getAttribute('data-tile-id');
      if (targetId && targetId !== touchMoveItem.current) {
        setDragOverItem(targetId);
      }
    }
  }, []);

  const handleTouchEndReorder = useCallback((e: React.TouchEvent) => {
    if (!touchMoveItem.current || !dragOverItem) {
      setDraggedItem(null);
      setDragOverItem(null);
      touchMoveItem.current = null;
      touchStartPos.current = null;
      return;
    }

    const newItems = [...localItems];
    const draggedIndex = newItems.findIndex(item => item.id === touchMoveItem.current);
    const targetIndex = newItems.findIndex(item => item.id === dragOverItem);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [removed] = newItems.splice(draggedIndex, 1);
      newItems.splice(targetIndex, 0, removed);

      const reorderedItems = newItems.map((item, index) => ({
        id: item.id,
        displayOrder: index,
      }));

      setLocalItems(newItems);
      onReorder?.(reorderedItems);
    }

    setDraggedItem(null);
    setDragOverItem(null);
    touchMoveItem.current = null;
    touchStartPos.current = null;
  }, [dragOverItem, localItems, onReorder]);

  // Always use localItems - it's kept in sync with props except right after reordering
  const displayItems = localItems;

  return (
    <div className="relative">
      {/* Reorder Controls */}
      {isReordering && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b p-3 flex items-center justify-between">
          <span className="text-sm font-medium">Drag tiles to reorder</span>
          <div className="flex gap-2">
            <button
              onClick={onReorderCancel}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onReorderSave}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Save Order
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4">
        {/* Tile Items */}
        {displayItems.map((item) => (
          <TileButton
            key={item.id}
            item={item}
            onSelect={onSelect}
            onAccept={onAccept}
            onDecline={onDecline}
            onLongPress={onLongPress}
            isReordering={isReordering}
            isDragging={draggedItem === item.id}
            isDragOver={dragOverItem === item.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onTouchStartReorder={handleTouchStartReorder}
            onTouchMoveReorder={handleTouchMoveReorder}
            onTouchEndReorder={handleTouchEndReorder}
          />
        ))}

        {/* Create New Tile - at the end */}
        {showCreate && !isReordering && (
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
      </div>
    </div>
  );
}

interface TileButtonProps {
  item: TileItem;
  onSelect: (id: string) => void;
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onLongPress?: (id: string) => void;
  // Reordering props
  isReordering?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent, itemId: string) => void;
  onDragOver?: (e: React.DragEvent, itemId: string) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent, itemId: string) => void;
  onDragEnd?: () => void;
  onTouchStartReorder?: (e: React.TouchEvent, itemId: string) => void;
  onTouchMoveReorder?: (e: React.TouchEvent) => void;
  onTouchEndReorder?: (e: React.TouchEvent) => void;
}

function TileButton({
  item,
  onSelect,
  onAccept,
  onDecline,
  onLongPress,
  isReordering,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onTouchStartReorder,
  onTouchMoveReorder,
  onTouchEndReorder,
}: TileButtonProps) {
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

  // Wide tile spans 2 columns on mobile
  const wideClass = item.isWide ? "col-span-2 sm:col-span-1" : "";

  // Reordering mode: draggable tiles with visual feedback
  if (isReordering) {
    return (
      <div
        className={`relative ${wideClass}`}
        data-tile-id={item.id}
        draggable
        onDragStart={(e) => onDragStart?.(e, item.id)}
        onDragOver={(e) => onDragOver?.(e, item.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop?.(e, item.id)}
        onDragEnd={onDragEnd}
        onTouchStart={(e) => onTouchStartReorder?.(e, item.id)}
        onTouchMove={onTouchMoveReorder}
        onTouchEnd={onTouchEndReorder}
      >
        <div
          className={`w-full rounded-xl border-2 bg-card flex flex-col items-center justify-center gap-1 p-2 relative select-none aspect-square transition-all ${
            isDragging
              ? "opacity-50 border-primary scale-95"
              : isDragOver
              ? "border-primary bg-primary/10 scale-105"
              : "border-dashed border-primary/50 cursor-grab active:cursor-grabbing"
          }`}
        >
          {/* Drag Handle */}
          <div className="absolute top-1 right-1">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          {/* Emoji Display */}
          <div className="text-3xl sm:text-4xl">
            {Array.isArray(item.emoji)
              ? item.emoji.join("")
              : item.emoji || "💬"}
          </div>
          {/* Title/Name */}
          {item.name && (
            <span className="font-medium text-center px-1 line-clamp-1 text-sm">
              {item.name}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${wideClass}`} data-tile-id={item.id}>
      <button
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={handleContextMenu}
        className={`w-full rounded-xl border border-border bg-card flex flex-col items-center justify-center gap-1 p-2 hover:scale-105 hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer relative select-none ${
          item.isWide ? "aspect-[2/1] sm:aspect-square" : "aspect-square"
        }`}
      >
        {/* Emoji Display */}
        <div className={item.isWide ? "text-4xl sm:text-4xl" : "text-3xl sm:text-4xl"}>
          {Array.isArray(item.emoji)
            ? item.emoji.join("")
            : item.emoji || "💬"}
        </div>
        {/* Title/Name */}
        {item.name && (
          <span className={`font-medium text-center px-1 line-clamp-1 ${item.isWide ? "text-base" : "text-sm"}`}>
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
