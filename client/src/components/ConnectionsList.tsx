import { MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/supabase";

interface ConnectionWithLastMessage {
  profile: Profile;
  lastMessageAt: string | null;
  unreadCount?: number;
}

interface ConnectionsListProps {
  activeChats: ConnectionWithLastMessage[];
  connections: ConnectionWithLastMessage[];
  onMessageClick: (userId: string) => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function ConnectionCard({
  connection,
  onMessageClick,
}: {
  connection: ConnectionWithLastMessage;
  onMessageClick: (userId: string) => void;
}) {
  const { profile, unreadCount } = connection;

  return (
    <div className="flex items-center justify-between p-4 border border-border/50 rounded-xl bg-card hover:bg-muted/50 transition-colors">
      <Link href={`/profile/${profile.id}`}>
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="relative">
            <Avatar className="h-12 w-12">
              <AvatarImage
                src={profile.avatar_url || undefined}
                alt={profile.name}
              />
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {getInitials(profile.name)}
              </AvatarFallback>
            </Avatar>
            {unreadCount && unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </div>
            )}
          </div>
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
        onClick={() => onMessageClick(profile.id)}
      >
        <MessageCircle className="h-4 w-4 mr-2" />
        Message
      </Button>
    </div>
  );
}

export default function ConnectionsList({
  activeChats,
  connections,
  onMessageClick,
}: ConnectionsListProps) {
  const hasActiveChats = activeChats.length > 0;
  const hasConnections = connections.length > 0;

  if (!hasActiveChats && !hasConnections) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <MessageCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="font-semibold text-lg mb-2">No connections yet</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Connect with members in the Directory to start private conversations
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Active Chats Section */}
      {hasActiveChats && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Active Chats
          </h2>
          <div className="space-y-2">
            {activeChats.map((chat) => (
              <ConnectionCard
                key={chat.profile.id}
                connection={chat}
                onMessageClick={onMessageClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Connections Section */}
      {hasConnections && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Connections
          </h2>
          <div className="space-y-2">
            {connections.map((conn) => (
              <ConnectionCard
                key={conn.profile.id}
                connection={conn}
                onMessageClick={onMessageClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
