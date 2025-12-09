import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Linkedin,
  Instagram,
  Github,
  Youtube,
  Facebook,
  Globe,
  Plus,
  X,
  GripVertical,
  Music2,
  Palette,
} from "lucide-react";
import { FaXTwitter, FaDribbble } from "react-icons/fa6";
import {
  SOCIAL_PLATFORMS,
  SocialLink,
  SocialPlatformType,
  generateId,
  normalizeUrl,
} from "@/lib/utils";

// Icon mapping
const IconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Linkedin,
  Twitter: FaXTwitter,
  Instagram,
  Github,
  Youtube,
  Music2,
  Facebook,
  Dribbble: FaDribbble,
  Palette,
  Globe,
};

interface SocialLinksEditorProps {
  links: SocialLink[];
  onChange: (links: SocialLink[]) => void;
  disabled?: boolean;
}

export function SocialLinksEditor({ links, onChange, disabled }: SocialLinksEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const touchStartY = useRef<number>(0);
  const touchCurrentIndex = useRef<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleAddLink = (type: SocialPlatformType) => {
    const newLink: SocialLink = {
      id: generateId(),
      type,
      url: "",
      order: links.length,
    };
    onChange([...links, newLink]);
    setIsOpen(false);
  };

  const handleRemoveLink = (id: string) => {
    const newLinks = links
      .filter((link) => link.id !== id)
      .map((link, index) => ({ ...link, order: index }));
    onChange(newLinks);
  };

  const handleUpdateUrl = (id: string, url: string) => {
    onChange(
      links.map((link) =>
        link.id === id ? { ...link, url } : link
      )
    );
  };

  const handleUrlBlur = (id: string, url: string) => {
    // Normalize URL when user leaves the field
    if (url.trim()) {
      const normalizedUrl = normalizeUrl(url);
      onChange(
        links.map((link) =>
          link.id === id ? { ...link, url: normalizedUrl } : link
        )
      );
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newLinks = [...links];
    const draggedItem = newLinks[draggedIndex];
    newLinks.splice(draggedIndex, 1);
    newLinks.splice(index, 0, draggedItem);

    // Update order values
    const reordered = newLinks.map((link, i) => ({ ...link, order: i }));
    onChange(reordered);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Touch event handlers for mobile drag and drop
  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    if (disabled) return;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentIndex.current = index;
    setDraggedIndex(index);

    // Vibrate for haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchCurrentIndex.current === null || disabled) return;

    const touchY = e.touches[0].clientY;

    // Find which item we're over based on touch position
    for (let i = 0; i < itemRefs.current.length; i++) {
      const ref = itemRefs.current[i];
      if (ref) {
        const rect = ref.getBoundingClientRect();
        if (touchY >= rect.top && touchY <= rect.bottom && i !== touchCurrentIndex.current) {
          // Reorder items
          const newLinks = [...links];
          const draggedItem = newLinks[touchCurrentIndex.current];
          newLinks.splice(touchCurrentIndex.current, 1);
          newLinks.splice(i, 0, draggedItem);

          // Update order values
          const reordered = newLinks.map((link, idx) => ({ ...link, order: idx }));
          onChange(reordered);
          touchCurrentIndex.current = i;
          setDraggedIndex(i);

          // Small vibration on reorder
          if (navigator.vibrate) {
            navigator.vibrate(30);
          }
          break;
        }
      }
    }
  };

  const handleTouchEnd = () => {
    touchCurrentIndex.current = null;
    setDraggedIndex(null);
  };

  // Get platforms that haven't been added yet (except website which can have multiple)
  const availablePlatforms = Object.entries(SOCIAL_PLATFORMS).filter(
    ([type]) =>
      type === "website" || !links.some((link) => link.type === type)
  );

  const getIcon = (iconName: string) => {
    const Icon = IconMap[iconName];
    return Icon || Globe;
  };

  return (
    <div className="space-y-3">
      {/* Existing links */}
      {links
        .sort((a, b) => a.order - b.order)
        .map((link, index) => {
          const platform = SOCIAL_PLATFORMS[link.type];
          const Icon = getIcon(platform.icon);

          return (
            <div
              key={link.id}
              ref={(el) => (itemRefs.current[index] = el)}
              draggable={!disabled}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onTouchStart={(e) => handleTouchStart(e, index)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={`flex items-center gap-2 touch-none ${
                draggedIndex === index ? "opacity-50 scale-105" : ""
              } transition-transform`}
            >
              <div className="cursor-grab active:cursor-grabbing p-2 text-muted-foreground hover:text-foreground">
                <GripVertical className="h-5 w-5" />
              </div>
              <div className="relative flex-1">
                <Icon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 pr-9 bg-muted/30"
                  placeholder={platform.placeholder}
                  value={link.url}
                  onChange={(e) => handleUpdateUrl(link.id, e.target.value)}
                  onBlur={(e) => handleUrlBlur(link.id, e.target.value)}
                  disabled={disabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveLink(link.id)}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}

      {/* Add new link button */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed min-h-[48px]"
            disabled={disabled}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Social Link
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Social Link</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-4">
            {availablePlatforms.map(([type, platform]) => {
              const Icon = getIcon(platform.icon);
              return (
                <Button
                  key={type}
                  type="button"
                  variant="outline"
                  className="flex flex-col items-center gap-2 h-auto py-4 min-h-[72px] hover:bg-primary/10 hover:border-primary"
                  onClick={() => handleAddLink(type as SocialPlatformType)}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-xs">{platform.name}</span>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {links.length > 1 && (
        <p className="text-xs text-muted-foreground text-center">
          Drag to reorder. Top links appear on your profile card.
        </p>
      )}
    </div>
  );
}

// Component to display social links (for profile views)
interface SocialLinksDisplayProps {
  links: SocialLink[];
  maxDisplay?: number;
  size?: "sm" | "md";
  layout?: "inline" | "grid"; // grid displays 3 per row
}

export function SocialLinksDisplay({
  links,
  maxDisplay,
  size = "md",
  layout = "inline",
}: SocialLinksDisplayProps) {
  const sortedLinks = [...links].sort((a, b) => a.order - b.order);
  const displayLinks = maxDisplay ? sortedLinks.slice(0, maxDisplay) : sortedLinks;
  const remainingCount = maxDisplay ? Math.max(0, sortedLinks.length - maxDisplay) : 0;

  const getIcon = (iconName: string) => {
    const Icon = IconMap[iconName];
    return Icon || Globe;
  };

  const sizeClasses = size === "sm"
    ? "h-8 w-8"
    : "h-10 w-10";

  const iconClasses = size === "sm"
    ? "h-4 w-4"
    : "h-5 w-5";

  if (displayLinks.length === 0) return null;

  // Mobile: always horizontal flex, Desktop with grid layout: 3 columns
  const containerClasses = layout === "grid"
    ? "flex gap-2 flex-wrap md:grid md:grid-cols-3 md:w-fit"
    : "flex gap-2 flex-wrap";

  return (
    <div className={containerClasses}>
      {displayLinks.map((link) => {
        if (!link.url) return null;
        const platform = SOCIAL_PLATFORMS[link.type];
        const Icon = getIcon(platform.icon);

        return (
          <Button
            key={link.id}
            variant="outline"
            size="icon"
            className={`rounded-full ${sizeClasses} hover:scale-110 hover:bg-primary/10 hover:border-primary hover:text-primary transition-all`}
            onClick={() => window.open(link.url, "_blank")}
          >
            <Icon className={iconClasses} />
          </Button>
        );
      })}
      {remainingCount > 0 && (
        <Button
          variant="outline"
          size="icon"
          className={`rounded-full ${sizeClasses}`}
          disabled
        >
          <span className="text-xs font-medium">+{remainingCount}</span>
        </Button>
      )}
    </div>
  );
}
