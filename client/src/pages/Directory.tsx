import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, UserPlus, UserCheck, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Profile, Connection } from "@/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { SocialLinksDisplay } from "@/components/SocialLinksEditor";
import { migrateOldSocialLinks } from "@/lib/utils";
import { OnlineIndicator } from "@/components/OnlineIndicator";

// Fallback mock data for when database is empty
const MOCK_USERS: Partial<Profile>[] = [
  {
    id: "mock-1",
    name: "Alex Rivera",
    role: "Founder & CEO",
    company: "FinFlow",
    bio: "Building the future of seamless payments for local businesses. Looking for a technical co-founder.",
    avatar_url: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=200&h=200",
    tags: ["Fintech", "Founder", "Sales"],
    email: "alex@example.com",
    social_links: { linkedin: "https://linkedin.com" },
  },
  {
    id: "mock-2",
    name: "Sarah Chen",
    role: "UX Designer",
    company: "Freelance",
    bio: "Product designer with 5 years experience in SaaS. I help startups turn complex problems into simple interfaces.",
    avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200&h=200",
    tags: ["Design", "UX/UI", "Web"],
    email: "sarah@example.com",
  },
  {
    id: "mock-3",
    name: "Marcus Johnson",
    role: "Angel Investor",
    company: "Gulf Coast Ventures",
    bio: "Investing in early-stage tech in the Panhandle. Interested in HealthTech and EdTech.",
    avatar_url: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200&h=200",
    tags: ["Investor", "Mentor", "HealthTech"],
    email: "marcus@example.com",
  },
];

