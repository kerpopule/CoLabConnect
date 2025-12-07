import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Loader2,
  Mail,
  Building,
  Briefcase,
  LogOut,
  UserCog,
  Phone,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { SocialLinksDisplay } from "@/components/SocialLinksEditor";
import { migrateOldSocialLinks } from "@/lib/utils";
import { NotificationSettings } from "@/components/NotificationSettings";

export default function MyProfile() {
  const [, setLocation] = useLocation();
  const { user, profile, signOut, loading } = useAuth();
  const { toast } = useToast();

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Signed out",
        description: "You have been signed out successfully.",
      });
      setLocation("/");
    } catch (error) {
      console.error("Sign out error:", error);
      toast({
        variant: "destructive",
        title: "Sign out failed",
        description: "Please try again.",
      });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !profile) {
    return null;
  }

  const socialLinks = migrateOldSocialLinks(profile.social_links);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
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

            {/* Contact info in header */}
            <div className="flex flex-wrap items-center justify-center gap-4 mt-3">
              {profile.email && (
                <a
                  href={`mailto:${profile.email}`}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  <span className="truncate max-w-[200px] sm:max-w-none">{profile.email}</span>
                </a>
              )}
              {profile.phone && (
                <a
                  href={`tel:${profile.phone}`}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  <span>{profile.phone}</span>
                </a>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-center gap-3 mb-6">
            <Button
              className="rounded-full hover:scale-105 hover:shadow-lg hover:brightness-110 transition-all min-h-[44px]"
              onClick={() => setLocation("/profile/edit")}
            >
              <UserCog className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
          </div>

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

          {/* Contact Visibility Settings */}
          <div className="pt-6 border-t border-border">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Contact Visibility</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>Email</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${profile.show_email !== false ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                  {profile.show_email !== false ? 'Visible to connections' : 'Hidden'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>Phone</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${profile.show_phone && profile.phone ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                  {!profile.phone ? 'Not set' : profile.show_phone ? 'Visible to connections' : 'Hidden'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <NotificationSettings />

      {/* Sign Out Button */}
      <Button
        variant="outline"
        className="w-full h-12 rounded-xl text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={handleSignOut}
      >
        <LogOut className="h-5 w-5 mr-2" />
        Sign Out
      </Button>
    </div>
  );
}
