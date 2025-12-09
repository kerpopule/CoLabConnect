import { useState, useRef } from "react";
import { X, Loader2, FileText, Download, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ChatImageUploadProps {
  // New API: just select files for preview
  onImageSelected?: (file: File, preview: string) => void;
  onFileSelected?: (file: File, fileName: string) => void;
  // Legacy API: upload immediately
  onImageUploaded?: (imageUrl: string) => void;
  disabled?: boolean;
  iconSize?: string;
  buttonSize?: string;
  multiple?: boolean;
}

// Max file size: 3MB
const MAX_FILE_SIZE = 3 * 1024 * 1024;

// Check if file is an image based on type OR extension (for iOS compatibility)
function isImageFile(file: File): boolean {
  // Check MIME type first
  if (file.type.startsWith("image/")) {
    return true;
  }
  // Fallback: check file extension (iOS sometimes doesn't set MIME type correctly)
  const ext = file.name.toLowerCase().split('.').pop();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff'].includes(ext || '');
}

// Check if file type is allowed
function isAllowedFile(file: File): boolean {
  // Images are always allowed
  if (isImageFile(file)) return true;

  // Check MIME type for documents
  const allowedMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ];
  if (allowedMimeTypes.includes(file.type)) return true;

  // Fallback: check extension
  const ext = file.name.toLowerCase().split('.').pop();
  return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'].includes(ext || '');
}

// File extensions for accept attribute - simplified for iOS compatibility
const ACCEPT_TYPES = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv";

// Compress image before upload - exported for use in Chat.tsx
export async function compressImage(file: File, maxSize: number = 1200, quality: number = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // For HEIC/HEIF, we need to try a different approach
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        try {
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
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (err) => {
        console.error("[compressImage] Image load error:", err);
        reject(new Error("Failed to load image for compression"));
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => {
      console.error("[compressImage] FileReader error:", err);
      reject(new Error("Failed to read file"));
    };
    reader.readAsDataURL(file);
  });
}

