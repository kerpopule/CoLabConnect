import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, X, Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function QRCodeButton({ mode = "mobile" }: { mode?: "mobile" | "desktop" | "collapsed" }) {
  const [isOpen, setIsOpen] = useState(false);
  const { user, profile } = useAuth();
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!user || !profile) {
    return null;
  }

  // Include ?qr=true to allow guests to view this specific profile without login
  const profileUrl = `${window.location.origin}/profile/${user.id}?qr=true`;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile.name} - Co:Lab Connect`,
          text: `Connect with ${profile.name} on Co:Lab Connect!`,
          url: profileUrl,
        });
      } catch (err) {
        console.log("Share cancelled");
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(profileUrl);
      alert("Profile link copied to clipboard!");
    }
  };

  const handleDownload = () => {
    const svg = document.getElementById("profile-qr-code");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");

      const downloadLink = document.createElement("a");
      downloadLink.download = `colab-${profile.name.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  // Desktop mode uses standard dialog
  if (mode === "desktop" || mode === "collapsed") {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            className={`h-12 rounded-xl flex items-center shadow-lg bg-gradient-to-tr from-primary to-accent hover:shadow-xl hover:scale-105 transition-all duration-300 ${
              mode === "collapsed"
                ? "w-12 justify-center px-0 rounded-full"
                : "w-full justify-start px-4 rounded-full"
            }`}
          >
            <QrCode className={`text-white h-5 w-5 ${mode === "collapsed" ? "" : "mr-2"}`} />
            {mode !== "collapsed" && <span className="text-white font-medium">My QR Code</span>}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center font-display">Share Your Profile</DialogTitle>
          </DialogHeader>
          <QRContent
            profile={profile}
            profileUrl={profileUrl}
            getInitials={getInitials}
            handleShare={handleShare}
            handleDownload={handleDownload}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Mobile mode uses custom popup with portal
  return (
    <>
      {/* Trigger Button - larger and more pronounced */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`relative z-[60] h-14 w-14 rounded-full shadow-lg bg-gradient-to-tr from-primary to-accent hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center justify-center ${
          isOpen ? "scale-110 shadow-xl" : ""
        }`}
      >
        <QrCode className="text-white h-7 w-7" />
      </button>

      {/* Portal for backdrop and popup - renders at document body level */}
      {createPortal(
        <>
          {/* Backdrop - darkens everything */}
          {isOpen && (
            <div
              className="fixed inset-0 z-[9998] bg-black/60 animate-in fade-in-0 duration-200"
              onClick={() => setIsOpen(false)}
            />
          )}

          {/* QR Code Panel - centered on screen */}
          <div
            className={`fixed z-[9999] inset-0 flex items-center justify-center pointer-events-none ${
              isOpen ? "" : "hidden"
            }`}
          >
            <div
              className={`w-[calc(100%-2rem)] max-w-sm bg-background border border-border rounded-2xl shadow-2xl transition-all duration-300 ease-out ${
                isOpen
                  ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                  : "opacity-0 translate-y-32 scale-95"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="font-display font-bold text-lg">Share Your Profile</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                <QRContent
                  profile={profile}
                  profileUrl={profileUrl}
                  getInitials={getInitials}
                  handleShare={handleShare}
                  handleDownload={handleDownload}
                  compact
                />
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// Extracted QR content component for reuse
function QRContent({
  profile,
  profileUrl,
  getInitials,
  handleShare,
  handleDownload,
  compact = false
}: {
  profile: any;
  profileUrl: string;
  getInitials: (name: string) => string;
  handleShare: () => void;
  handleDownload: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center ${compact ? "space-y-4" : "space-y-6 py-4"}`}>
      {/* Profile info */}
      <div className="flex flex-col items-center gap-2">
        <Avatar className={`border-2 border-primary/20 ${compact ? "h-12 w-12" : "h-16 w-16"}`}>
          <AvatarImage src={profile.avatar_url || undefined} alt={profile.name} />
          <AvatarFallback className="bg-primary/10 text-primary font-medium text-lg">
            {getInitials(profile.name)}
          </AvatarFallback>
        </Avatar>
        <div className="text-center">
          <h3 className={`font-bold ${compact ? "text-base" : "text-lg"}`}>{profile.name}</h3>
          <p className="text-sm text-muted-foreground">{profile.role || "Member"}</p>
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-white p-3 rounded-2xl shadow-inner">
        <QRCodeSVG
          id="profile-qr-code"
          value={profileUrl}
          size={compact ? 160 : 200}
          level="H"
          includeMargin={true}
          fgColor="#0d9488"
          bgColor="#ffffff"
        />
      </div>

      <p className={`text-muted-foreground text-center max-w-xs ${compact ? "text-xs" : "text-sm"}`}>
        Scan this code to view your profile and connect with you on Co:Lab
      </p>

      {/* Action buttons */}
      <div className="flex gap-3 w-full">
        <Button
          variant="outline"
          className="flex-1 rounded-full"
          onClick={handleShare}
        >
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-full"
          onClick={handleDownload}
        >
          <Download className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  );
}
