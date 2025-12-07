import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, ArrowLeft, Camera, Trash2, Phone, Mail, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { SocialLinksEditor } from "@/components/SocialLinksEditor";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { SocialLink, migrateOldSocialLinks, normalizeUrl } from "@/lib/utils";

export default function EditProfile() {
  const [, setLocation] = useLocation();
  const { user, profile, updateProfile, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [tempFilePath, setTempFilePath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [showEmail, setShowEmail] = useState(true);
  const [showPhone, setShowPhone] = useState(false);

  // Load profile data when available
  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setRole(profile.role || "");
      setCompany(profile.company || "");
      setBio(profile.bio || "");
      setTags((profile.tags || []).join(", "));
      setAvatarUrl(profile.avatar_url || null);
      setPhone(profile.phone || "");
      // Default to true for email if not set, false for phone
      setShowEmail(profile.show_email ?? true);
      setShowPhone(profile.show_phone ?? false);
      // Migrate old social links format to new array format
      const links = migrateOldSocialLinks(profile.social_links);
      setSocialLinks(links);
    }
  }, [profile]);

  // Resize and compress image before upload to avoid timeout issues
  const resizeImage = (file: File | Blob, maxSize: number = 1200): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      // Use FileReader to get a stable data URL (avoids blob URL lifecycle issues)
      const reader = new FileReader();

      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          reject(new Error("Failed to read file"));
          return;
        }

        const img = new Image();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        img.onload = () => {
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

          if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
          }

          // Draw white background (for transparency)
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);

          // Draw the image
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob with JPEG compression
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Failed to create blob"));
              }
            },
            "image/jpeg",
            0.85 // Quality
          );
        };

        img.onerror = () => {
          reject(new Error("Failed to load image"));
        };

        img.src = dataUrl;
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      reader.readAsDataURL(file);
    });
  };

  // Handle file selection - read file into data URL for reliable cross-platform preview
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !files[0] || !user) return;

    const file = files[0];
    const fileName = file.name;
    const fileType = file.type;
    const fileSize = file.size;

    // Reset input immediately to allow re-selecting the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    // Validate file type
    if (!fileType.startsWith("image/")) {
      toast({ variant: "destructive", title: "Invalid file", description: "Please select an image." });
      return;
    }
    if (fileSize > 20 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Max 20MB." });
      return;
    }

    console.log("Processing file:", fileName, fileSize, fileType);
    setIsUploadingPhoto(true);

    // Set up timeout for file reading (10 seconds)
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setIsUploadingPhoto(false);
      toast({
        variant: "destructive",
        title: "Failed to read image",
        description: "The file may be on a cloud drive (iCloud/Dropbox). Try downloading it locally first.",
      });
    }, 10000);

    // Read file as data URL using FileReader
    const reader = new FileReader();

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        console.log(`Reading: ${Math.round((e.loaded / e.total) * 100)}%`);
      }
    };

    reader.onload = (e) => {
      if (timedOut) return;
      clearTimeout(timeoutId);

      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        setIsUploadingPhoto(false);
        toast({ variant: "destructive", title: "Failed to read image" });
        return;
      }

      console.log("File read successfully, data URL length:", dataUrl.length);

      // Pre-validate image by loading it into an Image element
      const testImg = new Image();
      testImg.onload = () => {
        if (timedOut) return;
        console.log("Image validated:", testImg.naturalWidth, "x", testImg.naturalHeight);
        setIsUploadingPhoto(false);
        setSelectedFile(new File([file], fileName, { type: fileType }));
        setTempImageUrl(dataUrl);
        setTempFilePath(null);
        setCropDialogOpen(true);
      };
      testImg.onerror = () => {
        if (timedOut) return;
        setIsUploadingPhoto(false);
        toast({
          variant: "destructive",
          title: "Invalid image",
          description: "The file could not be loaded as an image. Try a different file.",
        });
      };
      testImg.src = dataUrl;
    };

    reader.onerror = () => {
      if (timedOut) return;
      clearTimeout(timeoutId);
      setIsUploadingPhoto(false);
      console.error("FileReader error:", reader.error);
      toast({
        variant: "destructive",
        title: "Failed to read image",
        description: reader.error?.message || "The file could not be read. Try a different file.",
      });
    };

    // Start reading
    try {
      reader.readAsDataURL(file);
    } catch (err: any) {
      clearTimeout(timeoutId);
      setIsUploadingPhoto(false);
      console.error("readAsDataURL exception:", err);
      toast({
        variant: "destructive",
        title: "Failed to read image",
        description: err.message || "The file could not be read.",
      });
    }
  };

  // Handle cropped image - upload as final avatar
  const handleCroppedImage = async (croppedFile: File) => {
    if (!user) return;

    setIsUploadingPhoto(true);

    try {
      // Upload cropped image as user's avatar
      const avatarFileName = `${user.id}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(avatarFileName, croppedFile, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      // Get public URL and update profile
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(avatarFileName);

      const { error: updateError } = await updateProfile({ avatar_url: `${publicUrl}?t=${Date.now()}` });
      if (updateError) throw updateError;

      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast({ title: "Photo updated!" });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ variant: "destructive", title: "Upload failed", description: error.message });
    } finally {
      setIsUploadingPhoto(false);
      setSelectedFile(null);
      setTempImageUrl(null);
      setTempFilePath(null);
    }
  };

  // Clean up state if dialog is closed without saving
  const handleCropDialogClose = (open: boolean) => {
    setCropDialogOpen(open);
    if (!open) {
      setSelectedFile(null);
      setTempImageUrl(null);
      setTempFilePath(null);
    }
  };

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
    }
  }, [user, authLoading, setLocation]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    console.log('Starting profile update...');

    // Check if this is a new user completing their profile (before update)
    const wasNewUser = !profile?.role && !profile?.bio && (!profile?.tags || profile.tags.length === 0);

    // Parse tags from comma-separated string
    const tagsArray = tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Normalize URLs and filter out empty links
    const normalizedLinks = socialLinks
      .filter(link => link.url.trim() !== "")
      .map(link => ({
        ...link,
        url: normalizeUrl(link.url),
      }));

    const updates = {
      name,
      role: role || null,
      company: company || null,
      bio: bio || null,
      tags: tagsArray.length > 0 ? tagsArray : [],
      social_links: normalizedLinks,
      phone: phone || null,
      show_email: showEmail,
      show_phone: showPhone,
    };

    console.log('Submitting updates:', updates);

    try {
      const { error } = await updateProfile(updates);
      console.log('Update result - error:', error);

      if (error) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: error.message,
        });
        setIsLoading(false);
        return;
      }

      // Invalidate the profiles query to refresh directory
      queryClient.invalidateQueries({ queryKey: ["profiles"] });

      toast({
        title: wasNewUser ? "Welcome to Co:Lab!" : "Profile updated!",
        description: wasNewUser ? "Your profile is ready. Start connecting with the community!" : "Your changes have been saved.",
      });
      setIsLoading(false);
      // Redirect new users to directory, existing users to my-profile
      setLocation(wasNewUser ? "/directory" : "/my-profile");
    } catch (err: any) {
      console.error('handleSubmit error:', err);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message || "An unexpected error occurred",
      });
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    setIsDeleting(true);

    try {
      // Delete avatar from storage if exists
      if (profile?.avatar_url) {
        const avatarPath = profile.avatar_url.split("/").pop()?.split("?")[0];
        if (avatarPath) {
          await supabase.storage
            .from("avatars")
            .remove([avatarPath]);
        }
      }

      // Call server endpoint to delete auth user (requires service role key)
      // This also cascades to delete the profile via FK constraint
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete account");
      }

      // Clear cached profile
      localStorage.removeItem("colab_profile_cache");

      // Sign out the user
      await signOut();

      toast({
        title: "Account deleted",
        description: "Your account and all associated data have been deleted.",
      });

      setLocation("/");
    } catch (error: any) {
      console.error("Delete account error:", error);
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error.message || "Failed to delete account. Please try again.",
      });
      setIsDeleting(false);
    }
  };

  // Show loading while auth is loading or user is not available
  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check if this is a new user (profile incomplete) - safely handle null profile
  const isNewUser = !profile || (!profile.role && !profile.bio && (!profile.tags || profile.tags.length === 0));

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        {!isNewUser && (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            {isNewUser ? "Complete Your Profile" : "Edit Profile"}
          </h1>
          <p className="text-muted-foreground">
            {isNewUser
              ? "Tell the Co:Lab community about yourself"
              : "Update your Co:Lab profile"}
          </p>
        </div>
      </div>

      {isNewUser && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
          <p className="text-sm text-foreground">
            <span className="font-semibold">Welcome to Co:Lab!</span> Fill out your profile below so other members can find and connect with you. You can always update this later.
          </p>
        </div>
      )}

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-4">
            {/* Clickable Avatar for Photo Upload */}
            <div className="relative group">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhoto}
                className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <Avatar className="h-20 w-20 cursor-pointer">
                  <AvatarImage src={avatarUrl || undefined} alt={profile?.name || "Profile"} />
                  <AvatarFallback className="bg-primary/10 text-primary font-medium text-2xl">
                    {profile ? getInitials(profile.name) : user.email?.[0].toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                {/* Overlay on hover */}
                <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {isUploadingPhoto ? (
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  ) : (
                    <Camera className="h-6 w-6 text-white" />
                  )}
                </div>
              </button>
              <p className="text-xs text-muted-foreground mt-2 text-center">Click to change</p>
            </div>
            <div>
              <p className="text-lg">{profile?.name || user.email}</p>
              <p className="text-sm text-muted-foreground font-normal">{user.email}</p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Sarah Connor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="bg-muted/30"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role / Title</Label>
                <Input
                  id="role"
                  placeholder="e.g. Product Designer"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="bg-muted/30"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company / Organization</Label>
              <Input
                id="company"
                placeholder="e.g. Acme Inc."
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="bg-muted/30"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number (Optional)</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="e.g. (555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-muted/30 pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Contact Privacy Settings */}
            <div className="space-y-4 pt-4 border-t border-border">
              <Label className="text-base font-semibold">Contact Visibility</Label>
              <p className="text-sm text-muted-foreground">
                Choose which contact info is visible on your profile
              </p>

              <div className="space-y-4">
                <div className="flex items-center justify-between w-full p-3 -m-3 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div className="text-left">
                      <span className="text-sm font-medium">
                        Show Email Address
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="show-email"
                    checked={showEmail}
                    onCheckedChange={setShowEmail}
                    disabled={isLoading}
                  />
                </div>

                <div className={`flex items-center justify-between w-full p-3 -m-3 rounded-xl ${!phone ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div className="text-left">
                      <span className="text-sm font-medium">
                        Show Phone Number
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {phone || "No phone number added"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="show-phone"
                    checked={showPhone}
                    onCheckedChange={setShowPhone}
                    disabled={isLoading || !phone}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Short Bio</Label>
              <Textarea
                id="bio"
                placeholder="Briefly describe what you do and what you're looking for..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="bg-muted/30 min-h-[100px]"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label>Specialty Tags (Separate by comma)</Label>
              <Input
                placeholder="e.g. Fintech, React, Design, Fundraising"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="bg-muted/30"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <Label className="text-base font-semibold">Social Links & Websites</Label>
              <SocialLinksEditor
                links={socialLinks}
                onChange={setSocialLinks}
                disabled={isLoading}
              />
            </div>

            <div className="pt-4 flex gap-3">
              <Button
                type="submit"
                className="flex-1 h-12 text-lg rounded-xl font-medium shadow-lg hover:shadow-xl transition-all"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {isNewUser ? "Creating profile..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-5 w-5" />
                    {isNewUser ? "Complete Profile" : "Save Changes"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Danger Zone - Delete Account */}
      <Card className="border-destructive/30 shadow-sm">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-destructive">Danger Zone</h3>
              <p className="text-sm text-muted-foreground">
                Once you delete your account, there is no going back. Please be certain.
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-12 rounded-xl text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-5 w-5" />
                      Delete Account
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="text-sm text-muted-foreground">
                      This action cannot be undone. This will permanently delete your account
                      and remove all your data from our servers, including:
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Your profile information</li>
                        <li>All your connections</li>
                        <li>Your chat messages</li>
                        <li>Your profile photo</li>
                      </ul>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, delete my account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Image Crop Dialog */}
      <ImageCropDialog
        file={selectedFile}
        imageDataUrl={tempImageUrl}
        open={cropDialogOpen}
        onOpenChange={handleCropDialogClose}
        onCropComplete={handleCroppedImage}
      />
    </div>
  );
}