export function ChatImageUpload({
  onImageSelected,
  onFileSelected,
  onImageUploaded,
  disabled,
  iconSize = "h-5 w-5",
  buttonSize = "",
  multiple = true
}: ChatImageUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("[ChatImageUpload] handleFileSelect triggered");

    const fileList = e.target.files;
    console.log("[ChatImageUpload] Files:", fileList?.length, "User:", user?.id);

    if (!fileList || fileList.length === 0) {
      console.log("[ChatImageUpload] No files selected");
      return;
    }

    if (!user) {
      console.error("[ChatImageUpload] No user - cannot process files");
      toast({
        variant: "destructive",
        title: "Not signed in",
        description: "Please sign in to upload files.",
      });
      return;
    }

    // IMPORTANT: Copy files to array BEFORE resetting input
    // Resetting input.value clears the FileList!
    const files = Array.from(fileList);
    console.log("[ChatImageUpload] Copied files to array:", files.length);

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log("[ChatImageUpload] Processing file:", {
        name: file.name,
        type: file.type,
        size: file.size,
        isImage: isImageFile(file)
      });

      const isImage = isImageFile(file);

      // Validate file type
      if (!isAllowedFile(file)) {
        console.log("[ChatImageUpload] File type not allowed:", file.type);
        toast({
          variant: "destructive",
          title: "Unsupported file type",
          description: `Cannot upload "${file.name}". Please select an image, PDF, Word, Excel, or text file.`,
        });
        continue;
      }

      // Max 3MB for files
      if (file.size > MAX_FILE_SIZE) {
        console.log("[ChatImageUpload] File too large:", file.size);
        toast({
          variant: "destructive",
          title: "File too large",
          description: `"${file.name}" is too large. Maximum file size is 3MB.`,
        });
        continue;
      }

      // Handle images with the new API
      if (isImage && onImageSelected) {
        console.log("[ChatImageUpload] Processing image for preview...");
        try {
          // Try to compress image to JPEG for reliable preview
          const compressedBlob = await compressImage(file);
          const compressedFile = new File(
            [compressedBlob],
            file.name.replace(/\.[^.]+$/, '.jpg'),
            { type: 'image/jpeg' }
          );
          const previewUrl = URL.createObjectURL(compressedBlob);
          console.log("[ChatImageUpload] Image compressed successfully, calling onImageSelected");
          onImageSelected(compressedFile, previewUrl);
        } catch (error) {
          console.error("[ChatImageUpload] Compression failed:", error);
          // Fallback: try using original file directly
          try {
            const previewUrl = URL.createObjectURL(file);
            console.log("[ChatImageUpload] Using original file, calling onImageSelected");
            onImageSelected(file, previewUrl);
          } catch (fallbackError) {
            console.error("[ChatImageUpload] Fallback failed:", fallbackError);
            toast({
              variant: "destructive",
              title: "Image error",
              description: `Could not process "${file.name}". Try a different photo.`,
            });
          }
        }
        continue;
      }

      // Handle non-image files
      if (!isImage && onFileSelected) {
        console.log("[ChatImageUpload] Processing document, calling onFileSelected");
        onFileSelected(file, file.name);
        continue;
      }

      // Fallback: if only onImageSelected is provided but file is not an image
      if (!isImage && !onFileSelected) {
        console.log("[ChatImageUpload] Non-image file but no onFileSelected handler");
        toast({
          variant: "destructive",
          title: "Images only",
          description: "Only image files are supported in this chat.",
        });
        continue;
      }

      // Legacy API: upload immediately (images only)
      if (isImage && onImageUploaded) {
        console.log("[ChatImageUpload] Using legacy upload API");
        setIsUploading(true);
        try {
          const compressedBlob = await compressImage(file);
          const previewUrl = URL.createObjectURL(compressedBlob);
          setPreview(previewUrl);

          const fileName = `chat/${user.id}/${Date.now()}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from("chat-images")
            .upload(fileName, compressedBlob, {
              contentType: "image/jpeg",
              upsert: false,
            });

          if (uploadError) {
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
              continue;
            }
            throw uploadError;
          }

          const { data: { publicUrl } } = supabase.storage
            .from("chat-images")
            .getPublicUrl(fileName);

          onImageUploaded(publicUrl);
          setPreview(null);
        } catch (error: any) {
          console.error("[ChatImageUpload] Legacy upload error:", error);
          toast({
            variant: "destructive",
            title: "Upload failed",
            description: error.message || "Failed to upload image.",
          });
          setPreview(null);
        } finally {
          setIsUploading(false);
        }
      }
    }
  };

  const cancelUpload = () => {
    setPreview(null);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleButtonClick = () => {
    console.log("[ChatImageUpload] Button clicked, triggering file input");
    fileInputRef.current?.click();
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_TYPES}
        multiple={multiple}
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
          className={`shrink-0 rounded-full text-muted-foreground hover:text-foreground ${buttonSize}`}
          onClick={handleButtonClick}
          disabled={disabled || isUploading}
        >
          {isUploading ? (
            <Loader2 className={`${iconSize} animate-spin`} />
          ) : (
            <Paperclip className={iconSize} />
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
  const [showLightbox, setShowLightbox] = useState(false);

  if (hasError) {
    return (
      <div className="w-full h-24 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs">
        Image unavailable
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {isLoading && (
          <div className="w-full h-32 flex items-center justify-center bg-muted/50 rounded-lg">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowLightbox(true)}
          className="block text-left"
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
        </button>
      </div>

      {/* Image Lightbox */}
      {showLightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setShowLightbox(false)}
        >
          <button
            onClick={() => setShowLightbox(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="relative max-w-[90vw] max-h-[90vh] p-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={src}
              alt={alt || "Shared image"}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-4 text-center text-sm text-white/70 hover:text-white transition-colors"
            >
              Open in new tab
            </a>
          </div>
        </div>
      )}
    </>
  );
}

// Display file attachment in message content
export function ChatFile({ src, fileName }: { src: string; fileName?: string }) {
  const [isDownloading, setIsDownloading] = useState(false);

  // Extract filename from URL if not provided
  const displayName = fileName || (() => {
    try {
      const url = new URL(src);
      const pathParts = url.pathname.split("/");
      return decodeURIComponent(pathParts[pathParts.length - 1]) || "File";
    } catch {
      return "File";
    }
  })();

  // Get file extension for icon color
  const ext = displayName.split(".").pop()?.toLowerCase() || "";
  const getFileColor = () => {
    if (ext === "pdf") return "text-red-500";
    if (["doc", "docx"].includes(ext)) return "text-blue-500";
    if (["xls", "xlsx", "csv"].includes(ext)) return "text-green-500";
    return "text-muted-foreground";
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = displayName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      // Fallback: open in new tab
      window.open(src, "_blank");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border max-w-[280px]">
      <FileText className={`h-8 w-8 shrink-0 ${getFileColor()}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{displayName}</p>
        <p className="text-xs text-muted-foreground uppercase">{ext} file</p>
      </div>
      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="p-2 rounded-full hover:bg-muted transition-colors"
        title="Download file"
      >
        {isDownloading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Download className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
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

// Check if a message content is a file URL (non-image)
export function isFileUrl(content: string): boolean {
  // Check if it's a Supabase storage URL for files
  if (content.includes("supabase.co/storage") && content.includes("/chat-files/")) {
    return true;
  }

  // Check common file extensions
  const fileExtensions = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv"];

  try {
    const url = new URL(content);
    return fileExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext));
  } catch {
    return false;
  }
}
