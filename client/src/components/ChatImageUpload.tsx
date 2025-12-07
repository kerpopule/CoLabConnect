import { useState, useRef } from "react";
import { Image, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ChatImageUploadProps {
  onImageUploaded: (imageUrl: string) => void;
  disabled?: boolean;
}

// Compress image before upload
async function compressImage(file: File, maxSize: number = 1200, quality: number = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        // Scale down if larger than maxSize
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to compress image"));
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function ChatImageUpload({ onImageUploaded, disabled }: ChatImageUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Invalid file",
        description: "Please select an image file.",
      });
      return;
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Maximum file size is 10MB.",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Compress image
      const compressedBlob = await compressImage(file);

      // Create preview
      const previewUrl = URL.createObjectURL(compressedBlob);
      setPreview(previewUrl);

      // Generate unique filename
      const fileName = `chat/${user.id}/${Date.now()}.jpg`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("chat-images")
        .upload(fileName, compressedBlob, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        // If bucket doesn't exist, try avatars bucket as fallback
        if (uploadError.message.includes("not found")) {
          const fallbackFileName = `chat-${user.id}-${Date.now()}.jpg`;
          const { error: fallbackError } = await supabase.storage
            .from("avatars")
            .upload(fallbackFileName, compressedBlob, {
              contentType: "image/jpeg",
              upsert: false,
            });

          if (fallbackError) throw fallbackError;

          const { data: { publicUrl } } = supabase.storage
            .from("avatars")
            .getPublicUrl(fallbackFileName);

          onImageUploaded(publicUrl);
          setPreview(null);
          return;
        }
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("chat-images")
        .getPublicUrl(fileName);

      onImageUploaded(publicUrl);
      setPreview(null);
    } catch (error: any) {
      console.error("Image upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload image.",
      });
      setPreview(null);
    } finally {
      setIsUploading(false);
    }
  };

  const cancelUpload = () => {
    setPreview(null);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="Upload preview"
            className="w-10 h-10 rounded object-cover"
          />
          {isUploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
              <Loader2 className="h-4 w-4 text-white animate-spin" />
            </div>
          ) : (
            <button
              onClick={cancelUpload}
              className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Image className="h-5 w-5" />
          )}
        </Button>
      )}
    </div>
  );
}

// Display image in message content - responsive sizing based on device
export function ChatImage({ src, alt }: { src: string; alt?: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="w-full h-24 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs">
        Image unavailable
      </div>
    );
  }

  return (
    <div className="relative">
      {isLoading && (
        <div className="w-full h-32 flex items-center justify-center bg-muted/50 rounded-lg">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <img
          src={src}
          alt={alt || "Shared image"}
          className={`w-full max-w-[200px] sm:max-w-[280px] md:max-w-[320px] rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity ${
            isLoading ? "hidden" : "block"
          }`}
          style={{ maxHeight: "200px" }}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      </a>
    </div>
  );
}

// Check if a message content is an image URL
export function isImageUrl(content: string): boolean {
  // Check if it's a Supabase storage URL for images
  if (content.includes("supabase.co/storage") && (content.includes("/chat-images/") || content.includes("/avatars/chat-"))) {
    return true;
  }

  // Check common image extensions
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const lowerContent = content.toLowerCase();

  try {
    const url = new URL(content);
    return imageExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext));
  } catch {
    return false;
  }
}
