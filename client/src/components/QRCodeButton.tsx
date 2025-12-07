import { useState } from "react";
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

export function QRCodeButton({ mode = "mobile" }: { mode?: "mobile" | "desktop" }) {
  const [isOpen, setIsOpen] = useState(false);
  const { user, profile } = useAuth();

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

  const TriggerButton = () => (
    <Button
      size="icon"
      className={`rounded-full shadow-lg bg-gradient-to-tr from-primary to-accent hover:shadow-xl hover:scale-105 transition-all duration-300 ${
        mode === "desktop"
          ? "w-full h-12 rounded-xl flex items-center justify-start px-4"
          : "h-12 w-12"
      }`}
    >
      <QrCode
        className={`text-white ${mode === "desktop" ? "mr-2 h-5 w-5" : "h-6 w-6"}`}
      />
      {mode === "desktop" && (
        <span className="text-white font-medium">My QR Code</span>
      )}
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div>
          <TriggerButton />
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center font-display">Share Your Profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-6 py-4">
          {/* Profile info */}
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-16 w-16 border-2 border-primary/20">
              <AvatarImage src={profile.avatar_url || undefined} alt={profile.name} />
              <AvatarFallback className="bg-primary/10 text-primary font-medium text-lg">
                {getInitials(profile.name)}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h3 className="font-bold text-lg">{profile.name}</h3>
              <p className="text-sm text-muted-foreground">{profile.role || "Member"}</p>
            </div>
          </div>

          {/* QR Code */}
          <div className="bg-white p-4 rounded-2xl shadow-inner">
            <QRCodeSVG
              id="profile-qr-code"
              value={profileUrl}
              size={200}
              level="H"
              includeMargin={true}
              fgColor="#0d9488"
              bgColor="#ffffff"
            />
          </div>

          <p className="text-sm text-muted-foreground text-center max-w-xs">
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
      </DialogContent>
    </Dialog>
  );
}
