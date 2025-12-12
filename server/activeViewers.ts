// In-memory tracking of which users are actively viewing which chats
// This is used to suppress push notifications when a user is already viewing the chat

type ChatKey = string; // Format: "dm:userId" | "group:groupId" | "topic:topicId"
type UserId = string;

interface ViewerEntry {
  userId: UserId;
  lastHeartbeat: number;
}

// Map of chatKey -> Set of viewer entries
const activeViewers = new Map<ChatKey, Map<UserId, ViewerEntry>>();

// Heartbeat timeout in milliseconds (45 seconds - allows 4 missed heartbeats at 10s interval)
const HEARTBEAT_TIMEOUT = 45000;

// Clean up stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [chatKey, viewers] of activeViewers.entries()) {
    for (const [userId, entry] of viewers.entries()) {
      if (now - entry.lastHeartbeat > HEARTBEAT_TIMEOUT) {
        viewers.delete(userId);
      }
    }
    // Remove empty chat entries
    if (viewers.size === 0) {
      activeViewers.delete(chatKey);
    }
  }
}, 10000); // Check every 10 seconds

/**
 * Register a user as actively viewing a chat
 */
export function setViewing(chatType: 'dm' | 'group' | 'topic', chatId: string, userId: string, viewing: boolean): void {
  const chatKey = `${chatType}:${chatId}`;

  if (viewing) {
    if (!activeViewers.has(chatKey)) {
      activeViewers.set(chatKey, new Map());
    }
    activeViewers.get(chatKey)!.set(userId, {
      userId,
      lastHeartbeat: Date.now(),
    });
  } else {
    const viewers = activeViewers.get(chatKey);
    if (viewers) {
      viewers.delete(userId);
      if (viewers.size === 0) {
        activeViewers.delete(chatKey);
      }
    }
  }
}

/**
 * Update heartbeat for a user viewing a chat
 */
export function heartbeat(chatType: 'dm' | 'group' | 'topic', chatId: string, userId: string): void {
  const chatKey = `${chatType}:${chatId}`;
  const viewers = activeViewers.get(chatKey);
  if (viewers && viewers.has(userId)) {
    viewers.get(userId)!.lastHeartbeat = Date.now();
  }
}

/**
 * Check if a user is actively viewing a specific chat
 */
export function isUserViewing(chatType: 'dm' | 'group' | 'topic', chatId: string, userId: string): boolean {
  const chatKey = `${chatType}:${chatId}`;
  const viewers = activeViewers.get(chatKey);
  if (!viewers) return false;

  const entry = viewers.get(userId);
  if (!entry) return false;

  // Check if heartbeat is still valid
  const now = Date.now();
  if (now - entry.lastHeartbeat > HEARTBEAT_TIMEOUT) {
    viewers.delete(userId);
    return false;
  }

  return true;
}

/**
 * Check if a user is viewing a DM with a specific other user
 * For DMs, we need to check if the receiver is viewing their DM with the sender
 */
export function isUserViewingDm(receiverId: string, senderId: string): boolean {
  // The receiver would be viewing dm:senderId
  return isUserViewing('dm', senderId, receiverId);
}

/**
 * Get all users currently viewing a chat (for debugging)
 */
export function getViewers(chatType: 'dm' | 'group' | 'topic', chatId: string): string[] {
  const chatKey = `${chatType}:${chatId}`;
  const viewers = activeViewers.get(chatKey);
  if (!viewers) return [];

  const now = Date.now();
  const activeUsers: string[] = [];

  for (const [userId, entry] of viewers.entries()) {
    if (now - entry.lastHeartbeat <= HEARTBEAT_TIMEOUT) {
      activeUsers.push(userId);
    }
  }

  return activeUsers;
}
