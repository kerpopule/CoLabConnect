import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Gif {
  id: string;
  title: string;
  url: string;
  preview: string;
}

interface GifResponse {
  gifs: Gif[];
  next: string | null;
}

interface GifPickerProps {
  onGifSelect: (gifUrl: string) => void;
  disabled?: boolean;
  buttonClassName?: string;
}

export function GifPicker({ onGifSelect, disabled, buttonClassName }: GifPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Featured GIFs (shown when no search query)
  const { data: featuredData, isLoading: loadingFeatured, isError: featuredError, refetch: refetchFeatured } = useQuery<GifResponse>({
    queryKey: ["tenor", "featured"],
    queryFn: async () => {
      const res = await fetch("/api/tenor/featured?limit=20");
      if (!res.ok) throw new Error("Failed to load GIFs");
      return res.json();
    },
    enabled: isOpen && !debouncedQuery,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Search results
  const { data: searchData, isLoading: loadingSearch, isError: searchError, refetch: refetchSearch } = useQuery<GifResponse>({
    queryKey: ["tenor", "search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`/api/tenor/search?q=${encodeURIComponent(debouncedQuery)}&limit=20`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: isOpen && !!debouncedQuery,
    staleTime: 2 * 60 * 1000,
  });

  const isLoading = debouncedQuery ? loadingSearch : loadingFeatured;
  const isError = debouncedQuery ? searchError : featuredError;
  const gifs = debouncedQuery ? (searchData?.gifs || []) : (featuredData?.gifs || []);
  const refetch = debouncedQuery ? refetchSearch : refetchFeatured;

  const handleGifClick = (gifUrl: string) => {
    onGifSelect(gifUrl);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 rounded-full transition-colors h-12 w-12 text-muted-foreground hover:text-primary",
            buttonClassName
          )}
          disabled={disabled}
          title="Send GIF"
        >
          <span className="text-xs font-bold">GIF</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[320px] sm:w-[380px] p-0"
        side="top"
        align="start"
        sideOffset={8}
      >
        {/* Search input */}
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search GIFs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* GIF grid */}
        <ScrollArea className="h-[280px] sm:h-[320px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
              <p className="text-sm text-muted-foreground">Failed to load GIFs</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : gifs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                {debouncedQuery ? "No GIFs found" : "Loading..."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 p-2">
              {gifs.map((gif) => (
                <GifThumbnail
                  key={gif.id}
                  gif={gif}
                  onClick={() => handleGifClick(gif.url)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Tenor attribution (required by API terms) */}
        <div className="p-2 border-t text-center">
          <span className="text-xs text-muted-foreground">
            Powered by Tenor
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GifThumbnail({
  gif,
  onClick,
}: {
  gif: Gif;
  onClick: () => void;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all cursor-pointer"
      title={gif.title || "GIF"}
    >
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        </div>
      )}
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Error</span>
        </div>
      ) : (
        <img
          src={gif.preview}
          alt={gif.title || "GIF"}
          className={cn(
            "w-full h-full object-cover transition-opacity",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          loading="lazy"
        />
      )}
    </button>
  );
}