export default function Directory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"connections" | "oldest" | "alphabetical">(() => {
    return (localStorage.getItem("colab_directory_sort") as "connections" | "oldest" | "alphabetical") || "connections";
  });
  const { user, profile: myProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch profiles from Supabase
  const { data: profiles, isLoading, error, isError } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching profiles:", error);
        throw error;
      }
      return data as Profile[];
    },
    retry: 1,
    staleTime: 30000, // 30 seconds
  });

  // Fetch user's connections to show connection status
  const { data: myConnections } = useQuery({
    queryKey: ["my-connections", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get all connections where I'm involved
      const { data, error } = await supabase
        .from("connections")
        .select("*")
        .or(`follower_id.eq.${user.id},following_id.eq.${user.id}`);

      if (error) {
        console.error("Error fetching connections:", error);
        return [];
      }
      return data as Connection[];
    },
    enabled: !!user,
    staleTime: 5000, // 5 seconds - ensures fresh data on navigation/refresh
  });

  // Fetch connection counts for all users (accepted connections only)
  const { data: connectionCounts = {} } = useQuery({
    queryKey: ["connection-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connections")
        .select("follower_id, following_id")
        .eq("status", "accepted");

      if (error) return {};

      // Count connections per user (both directions)
      const counts: Record<string, number> = {};
      for (const conn of data || []) {
        counts[conn.follower_id] = (counts[conn.follower_id] || 0) + 1;
        counts[conn.following_id] = (counts[conn.following_id] || 0) + 1;
      }
      return counts;
    },
    staleTime: 30000, // 30 seconds
  });

  // Persist sort preference
  useEffect(() => {
    localStorage.setItem("colab_directory_sort", sortBy);
  }, [sortBy]);

  // Helper to get connection status with a user
  const getConnectionStatus = (profileId: string): "none" | "pending" | "connected" => {
    if (!user || !myConnections) return "none";

    // Find all connections with this user (there might be duplicates from bugs)
    const connections = myConnections.filter(
      (c) =>
        (c.follower_id === user.id && c.following_id === profileId) ||
        (c.following_id === user.id && c.follower_id === profileId)
    );

    if (connections.length === 0) return "none";

    // If ANY connection is accepted, show as connected (handles duplicates)
    if (connections.some(c => c.status === "accepted")) return "connected";

    // Otherwise if any is pending, show pending
    if (connections.some(c => c.status === "pending")) return "pending";

    return "none";
  };

  // Real-time subscription for connection changes
  useEffect(() => {
    if (!user) return;

    // Force immediate refetch for real-time updates (decline, accept, etc.)
    const invalidateAllConnectionQueries = () => {
      // Use refetchQueries for immediate update on this page's data
      queryClient.refetchQueries({ queryKey: ["my-connections", user.id] });
      queryClient.refetchQueries({ queryKey: ["my-connections"] });
      // Invalidate other queries for cross-page updates
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["connections", "outgoing", user.id] });
      queryClient.invalidateQueries({ queryKey: ["connections", "accepted", user.id] });
      queryClient.invalidateQueries({ queryKey: ["connection-status"] });
    };

    const channel = supabase
      .channel(`directory-connections:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `follower_id=eq.${user.id}`,
        },
        () => {
          // When I'm the requester and status changes (e.g., other user accepts/declines)
          invalidateAllConnectionQueries();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `following_id=eq.${user.id}`,
        },
        () => {
          // When I'm the receiver and something changes
          invalidateAllConnectionQueries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Use mock data if no profiles exist yet
  const displayProfiles = profiles && profiles.length > 0 ? profiles : MOCK_USERS;

  const allTags = Array.from(
    new Set(displayProfiles.flatMap((u) => u.tags || []))
  );

  const filteredUsers = displayProfiles.filter((profile) => {
    const matchesSearch =
      profile.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      profile.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      profile.tags?.some((t) =>
        t.toLowerCase().includes(searchTerm.toLowerCase())
      );
    const matchesTag = selectedTag
      ? profile.tags?.includes(selectedTag)
      : true;
    return matchesSearch && matchesTag;
  });

  // Sort filtered users based on sortBy state
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    switch (sortBy) {
      case "connections":
        return (connectionCounts[b.id!] || 0) - (connectionCounts[a.id!] || 0);
      case "oldest":
        return new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime();
      case "alphabetical":
        const aFirst = (a.name || "").split(" ")[0].toLowerCase();
        const bFirst = (b.name || "").split(" ")[0].toLowerCase();
        return aFirst.localeCompare(bFirst);
      default:
        return 0;
    }
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Send connection request mutation
  const sendConnectionRequest = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Check if target user already sent us a pending request (mutual request case)
      const { data: theirRequest } = await supabase
        .from("connections")
        .select("id")
        .eq("follower_id", targetUserId)
        .eq("following_id", user.id)
        .eq("status", "pending")
        .maybeSingle();

      if (theirRequest) {
        // They already requested us - accept their request instead of creating a new one
        const { error } = await supabase
          .from("connections")
          .update({ status: "accepted" })
          .eq("id", theirRequest.id);

        if (error) throw error;
        return { wasAccepted: true, targetUserId };
      }

      // No pending request from them, create a new request
      const { error } = await supabase.from("connections").insert({
        follower_id: user.id,
        following_id: targetUserId,
        status: "pending",
      } as any);

      if (error) throw error;
      return { wasAccepted: false, targetUserId };
    },
    onSuccess: (result) => {
      // Invalidate ALL connection queries everywhere for real-time consistency
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["my-connections"] });
      queryClient.invalidateQueries({ queryKey: ["pending-requests-count"] });
      queryClient.invalidateQueries({ queryKey: ["connection-status"] });

      if (result?.wasAccepted) {
        toast({
          title: "Connected!",
          description: "They had already requested you - you're now connected!",
        });
      } else {
        toast({
          title: "Connection request sent!",
          description: "You'll be notified when they respond.",
        });

        // Send push notification to the recipient
        if (result?.targetUserId && user && myProfile) {
          fetch("/api/notify/connection", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              receiverId: result.targetUserId,
              senderId: user.id,
              senderName: myProfile.name,
            }),
          }).catch(console.error);
        }
      }
    },
    onError: (error: any) => {
      if (error.message.includes("duplicate")) {
        toast({
          title: "Already requested",
          description: "You've already sent a connection request to this person.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to send request",
          description: error.message,
        });
      }
    },
  });

  const handleConnect = async (targetUserId: string) => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Sign in required",
        description: "Please sign in to connect with other members.",
      });
      return;
    }

    sendConnectionRequest.mutate(targetUserId);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading community members...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-muted-foreground">Failed to load members. Showing sample data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Directory</h1>
          <p className="text-muted-foreground">
            Discover {displayProfiles.length} members in the community
          </p>
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as "connections" | "oldest" | "alphabetical")}>
          <SelectTrigger className="w-[160px] rounded-xl">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="connections">Most Connections</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="alphabetical">A-Z (First Name)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-4 sticky top-0 bg-background/95 backdrop-blur-md z-30 py-4 -mx-4 px-4 md:static md:p-0 md:bg-transparent">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, role, or skill..."
            className="pl-10 h-12 rounded-xl bg-card border-border shadow-sm focus:ring-2 focus:ring-primary/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Horizontal Scroll Tags */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <Button
            variant={selectedTag === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTag(null)}
            className="rounded-full"
          >
            All
          </Button>
          {allTags.map((tag) => (
            <Button
              key={tag}
              variant={selectedTag === tag ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
              className="rounded-full whitespace-nowrap"
            >
              {tag}
            </Button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedUsers.map((profile, index) => (
          <motion.div
            key={profile.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group relative bg-card rounded-2xl p-5 border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1 flex flex-col h-full"
          >
            <div className="flex items-start justify-between mb-4">
              <Link href={`/profile/${profile.id}`}>
                <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                  <div className="relative">
                    <Avatar className="w-14 h-14 border-2 border-white dark:border-gray-800 shadow-sm">
                      <AvatarImage
                        src={profile.avatar_url || undefined}
                        alt={profile.name || ""}
                      />
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {getInitials(profile.name || "?")}
                      </AvatarFallback>
                    </Avatar>
                    <OnlineIndicator userId={profile.id!} className="absolute bottom-0 right-0" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight hover:text-primary transition-colors">
                      {profile.name}
                    </h3>
                    <p className="text-sm text-primary font-medium">
                      {profile.role || "Member"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {connectionCounts[profile.id!] || 0} Connections
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            <p className="text-muted-foreground text-sm mb-4 line-clamp-2 flex-grow">
              {profile.bio || "No bio yet."}
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {(profile.tags || []).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 pointer-events-none"
                >
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="pt-4 border-t border-border space-y-3 mt-auto">
              {/* Social Links - 3x2 grid layout */}
              <div className="flex justify-center">
                <SocialLinksDisplay
                  links={migrateOldSocialLinks(profile.social_links)}
                  maxDisplay={6}
                  size="sm"
                  layout="grid"
                />
              </div>

              {/* Connection Button - below social links */}
              <div className="flex justify-center">
                {(() => {
                  const status = getConnectionStatus(profile.id!);
                  const isMe = profile.id === user?.id;

                  if (isMe) {
                    return (
                      <Button size="sm" className="rounded-full text-xs h-8 px-4" disabled>
                        You
                      </Button>
                    );
                  }

                  if (status === "connected") {
                    return (
                      <Button size="sm" variant="secondary" className="rounded-full text-xs h-8 px-4" disabled>
                        <UserCheck className="h-3 w-3 mr-1" />
                        Connected
                      </Button>
                    );
                  }

                  if (status === "pending") {
                    return (
                      <Button size="sm" variant="outline" className="rounded-full text-xs h-8 px-4" disabled>
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Button>
                    );
                  }

                  return (
                    <Button
                      size="sm"
                      className="rounded-full text-xs h-8 px-4 hover:scale-105 hover:shadow-md hover:brightness-110 transition-all"
                      onClick={() => handleConnect(profile.id!)}
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      Connect
                    </Button>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p>No members found matching your criteria.</p>
          <Button
            variant="link"
            onClick={() => {
              setSearchTerm("");
              setSelectedTag(null);
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
