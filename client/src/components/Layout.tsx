import { Link, useLocation } from "wouter";
import { Home, Users, MessageCircle, Moon, Sun, LogOut, UserCog, UserCheck, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { QRCodeButton } from "./QRCodeButton";
import { PWAInstallPrompt } from "./PWAInstallPrompt";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isDark, setIsDark] = useState(false);
  const { user, profile, signOut, loading } = useAuth();
  const { toast } = useToast();

  // Fetch pending connection requests count
  const { data: pendingRequestsCount = 0 } = useQuery({
    queryKey: ["pending-requests-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { count, error } = await supabase
        .from("connections")
        .select("*", { count: "exact", head: true })
        .eq("following_id", user.id)
        .eq("status", "pending");

      if (error) return 0;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch unread private messages count
  const { data: unreadMessagesCount = 0 } = useQuery({
    queryKey: ["unread-messages-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { count, error } = await supabase
        .from("private_messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .is("read_at", null);

      if (error) return 0;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  useEffect(() => {
    // Check system preference initially
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

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

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Desktop nav items (includes Home)
  const desktopNavItems = [
    { href: "/", icon: Home, label: "Home", badge: 0 },
    { href: "/directory", icon: Users, label: "Directory", badge: 0 },
    { href: "/connections", icon: UserCheck, label: "Connections", badge: pendingRequestsCount },
    { href: "/chat", icon: MessageCircle, label: "Chat", badge: unreadMessagesCount },
  ];

  // Mobile nav items (Profile instead of Home)
  const mobileNavItems = [
    { href: user ? "/my-profile" : "/login", icon: User, label: "Profile", badge: 0 },
    { href: "/directory", icon: Users, label: "Directory", badge: 0 },
    { href: "/connections", icon: UserCheck, label: "Connections", badge: pendingRequestsCount },
    { href: "/chat", icon: MessageCircle, label: "Chat", badge: unreadMessagesCount },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0 font-sans">
      {/* Mobile Top Bar - only show on profile page */}
      {(location === "/my-profile" || location === "/profile/edit") && (
        <header className="md:hidden flex justify-end items-center p-4 fixed top-0 left-0 right-0 z-50">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-background/50 backdrop-blur-md border border-border shadow-sm"
            onClick={toggleTheme}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </header>
      )}

      {/* Desktop Sidebar / Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-lg border-t border-border md:top-0 md:bottom-auto md:w-64 md:h-screen md:border-r md:border-t-0 md:flex md:flex-col md:p-6">
        <div className="hidden md:block mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-display font-bold text-primary">Co:Lab</h1>
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
          {/* User info */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-muted transition-colors text-left">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.name || 'User'} />
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {profile ? getInitials(profile.name) : user.email?.[0].toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{profile?.name || user.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile?.role || 'Member'}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => setLocation("/profile/edit")}>
                  <UserCog className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : !loading ? (
            <Link href="/login">
              <Button variant="outline" className="w-full hover:bg-primary/10 hover:border-primary hover:scale-[1.02] hover:shadow-md transition-all">
                Sign In
              </Button>
            </Link>
          ) : null}
        </div>

        {/* Mobile Navigation */}
        <ul className="flex justify-around items-center h-16 md:hidden">
          {mobileNavItems.map((item) => {
            const isActive = location === item.href || (item.href === "/my-profile" && location.startsWith("/my-profile"));
            return (
              <li key={item.href} className="flex-1">
                <Link href={item.href}>
                  <div className={`relative flex flex-col items-center justify-center rounded-xl transition-all duration-200 cursor-pointer ${isActive ? "text-primary font-medium bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                    <div className="relative">
                      <item.icon className={`h-6 w-6 ${isActive ? "stroke-[2.5px]" : "stroke-2"}`} />
                      {item.badge > 0 && (
                        <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                          {item.badge > 9 ? "9+" : item.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] mt-1">{item.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
          {/* Mobile QR Code Button in Nav */}
          <li className="flex-1 flex justify-center">
            <QRCodeButton />
          </li>
        </ul>

        {/* Desktop Navigation */}
        <ul className="hidden md:flex md:flex-col md:space-y-2 md:items-stretch">
          {desktopNavItems.map((item) => {
            const isActive = location === item.href;
            return (
              <li key={item.href}>
                <Link href={item.href}>
                  <div className={`relative flex flex-row items-center justify-start px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer ${isActive ? "text-primary font-medium bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                    <div className="relative">
                      <item.icon className={`h-6 w-6 mr-3 ${isActive ? "stroke-[2.5px]" : "stroke-2"}`} />
                      {item.badge > 0 && (
                        <span className="absolute -top-1 -right-0 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                          {item.badge > 9 ? "9+" : item.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-sm">{item.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Desktop QR Code Button */}
        <div className="hidden md:block mt-auto">
          <QRCodeButton mode="desktop" />
        </div>
      </nav>

      <main className="flex-1 md:pl-64 p-4 md:p-8 max-w-5xl mx-auto w-full animate-in fade-in duration-500">
        {children}
      </main>

      {/* PWA Install Prompt - shows on first login and weekly until installed */}
      <PWAInstallPrompt isLoggedIn={!!user} />
    </div>
  );
}
