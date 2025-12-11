import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Plus, Search, X, Tag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const MAX_TAGS = 20;

interface TagPickerDialogProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  disabled?: boolean;
}

export function TagPickerDialog({
  selectedTags,
  onTagsChange,
  disabled,
}: TagPickerDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [localSelected, setLocalSelected] = useState<string[]>([]);

  // Sync localSelected with selectedTags when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLocalSelected([...selectedTags]);
      setSearchQuery("");
    }
  }, [isOpen, selectedTags]);

  // Fetch all unique tags from all profiles
  const { data: allTags = [], isLoading } = useQuery({
    queryKey: ["all-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("tags");

      if (error) {
        console.error("Error fetching tags:", error);
        return [];
      }

      // Flatten, dedupe, sort alphabetically
      const tags = new Set<string>();
      data?.forEach((p) => p.tags?.forEach((t: string) => tags.add(t)));
      return Array.from(tags).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );
    },
    staleTime: 60000, // Cache for 1 minute
  });

  // Filter tags based on search query
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return allTags;
    const query = searchQuery.toLowerCase().trim();
    return allTags.filter((tag) =>
      tag.toLowerCase().includes(query)
    );
  }, [allTags, searchQuery]);

  // Check if the search query exactly matches an existing tag (case insensitive)
  const exactMatchExists = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return allTags.some((tag) => tag.toLowerCase() === query) ||
           localSelected.some((tag) => tag.toLowerCase() === query);
  }, [allTags, localSelected, searchQuery]);

  // Check if we can add more tags
  const canAddMore = localSelected.length < MAX_TAGS;

  const toggleTag = (tag: string) => {
    if (localSelected.includes(tag)) {
      setLocalSelected(localSelected.filter((t) => t !== tag));
    } else if (canAddMore) {
      setLocalSelected([...localSelected, tag]);
    }
  };

  const addNewTag = () => {
    const newTag = searchQuery.trim();
    if (newTag && !exactMatchExists && canAddMore) {
      setLocalSelected([...localSelected, newTag]);
      setSearchQuery("");
    }
  };

  const removeTag = (tag: string) => {
    setLocalSelected(localSelected.filter((t) => t !== tag));
  };

  const handleSave = () => {
    onTagsChange(localSelected);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start text-muted-foreground"
          disabled={disabled}
        >
          <Tag className="h-4 w-4 mr-2" />
          {selectedTags.length > 0
            ? `${selectedTags.length} tag${selectedTags.length === 1 ? "" : "s"} selected`
            : "Add Tags"}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md mx-4 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Add Specialty Tags
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search or add new tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (searchQuery.trim() && !exactMatchExists && canAddMore) {
                    addNewTag();
                  }
                }
              }}
            />
          </div>

          {/* Selected tags */}
          {localSelected.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Selected ({localSelected.length}/{MAX_TAGS}):
              </p>
              <div className="flex flex-wrap gap-2">
                {localSelected.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-primary/10 text-primary border-primary/20 px-3 py-1 pr-2 flex items-center gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:bg-primary/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Limit warning */}
          {!canAddMore && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Maximum {MAX_TAGS} tags reached
            </p>
          )}

          {/* Add new tag option */}
          {searchQuery.trim() && !exactMatchExists && canAddMore && (
            <button
              type="button"
              onClick={addNewTag}
              className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 hover:bg-primary/10 text-primary transition-colors text-left"
            >
              <Plus className="h-4 w-4" />
              <span>Add "{searchQuery.trim()}" as new tag</span>
            </button>
          )}

          {/* Available tags list */}
          <div className="flex-1 min-h-0">
            <p className="text-sm text-muted-foreground mb-2">
              {searchQuery.trim() ? "Matching tags:" : "Available tags:"}
            </p>
            <ScrollArea className="h-[200px] border rounded-lg">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">Loading tags...</p>
                </div>
              ) : filteredTags.length === 0 && !searchQuery.trim() ? (
                <div className="flex items-center justify-center h-full p-4">
                  <p className="text-sm text-muted-foreground text-center">
                    No tags yet. Be the first to add one!
                  </p>
                </div>
              ) : filteredTags.length === 0 ? (
                <div className="flex items-center justify-center h-full p-4">
                  <p className="text-sm text-muted-foreground text-center">
                    No matching tags found.
                    {canAddMore && " Add it as a new tag above!"}
                  </p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredTags.map((tag) => {
                    const isSelected = localSelected.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        disabled={!isSelected && !canAddMore}
                        className={cn(
                          "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                          isSelected
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted",
                          !isSelected && !canAddMore && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded border flex items-center justify-center",
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/30"
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span>{tag}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="flex-1"
          >
            Save Tags
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
