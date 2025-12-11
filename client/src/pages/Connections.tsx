import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserCheck,
  UserPlus,
  MessageCircle,
  Check,
  X,
  Loader2,
  Users,
  Inbox,
  Trash2,
  MoreHorizontal,
  Clock,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Profile, Connection } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type ConnectionWithProfile = Connection & {
  follower_profile?: Profile;
  following_profile?: Profile;
};

export default function Connections() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [connectionToRemove, setConnectionToRemove] = useState<{ id: string; name: string } | null>(null);
  const [swipedConnection, setSwipedConnection] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);

  // Fetch incoming connection requests (people who want to connect with me)
  const { data: incomingRequests, isLoading: loadingIncoming } = useQuery({
    queryKey: ["connections", "incoming", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("connections")
        .select(`
          *,
          follower_profile:profiles!connections_follower_id_fkey(*)
        `)
        .eq("following_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ConnectionWithProfile[];
    },
    enabled: !!user,
  });

  // Fetch outgoing pending requests (people I've requested to connect with)
  const { data: outgoingPending, isLoading: loadingOutgoing } = useQuery({
    queryKey: ["connections", "outgoing", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("connections")
        .select(`
          *,
          following_profile:profiles!connections_following_id_fkey(*)
        `)
        .eq("follower_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ConnectionWithProfile[];
    },
    enabled: !!user,
  });

  // Fetch my connections (accepted)
  const { data: myConnections, isLoading: loadingConnections } = useQuery({
    queryKey: ["connections", "accepted", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get connections where I'm the follower
      const { data: sent, error: sentError } = await supabase
        .from("connections")
        .select(`
          *,
          following_profile:profiles!connections_following_id_fkey(*)
        `)
        .eq("follower_id", user.id)
        .eq("status", "accepted");

      if (sentError) throw sentError;

      // Get connections where I'm being followed
      const { data: received, error: receivedError } = await supabase
        .from("connections")
        .select(`
          *,
          follower_profile:profiles!connections_follower_id_fkey(*)
        `)
        .eq("following_id", user.id)
        .eq("status", "accepted");

      if (receivedError) throw receivedError;

      // Combine and map to a unified format
      const allConnections: (ConnectionWithProfile & { otherProfile: Profile })[] = [
        ...(sent || []).map((c) => ({
          ...c,
          otherProfile: c.following_profile as Profile,
        })),
        ...(received || []).map((c) => ({
          ...c,
          otherProfile: c.follower_profile as Profile,
        })),
      ];

      // Deduplicate by otherProfile.id (keep the first occurrence)
      const seenIds = new Set<string>();
      const uniqueConnections = allConnections.filter((c) => {
        if (!c.otherProfile?.id) return false;
        if (seenIds.has(c.otherProfile.id)) return false;
        seenIds.add(c.otherProfile.id);
        return true;
      });

      return uniqueConnections;
    },
    enabled: !!user,
  });

  // Real-time subscription for connection changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`connections:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `follower_id=eq.${user.id}`,
        },
        () => {
          // Refetch connections on any change
          queryClient.invalidateQueries({ queryKey: ["connections"] });
          queryClient.invalidateQueries({ queryKey: ["pending-requests-count"] });
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
          // Refetch connections on any change
          queryClient.invalidateQueries({ queryKey: ["connections"] });
          queryClient.invalidateQueries({ queryKey: ["pending-requests-count"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Accept connection request
  const acceptRequest = useMutation({
    mutationFn: async (connectionId: string) => {
      // First, get the connection to know who's involved
      const { data: connection, error: fetchError } = await supabase
        .from("connections")
        .select("*")
        .eq("id", connectionId)
        .single();

      if (fetchError) throw fetchError;

      // Check if we also sent them a request (mutual pending)
      // If so, delete our outgoing request to avoid duplicates
      const { data: ourRequest } = await supabase
        .from("connections")
        .select("id")
        .eq("follower_id", user!.id)
        .eq("following_id", connection.follower_id)
        .maybeSingle();

      if (ourRequest) {
        // Delete our duplicate outgoing request
        await supabase
          .from("connections")
          .delete()
          .eq("id", ourRequest.id);
      }

      // Accept their request
      const { error } = await supabase
        .from("connections")
        .update({ status: "accepted" })
        .eq("id", connectionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["pending-requests-count"] });
      queryClient.invalidateQueries({ queryKey: ["connection-status"] });
      toast({
        title: "Connection accepted!",
        description: "You are now connected.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to accept",
        description: error.message,
      });
    },
  });

  // Decline connection request - deletes the connection so they can request again later
  const declineRequest = useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("id", connectionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["connection-status"] });
      queryClient.invalidateQueries({ queryKey: ["pending-requests-count"] });
      toast({
        title: "Request declined",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to decline",
        description: error.message,
      });
    },
  });

  // Cancel outgoing pending request
  const cancelRequest = useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("id", connectionId);

      if (error) throw error;
      return connectionId;
    },
    onMutate: async (connectionId: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["connections", "outgoing", user?.id] });

      // Snapshot the previous value
      const previousOutgoing = queryClient.getQueryData(["connections", "outgoing", user?.id]);

      // Optimistically remove from the list immediately
      queryClient.setQueryData(
        ["connections", "outgoing", user?.id],
        (old: any) => old?.filter((c: any) => c.id !== connectionId) || []
      );

      return { previousOutgoing };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["connection-status"] });
      queryClient.invalidateQueries({ queryKey: ["my-connections"] });
      toast({
        title: "Request cancelled",
      });
    },
    onError: (error: any, _connectionId, context) => {
      // Rollback on error
      if (context?.previousOutgoing) {
        queryClient.setQueryData(["connections", "outgoing", user?.id], context.previousOutgoing);
      }
      toast({
        variant: "destructive",
        title: "Failed to cancel request",
        description: error.message,
      });
    },
  });

  // Remove connection (delete from both sides)
  const removeConnection = useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("id", connectionId);

      if (error) throw error;
      return connectionId;
    },
    onMutate: async (connectionId: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["connections", "accepted", user?.id] });

      // Snapshot the previous value
      const previousConnections = queryClient.getQueryData(["connections", "accepted", user?.id]);

      // Optimistically remove from the list immediately
      queryClient.setQueryData(
        ["connections", "accepted", user?.id],
        (old: any) => old?.filter((c: any) => c.id !== connectionId) || []
      );

      // Close the dialog and reset swipe state immediately
      setConnectionToRemove(null);
      setSwipedConnection(null);

      return { previousConnections };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["connection-status"] });
      queryClient.invalidateQueries({ queryKey: ["private-chats"] });
      toast({
        title: "Connection removed",
        description: "You are no longer connected.",
      });
    },
    onError: (error: any, _connectionId, context) => {
      // Rollback on error
      if (context?.previousConnections) {
        queryClient.setQueryData(["connections", "accepted", user?.id], context.previousConnections);
      }
      toast({
        variant: "destructive",
        title: "Failed to remove connection",
        description: error.message,
      });
    },
  });

  // Handle touch events for swipe to delete
  const handleTouchStart = (e: React.TouchEvent, connectionId: string) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent, connectionId: string) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    // Swipe left (diff > 0) to show delete button
    if (diff > 50) {
      setSwipedConnection(connectionId);
    } else if (diff < -50) {
      setSwipedConnection(null);
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

  const handleMessage = (userId: string) => {
    setLocation(`/chat?dm=${userId}`);
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Users className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Sign in to view connections</h2>
        <Link href="/login">
          <Button>Sign In</Button>
        </Link>
      </div>
    );
  }

  const incomingCount = incomingRequests?.length || 0;
  const outgoingCount = outgoingPending?.length || 0;

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-display font-bold">Connections</h1>
        <p className="text-muted-foreground">
          Manage your network and connection requests
        </p>
      </div>

      <Tabs defaultValue="connections" className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 p-1 rounded-xl overflow-x-auto">
          <TabsTrigger value="connections" className="rounded-lg flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            <span className="hidden sm:inline">My </span>Connections
            {myConnections && myConnections.length > 0 && (
              <span className="ml-1 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                {myConnections.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="requests" className="rounded-lg flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Requests
            {incomingCount > 0 && (
              <span className="ml-1 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full animate-pulse">
                {incomingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending
            {outgoingCount > 0 && (
              <span className="ml-1 text-xs bg-muted-foreground/20 text-muted-foreground px-2 py-0.5 rounded-full">
                {outgoingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* My Connections Tab */}
        <TabsContent value="connections" className="mt-6">
          {loadingConnections ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : myConnections && myConnections.length > 0 ? (
            <div className="grid gap-4">
              {myConnections.map((connection) => {
                const profile = connection.otherProfile;
                if (!profile) return null;
                const isSwiped = swipedConnection === connection.id;

                return (
                  <ContextMenu key={connection.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        className="relative overflow-hidden"
                        onTouchStart={(e) => handleTouchStart(e, connection.id)}
                        onTouchEnd={(e) => handleTouchEnd(e, connection.id)}
                      >
                        <Card className={`border-border/50 transition-transform duration-200 ${isSwiped ? '-translate-x-20' : ''}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <Link href={`/profile/${profile.id}`}>
                                <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                                  <Avatar className="h-12 w-12">
                                    <AvatarImage src={profile.avatar_url || undefined} alt={profile.name} />
                                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                      {getInitials(profile.name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <h3 className="font-semibold">{profile.name}</h3>
                                    <p className="text-sm text-muted-foreground">
                                      {profile.role || "Member"}
                                    </p>
                                  </div>
                                </div>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full"
                                onClick={() => handleMessage(profile.id)}
                              >
                                <MessageCircle className="h-4 w-4 mr-2" />
                                Message
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                        {/* Swipe reveal delete button */}
                        <button
                          className={`absolute right-0 top-0 bottom-0 w-20 bg-destructive text-destructive-foreground flex items-center justify-center transition-opacity ${isSwiped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                          onClick={() => setConnectionToRemove({ id: connection.id, name: profile.name })}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setConnectionToRemove({ id: connection.id, name: profile.name })}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove Connection
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No connections yet</h3>
              <p className="text-muted-foreground mb-4">
                Browse the directory to connect with other members
              </p>
              <Link href="/directory">
                <Button variant="outline" className="rounded-full">
                  Browse Directory
                </Button>
              </Link>
            </div>
          )}
        </TabsContent>

        {/* Connection Requests Tab */}
        <TabsContent value="requests" className="mt-6">
          {loadingIncoming ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : incomingRequests && incomingRequests.length > 0 ? (
            <div className="grid gap-4">
              {incomingRequests.map((request) => {
                const profile = request.follower_profile;
                if (!profile) return null;

                return (
                  <Card key={request.id} className="border-border/50 border-l-4 border-l-primary">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <Link href={`/profile/${profile.id}`}>
                          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={profile.avatar_url || undefined} alt={profile.name} />
                              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                {getInitials(profile.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h3 className="font-semibold">{profile.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {profile.role || "Member"} wants to connect
                              </p>
                            </div>
                          </div>
                        </Link>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="rounded-full"
                            onClick={() => acceptRequest.mutate(request.id)}
                            disabled={acceptRequest.isPending}
                          >
                            {acceptRequest.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Accept
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() => declineRequest.mutate(request.id)}
                            disabled={declineRequest.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Inbox className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No pending requests</h3>
              <p className="text-muted-foreground">
                When someone wants to connect, you'll see their request here
              </p>
            </div>
          )}
        </TabsContent>

        {/* My Pending Requests Tab (requests I've sent) */}
        <TabsContent value="pending" className="mt-6">
          {loadingOutgoing ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : outgoingPending && outgoingPending.length > 0 ? (
            <div className="grid gap-4">
              {outgoingPending.map((request) => {
                const profile = request.following_profile;
                if (!profile) return null;

                return (
                  <Card key={request.id} className="border-border/50 border-l-4 border-l-muted-foreground/30">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <Link href={`/profile/${profile.id}`}>
                          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={profile.avatar_url || undefined} alt={profile.name} />
                              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                {getInitials(profile.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h3 className="font-semibold">{profile.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {profile.role || "Member"} • Request sent
                              </p>
                            </div>
                          </div>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full text-muted-foreground"
                          onClick={() => cancelRequest.mutate(request.id)}
                          disabled={cancelRequest.isPending}
                        >
                          {cancelRequest.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No pending requests</h3>
              <p className="text-muted-foreground">
                Requests you've sent that are awaiting a response will appear here
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Remove Connection Confirmation Dialog */}
      <AlertDialog open={!!connectionToRemove} onOpenChange={(open) => !open && setConnectionToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {connectionToRemove?.name} from your connections?
              This will remove the connection for both of you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConnectionToRemove(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => connectionToRemove && removeConnection.mutate(connectionToRemove.id)}
              disabled={removeConnection.isPending}
            >
              {removeConnection.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
