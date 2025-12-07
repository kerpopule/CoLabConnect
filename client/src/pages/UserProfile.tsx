import { useEffect, useState } from "react";
import { useParams, Link, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  MessageCircle,
  UserPlus,
  UserCheck,
  Loader2,
  Mail,
  Building,
  Briefcase,
  LogIn,
  Phone,
  Download,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Profile, Connection } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { SocialLinksDisplay } from "@/components/SocialLinksEditor";
import { migrateOldSocialLinks } from "@/lib/utils";
import { downloadVCard } from "@/lib/vcard";

const QR_ACCESS_KEY = "colab-qr-access";

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const isQrAccess = new URLSearchParams(searchString).get("qr") === "true";
  const { user, profile: currentUserProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingConnect, setPendingConnect] = useState(false);
  const [hasQrAccess, setHasQrAccess] = useState(false);

  // Handle QR code access - store allowed profile ID in sessionStorage
  useEffect(() => {
    if (isQrAccess && id) {
      // Store the profile ID that can be viewed without login
      sessionStorage.setItem(QR_ACCESS_KEY, id);
      setHasQrAccess(true);
    } else if (id) {
      // Check if this profile has QR access stored
      const storedQrId = sessionStorage.getItem(QR_ACCESS_KEY);
      setHasQrAccess(storedQrId === id);
    }
  }, [isQrAccess, id]);

  // Check for pending connect request (set after login)
  useEffect(() => {
    if (user && id && !authLoading) {
      const pendingConnectId = localStorage.getItem("colab-pending-connect");
      if (pendingConnectId === id) {
        setPendingConnect(true);
        localStorage.removeItem("colab-pending-connect");
      }
    }
  }, [user, id, authLoading]);

  // Fetch the profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Profile;
    },
    enabled: !!id,
  });

  // Check connection status - get ALL connections between these two users
  const { data: connectionStatus } = useQuery({
    queryKey: ["connection-status", user?.id, id],
    queryFn: async () => {
      if (!user) return null;

      // Get all connections between these two users (in either direction)
      const { data: connections } = await supabase
        .from("connections")
        .select("*")
        .or(`and(follower_id.eq.${user.id},following_id.eq.${id}),and(follower_id.eq.${id},following_id.eq.${user.id})`);

      if (!connections || connections.length === 0) return null;

      // If ANY connection is accepted, return that one (handles duplicates)
      const acceptedConnection = connections.find(c => c.status === "accepted");
      if (acceptedConnection) {
        const type = acceptedConnection.follower_id === user.id ? "sent" : "received";
        return { type, connection: acceptedConnection };
      }

      // Otherwise return the first pending connection
      const pendingConnection = connections.find(c => c.status === "pending");
      if (pendingConnection) {
        const type = pendingConnection.follower_id === user.id ? "sent" : "received";
        return { type, connection: pendingConnection };
      }

      return null;
    },
    enabled: !!user && !!id && user.id !== id,
  });

  // Send connection request
  const sendRequest = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      // Check if any connection already exists in either direction
      const { data: existingConnection } = await supabase
        .from("connections")
        .select("*")
        .or(`and(follower_id.eq.${user.id},following_id.eq.${id}),and(follower_id.eq.${id},following_id.eq.${user.id})`)
        .maybeSingle();

      if (existingConnection) {
        // If they sent us a request, accept it instead of creating a duplicate
        if (existingConnection.follower_id === id && existingConnection.status === "pending") {
          const { error } = await supabase
            .from("connections")
            .update({ status: "accepted" })
            .eq("id", existingConnection.id);
          if (error) throw error;
          return { action: "accepted" };
        }
        // Already connected or request already sent
        throw new Error("Connection already exists");
      }

      const { error } = await supabase.from("connections").insert({
        follower_id: user.id,
        following_id: id,
        status: "pending",
      } as any);

      if (error) throw error;
      return { action: "sent" };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["connection-status"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["pending-requests-count"] });

      if (result?.action === "accepted") {
        toast({
          title: "Connected!",
          description: `You are now connected with ${profile?.name}.`,
        });
      } else {
        toast({
          title: "Request sent!",
          description: `Connection request sent to ${profile?.name}.`,
        });

        // Send push notification to the recipient
        if (id && user && currentUserProfile) {
          fetch("/api/notify/connection", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              receiverId: id,
              senderId: user.id,
              senderName: currentUserProfile.name,
            }),
          }).catch(console.error);
        }
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to send request",
        description: error.message,
      });
    },
  });

  // Auto-send connection request when pendingConnect is true (after QR code scan -> login flow)
  useEffect(() => {
    if (pendingConnect && user && id && user.id !== id && !connectionStatus && !sendRequest.isPending) {
      sendRequest.mutate();
      setPendingConnect(false);
    }
  }, [pendingConnect, user, id, connectionStatus, sendRequest]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleMessage = () => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Sign in required",
        description: "Please sign in to message this member.",
      });
      return;
    }

    // Navigate to chat with this user's private channel
    setLocation(`/chat?dm=${id}`);
  };

  const handleSaveContact = () => {
    if (!profile) return;

    const socialLinksData = migrateOldSocialLinks(profile.social_links);
    const websiteLink = socialLinksData.find(l => l.type === 'website')?.url;
    const linkedinLink = socialLinksData.find(l => l.type === 'linkedin')?.url;

    downloadVCard({
      name: profile.name,
      email: profile.show_email !== false ? profile.email : undefined,
      phone: profile.show_phone ? (profile.phone || undefined) : undefined,
      role: profile.role || undefined,
      company: profile.company || undefined,
      bio: profile.bio || undefined,
      website: websiteLink,
      linkedin: linkedinLink,
    }, profile.name.replace(/\s+/g, '_'));

    toast({
      title: "Contact saved!",
      description: `${profile.name}'s contact card has been downloaded.`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Profile not found</p>
        <Link href="/directory">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Directory
          </Button>
        </Link>
      </div>
    );
  }

  // Require login to view profiles, except for QR code access
  if (!user && !authLoading && !hasQrAccess) {
    return (
      <div className="max-w-md mx-auto space-y-6 pb-20">
        <Card className="border-border/50 shadow-lg overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/20" />
          <CardContent className="pt-6 pb-8 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <LogIn className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-display font-bold mb-2">Sign In Required</h2>
              <p className="text-muted-foreground">
                Create an account or sign in to view member profiles and connect with the Co:Lab community.
              </p>
            </div>

            <div className="space-y-3">
              <Link href={`/login?redirect=/profile/${id}`}>
                <Button className="w-full rounded-full" size="lg">
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In to View Profile
                </Button>
              </Link>
              <Link href="/directory">
                <Button variant="outline" className="w-full rounded-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Browse Directory
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const socialLinks = migrateOldSocialLinks(profile.social_links);
  const isOwnProfile = user?.id === profile.id;
  const isConnected = connectionStatus?.connection?.status === "accepted";
  const isPending = connectionStatus?.connection?.status === "pending";

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Back button */}
      <div className="flex items-center gap-4">
        <Link href="/directory">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <span className="text-muted-foreground">Back to Directory</span>
      </div>

      {/* Profile Header Card */}
      <Card className="border-border/50 shadow-lg overflow-hidden">
        {/* Cover gradient */}
        <div className="h-32 bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/20" />

        <CardContent className="relative pt-0 pb-6">
          {/* Avatar - overlapping the cover */}
          <div className="flex flex-col items-center -mt-16 mb-4">
            <Avatar className="w-32 h-32 border-4 border-background shadow-xl">
              <AvatarImage src={profile.avatar_url || undefined} alt={profile.name} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-3xl">
                {getInitials(profile.name)}
              </AvatarFallback>
            </Avatar>

            <h1 className="text-2xl font-display font-bold mt-4">{profile.name}</h1>

            {profile.role && (
              <div className="flex items-center gap-2 text-primary font-medium mt-1">
                <Briefcase className="h-4 w-4" />
                {profile.role}
              </div>
            )}

            {profile.company && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1">
                <Building className="h-4 w-4" />
                {profile.company}
              </div>
            )}

            {/* Contact info in header - show based on visibility settings */}
            {/* For own profile: always show. For others: show if visibility is enabled */}
            {((profile.show_email !== false && profile.email) || (profile.show_phone && profile.phone) || isOwnProfile) && (
              <div className="flex flex-wrap items-center justify-center gap-4 mt-3">
                {/* Email: show if visible OR if viewing own profile */}
                {((profile.show_email !== false && profile.email) || (isOwnProfile && profile.email)) && (
                  <a
                    href={`mailto:${profile.email}`}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    <span className="truncate max-w-[200px] sm:max-w-none">{profile.email}</span>
                  </a>
                )}
                {/* Phone: show if visible OR if viewing own profile */}
                {((profile.show_phone && profile.phone) || (isOwnProfile && profile.phone)) && (
                  <a
                    href={`tel:${profile.phone}`}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    <span>{profile.phone}</span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!isOwnProfile && (
            <div className="flex justify-center gap-3 mb-6">
              {isConnected ? (
                <Button variant="outline" className="rounded-full" disabled>
                  <UserCheck className="h-4 w-4 mr-2" />
                  Connected
                </Button>
              ) : isPending ? (
                <Button variant="outline" className="rounded-full" disabled>
                  <Loader2 className="h-4 w-4 mr-2" />
                  {connectionStatus?.type === "sent" ? "Request Sent" : "Request Pending"}
                </Button>
              ) : !user ? (
                <Button
                  className="rounded-full"
                  onClick={() => {
                    // Store the profile ID for auto-connect after login
                    localStorage.setItem("colab-pending-connect", id!);
                    setLocation(`/login?redirect=/profile/${id}`);
                  }}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In to Connect
                </Button>
              ) : (
                <Button
                  className="rounded-full hover:scale-105 hover:shadow-lg hover:brightness-110 transition-all"
                  onClick={() => sendRequest.mutate()}
                  disabled={sendRequest.isPending}
                >
                  {sendRequest.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-2" />
                  )}
                  Connect
                </Button>
              )}

              {isConnected && (
                <Button variant="secondary" className="rounded-full hover:scale-105 hover:shadow-md hover:bg-secondary/80 transition-all" onClick={handleMessage}>
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Message
                </Button>
              )}
            </div>
          )}

          {isOwnProfile && (
            <div className="flex justify-center mb-6">
              <Button
                variant="outline"
                className="rounded-full hover:scale-105 hover:shadow-md hover:bg-primary/10 hover:border-primary transition-all min-h-[44px]"
                onClick={() => setLocation("/profile/edit")}
              >
                Edit Profile
              </Button>
            </div>
          )}

          {/* Bio */}
          {profile.bio && (
            <div className="bg-muted/30 rounded-xl p-4 mb-6">
              <p className="text-foreground leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {/* Tags */}
          {profile.tags && profile.tags.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Specialties</h3>
              <div className="flex flex-wrap gap-2">
                {profile.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-primary/10 text-primary border-primary/20 px-3 py-1"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Social Links */}
          {socialLinks.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Connect</h3>
              <SocialLinksDisplay links={socialLinks} />
            </div>
          )}

          {/* Save Contact Button */}
          <Button
            className="w-full h-14 rounded-xl bg-green-600 hover:bg-green-700 text-white hover:scale-[1.02] hover:shadow-lg transition-all text-lg font-medium"
            onClick={handleSaveContact}
          >
            <Download className="h-5 w-5 mr-2" />
            Save Contact
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
