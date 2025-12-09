import { useState, useEffect } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

interface LinkPreviewProps {
  url: string;
}

interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

// URL regex for detecting links in text
const URL_REGEX = /https?:\/\/[^\s<>\"]+/gi;

// Extract URLs from text
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

// Parse message content and return parts with link detection
export function parseMessageWithLinks(content: string): { type: 'text' | 'link'; content: string }[] {
  const parts: { type: 'text' | 'link'; content: string }[] = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_REGEX);
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    // Add the URL
    parts.push({ type: 'link', content: match[0] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return parts;
}

// Cache for link metadata to avoid refetching
const metadataCache = new Map<string, LinkMetadata | null>();

export function LinkPreview({ url }: LinkPreviewProps) {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchMetadata = async () => {
      // Check cache first
      if (metadataCache.has(url)) {
        setMetadata(metadataCache.get(url) || null);
        setLoading(false);
        return;
      }

      try {
        // Use our backend proxy to fetch metadata
        const response = await fetch("/api/link-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });

        if (!response.ok) throw new Error("Failed to fetch metadata");

        const data = await response.json();
        metadataCache.set(url, data);
        setMetadata(data);
      } catch (err) {
        console.error("Link preview error:", err);
        metadataCache.set(url, null);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [url]);

  if (loading) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-border animate-pulse">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading preview...
        </div>
      </div>
    );
  }

  if (error || !metadata) {
    // Just show a simple link if we couldn't get metadata
    return null;
  }

  const displayUrl = new URL(url).hostname.replace("www.", "");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden group"
    >
      {metadata.image && (
        <div className="w-full h-32 overflow-hidden bg-muted">
          <img
            src={metadata.image}
            alt={metadata.title || "Preview"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {metadata.favicon && (
            <img
              src={metadata.favicon}
              alt=""
              className="w-4 h-4 rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <span>{metadata.siteName || displayUrl}</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {metadata.title && (
          <h4 className="font-medium text-sm text-foreground line-clamp-2 mb-1">
            {metadata.title}
          </h4>
        )}
        {metadata.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {metadata.description}
          </p>
        )}
      </div>
    </a>
  );
}

// Character limit for expandable messages
const MESSAGE_CHAR_LIMIT = 240;

// Message content with inline links and previews
export function MessageContent({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const parts = parseMessageWithLinks(content);
  const urls = extractUrls(content);
  const firstUrl = urls[0]; // Only show preview for the first URL

  const isLongMessage = content.length > MESSAGE_CHAR_LIMIT;
  const displayContent = isLongMessage && !isExpanded
    ? content.slice(0, MESSAGE_CHAR_LIMIT)
    : content;
  const displayParts = parseMessageWithLinks(displayContent);

  // Close expanded message when clicking outside
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't collapse if clicking on a link inside the message
      if (target.tagName === 'A') return;
      setIsExpanded(false);
    };

    // Add a small delay to prevent immediate collapse
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isExpanded]);

  return (
    <div>
      <span className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        {displayParts.map((part, index) =>
          part.type === 'link' ? (
            <a
              key={index}
              href={part.content}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline break-all"
            >
              {part.content}
            </a>
          ) : (
            <span key={index}>{part.content}</span>
          )
        )}
        {isLongMessage && !isExpanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
            className="text-primary hover:text-primary/80 font-medium ml-1 inline"
          >
            ...more
          </button>
        )}
      </span>
      {firstUrl && <LinkPreview url={firstUrl} />}
    </div>
  );
}
