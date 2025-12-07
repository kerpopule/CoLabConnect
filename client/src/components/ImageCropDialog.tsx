import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, ZoomIn, ZoomOut, Move } from "lucide-react";

interface ImageCropDialogProps {
  file: File | null;
  imageDataUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCropComplete: (croppedFile: File) => void;
}

export function ImageCropDialog({
  file,
  imageDataUrl,
  open,
  onOpenChange,
  onCropComplete,
}: ImageCropDialogProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset state when dialog closes or image changes
  useEffect(() => {
    if (!open || !imageDataUrl) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setImageLoaded(false);
      setIsProcessing(false);
    }
  }, [open, imageDataUrl]);

  // Handle image load
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    // Auto-fit the image to fill the crop area
    if (imageRef.current) {
      const img = imageRef.current;
      const containerSize = 280; // Size of the crop area
      const minDimension = Math.min(img.naturalWidth, img.naturalHeight);
      // Scale so the smaller dimension fills the container (with slight padding)
      const initialScale = (containerSize / minDimension) * 1.05;
      setScale(initialScale);
      // Center the image
      setPosition({ x: 0, y: 0 });
    }
  }, []);

  // Mouse/Touch handlers for dragging
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true);
    setDragStart({ x: clientX - position.x, y: clientY - position.y });
  }, [position]);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;
    setPosition({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Crop and convert to JPG
  const handleCrop = useCallback(async () => {
    if (!imageRef.current || !canvasRef.current) return;

    setIsProcessing(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = imageRef.current;
      const outputSize = 400; // Output size in pixels
      canvas.width = outputSize;
      canvas.height = outputSize;

      // Fill with white background (for JPG transparency)
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, outputSize, outputSize);

      // Calculate the crop area based on current position and scale
      const containerSize = 280;
      const scaleRatio = outputSize / containerSize;

      // Draw the image with current transformations
      ctx.save();
      ctx.translate(outputSize / 2, outputSize / 2);
      ctx.scale(scale * scaleRatio, scale * scaleRatio);
      ctx.translate(-img.naturalWidth / 2 + (position.x * scaleRatio) / scale,
                    -img.naturalHeight / 2 + (position.y * scaleRatio) / scale);
      ctx.drawImage(img, 0, 0);
      ctx.restore();

      // Convert to JPG blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const fileName = file?.name.replace(/\.[^/.]+$/, "") || "avatar";
            const croppedFile = new File([blob], `${fileName}.jpg`, {
              type: "image/jpeg",
            });
            onCropComplete(croppedFile);
            onOpenChange(false);
          }
          setIsProcessing(false);
        },
        "image/jpeg",
        0.9 // Quality
      );
    } catch (error) {
      console.error("Error cropping image:", error);
      setIsProcessing(false);
    }
  }, [file, scale, position, onCropComplete, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Photo</DialogTitle>
          <DialogDescription>
            Drag to position your photo and use the slider to zoom in or out.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {/* Crop area */}
          <div
            ref={containerRef}
            className="relative w-[280px] h-[280px] rounded-full overflow-hidden bg-muted border-4 border-primary/20 cursor-move"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {isProcessing && !imageLoaded ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : imageDataUrl ? (
              <div className="absolute inset-0 flex items-center justify-center overflow-visible">
                <img
                  ref={imageRef}
                  src={imageDataUrl}
                  alt="Crop preview"
                  className="select-none pointer-events-none"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transformOrigin: "center",
                    maxWidth: "none",
                    maxHeight: "none",
                  }}
                  onLoad={handleImageLoad}
                  draggable={false}
                />
              </div>
            ) : null}

            {/* Drag hint overlay */}
            {imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/30 rounded-full p-2 opacity-0 hover:opacity-100 transition-opacity">
                  <Move className="h-6 w-6 text-white" />
                </div>
              </div>
            )}
          </div>

          {/* Zoom controls */}
          {imageLoaded && (
            <div className="w-full flex items-center gap-3 px-4">
              <ZoomOut className="h-4 w-4 text-muted-foreground" />
              <Slider
                value={[scale]}
                min={0.1}
                max={2}
                step={0.01}
                onValueChange={(value) => setScale(value[0])}
                className="flex-1"
              />
              <ZoomIn className="h-4 w-4 text-muted-foreground" />
            </div>
          )}

        </div>

        {/* Hidden canvas for processing */}
        <canvas ref={canvasRef} className="hidden" />

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCrop} disabled={isProcessing || !imageLoaded}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Save Photo"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
