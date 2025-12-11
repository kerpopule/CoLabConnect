import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { isUserViewing } from "./activeViewers";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configure VAPID
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:hello@colabpensacola.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: {
    type: "dm" | "connection" | "chat" | "profile" | "mention" | "group_invite" | "group_message";
    senderId?: string;
    senderName?: string;
    topicId?: string;
    groupId?: string;
    url?: string;
  };
  actions?: Array<{ action: string; title: string }>;
}

// Send push notification to a specific user
export async function sendPushNotification(
  userId: string,
  payload: NotificationPayload
): Promise<{ success: boolean; sentCount: number; errors: string[] }> {
  const errors: string[] = [];
  let sentCount = 0;

  try {
    // Get all subscriptions for this user
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching subscriptions:", error);
      return { success: false, sentCount: 0, errors: [error.message] };
    }

    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, sentCount: 0, errors: [] };
    }

    // Send to all user's devices
    const sendPromises = subscriptions.map(async (sub: PushSubscription) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload)
        );
        sentCount++;
      } catch (err: any) {
        // If subscription is expired/invalid, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
          errors.push(`Removed expired subscription: ${sub.endpoint}`);
        } else {
          errors.push(`Failed to send to ${sub.endpoint}: ${err.message}`);
        }
      }
    });

    await Promise.all(sendPromises);

    return { success: true, sentCount, errors };
  } catch (err: any) {
    return { success: false, sentCount, errors: [err.message] };
  }
}

// Send notification for a new DM
export async function notifyNewDM(
  receiverId: string,
  senderId: string,
  senderName: string,
  messagePreview: string
): Promise<void> {
  // Check if conversation is muted by receiver
  const { data: dmSettings } = await supabase
    .from("dm_settings")
    .select("muted")
    .eq("user_id", receiverId)
    .eq("other_user_id", senderId)
    .single();

  // If conversation is muted, don't send notification
  if (dmSettings?.muted) {
    return;
  }

  // Check if user has DM notifications enabled
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("dm_notifications")
    .eq("user_id", receiverId)
    .single();

  // Default to enabled if no preference set
  if (prefs && prefs.dm_notifications === false) {
    return;
  }

  await sendPushNotification(receiverId, {
    title: `New message from ${senderName}`,
    body: messagePreview.length > 100 ? messagePreview.slice(0, 97) + "..." : messagePreview,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `dm-${senderId}`,
    requireInteraction: false,
    data: {
      type: "dm",
      senderId,
      senderName,
      url: `/chat?dm=${senderId}`,
    },
    actions: [
      { action: "reply", title: "Reply" },
      { action: "dismiss", title: "Dismiss" },
    ],
  });
}

// Send notification for a new connection request
export async function notifyConnectionRequest(
  receiverId: string,
  senderId: string,
  senderName: string
): Promise<void> {
  // Check if user is currently viewing connection requests (suppress notification)
  if (isUserViewing("connections", "requests", receiverId)) {
    console.log(`[Push] Skipping connection request notification - user ${receiverId} is viewing requests`);
    return;
  }

  // Check if user has connection notifications enabled
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("connection_notifications")
    .eq("user_id", receiverId)
    .single();

  // Default to enabled if no preference set
  if (prefs && prefs.connection_notifications === false) {
    return;
  }

  await sendPushNotification(receiverId, {
    title: "New Connection Request",
    body: `${senderName} wants to connect with you`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `connection-${senderId}`,
    requireInteraction: true,
    data: {
      type: "connection",
      senderId,
      senderName,
      url: `/connections?tab=requests`,
    },
    actions: [
      { action: "view", title: "View Requests" },
      { action: "dismiss", title: "Later" },
    ],
  });
}

// Send notification when a connection request is accepted
export async function notifyConnectionAccepted(
  receiverId: string,
  accepterId: string,
  accepterName: string
): Promise<void> {
  // Check if user is currently viewing the accepter's profile (suppress notification)
  if (isUserViewing("profile", accepterId, receiverId)) {
    console.log(`[Push] Skipping connection accepted notification - user ${receiverId} is viewing profile ${accepterId}`);
    return;
  }

  // Check if user has connection notifications enabled
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("connection_notifications")
    .eq("user_id", receiverId)
    .single();

  // Default to enabled if no preference set
  if (prefs && prefs.connection_notifications === false) {
    return;
  }

  await sendPushNotification(receiverId, {
    title: "Connection Accepted!",
    body: `${accepterName} accepted your connection request`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `connection-accepted-${accepterId}`,
    data: {
      type: "connection",
      senderId: accepterId,
      senderName: accepterName,
      url: `/profile/${accepterId}`,
    },
  });
}

// Send notification for a new message in a followed chat room
export async function notifyFollowedChat(
  topicId: string,
  topicName: string,
  senderId: string,
  senderName: string,
  messagePreview: string
): Promise<void> {
  // Get all users following this topic (except the sender)
  const { data: followers, error } = await supabase
    .from("topic_follows")
    .select("user_id")
    .eq("topic_id", topicId)
    .neq("user_id", senderId);

  if (error || !followers || followers.length === 0) {
    return;
  }

  // Get topic mute settings for all followers
  const followerIds = followers.map((f: { user_id: string }) => f.user_id);
  const { data: topicMuteSettings } = await supabase
    .from("topic_settings")
    .select("user_id, muted")
    .eq("topic_id", topicId)
    .in("user_id", followerIds);

  // Create a set of muted user IDs for fast lookup
  const mutedUserIds = new Set(
    (topicMuteSettings || [])
      .filter((s: { user_id: string; muted: boolean }) => s.muted)
      .map((s: { user_id: string }) => s.user_id)
  );

  // Filter out muted users AND users currently viewing this topic
  const notifiableFollowers = followers.filter(
    (f: { user_id: string }) =>
      !mutedUserIds.has(f.user_id) &&
      !isUserViewing('topic', topicId, f.user_id)
  );

  if (notifiableFollowers.length === 0) {
    return;
  }

  // Send notifications to non-muted followers
  const sendPromises = notifiableFollowers.map((follower: { user_id: string }) =>
    sendPushNotification(follower.user_id, {
      title: `New message in #${topicName}`,
      body: `${senderName}: ${messagePreview.length > 80 ? messagePreview.slice(0, 77) + "..." : messagePreview}`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `chat-${topicId}`,
      requireInteraction: false,
      data: {
        type: "chat",
        senderId,
        senderName,
        topicId,
        url: `/chat`,
      },
    })
  );

  await Promise.all(sendPromises);
}

// Send notification for an emoji reaction on a message
export async function notifyReaction(
  receiverId: string,
  senderId: string,
  senderName: string,
  emoji: string
): Promise<void> {
  // Don't notify yourself
  if (receiverId === senderId) return;

  await sendPushNotification(receiverId, {
    title: `${senderName} reacted ${emoji}`,
    body: "Tap to view the message",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `reaction-${senderId}-${Date.now()}`,
    requireInteraction: false,
    data: {
      type: "dm",
      senderId,
      senderName,
      url: `/chat?dm=${senderId}`,
    },
  });
}

// Send notification for an @mention in chat
export async function notifyMention(
  receiverId: string,
  senderId: string,
  senderName: string,
  topicName: string,
  messagePreview: string
): Promise<void> {
  // Don't notify yourself
  if (receiverId === senderId) return;

  // @mentions should always send notifications (like DMs), regardless of topic follow status
  // This is intentional - mentions are direct and important
  await sendPushNotification(receiverId, {
    title: `${senderName} mentioned you in #${topicName}`,
    body: messagePreview.length > 80 ? messagePreview.slice(0, 77) + "..." : messagePreview,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `mention-${senderId}-${Date.now()}`,
    requireInteraction: true, // Mentions are important, require interaction
    data: {
      type: "mention",
      senderId,
      senderName,
      url: `/chat`,
    },
    actions: [
      { action: "reply", title: "Reply" },
      { action: "dismiss", title: "Dismiss" },
    ],
  });
}

// Send notification for a group chat invite
export async function notifyGroupInvite(
  receiverId: string,
  senderId: string,
  senderName: string,
  groupName: string,
  groupId: string
): Promise<void> {
  // Don't notify yourself
  if (receiverId === senderId) return;

  // Check if user has group notifications enabled (default to DM preference or enabled)
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("dm_notifications")
    .eq("user_id", receiverId)
    .single();

  // Default to enabled if no preference set (use dm_notifications as fallback)
  if (prefs && prefs.dm_notifications === false) {
    return;
  }

  await sendPushNotification(receiverId, {
    title: "Group Chat Invite",
    body: `${senderName} invited you to ${groupName}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `group-invite-${groupId}`,
    requireInteraction: true,
    data: {
      type: "group_invite",
      senderId,
      senderName,
      groupId,
      url: `/chat?tab=groups`,
    },
    actions: [
      { action: "view", title: "View Groups" },
      { action: "dismiss", title: "Later" },
    ],
  });
}

// Send notification for a new message in a group chat
export async function notifyGroupMessage(
  groupId: string,
  groupName: string,
  senderId: string,
  senderName: string,
  messagePreview: string
): Promise<void> {
  // Get all accepted members of this group (except the sender) with muted and notifications settings
  const { data: members, error } = await supabase
    .from("group_chat_members")
    .select("user_id, notifications_enabled, muted")
    .eq("group_id", groupId)
    .eq("status", "accepted")
    .neq("user_id", senderId);

  if (error || !members || members.length === 0) {
    return;
  }

  // Filter to only members who are NOT muted AND have notifications enabled (default to true if not set)
  // AND are not currently viewing the group chat
  const notifiableMembers = members.filter(
    (member: { user_id: string; notifications_enabled: boolean | null; muted: boolean | null }) =>
      !member.muted &&
      member.notifications_enabled !== false &&
      !isUserViewing('group', groupId, member.user_id)
  );

  if (notifiableMembers.length === 0) {
    return;
  }

  // Send notifications to eligible members
  const sendPromises = notifiableMembers.map((member: { user_id: string }) =>
    sendPushNotification(member.user_id, {
      title: `New message in ${groupName}`,
      body: `${senderName}: ${messagePreview.length > 80 ? messagePreview.slice(0, 77) + "..." : messagePreview}`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `group-${groupId}`,
      requireInteraction: false,
      data: {
        type: "group_message",
        senderId,
        senderName,
        groupId,
        url: `/chat?group=${groupId}`,
      },
      actions: [
        { action: "reply", title: "Reply" },
        { action: "dismiss", title: "Dismiss" },
      ],
    })
  );

  await Promise.all(sendPromises);
}

// Send reminder notification for incomplete profiles
export async function notifyIncompleteProfile(userId: string): Promise<void> {
  await sendPushNotification(userId, {
    title: "Complete Your Co:Lab Profile",
    body: "Add a photo, role, and bio to help others connect with you!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "profile-reminder",
    requireInteraction: false,
    data: {
      type: "profile",
      url: "/profile/edit",
    },
    actions: [
      { action: "complete", title: "Complete Now" },
      { action: "dismiss", title: "Later" },
    ],
  });
}

// Send notification when a user is kicked from a topic
export async function notifyTopicKick(
  receiverId: string,
  adminName: string,
  topicName: string
): Promise<void> {
  await sendPushNotification(receiverId, {
    title: "Removed from Topic",
    body: `You have been removed from #${topicName} by ${adminName}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `topic-kick-${Date.now()}`,
    requireInteraction: true,
    data: {
      type: "chat",
      url: `/chat?tab=general`,
    },
  });
}

// Send notification when a user is invited back to a topic
export async function notifyTopicInviteBack(
  receiverId: string,
  adminName: string,
  topicName: string,
  topicId: string
): Promise<void> {
  await sendPushNotification(receiverId, {
    title: "Invited Back to Topic",
    body: `${adminName} has invited you back to #${topicName}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `topic-invite-${topicId}`,
    requireInteraction: false,
    data: {
      type: "chat",
      topicId,
      url: `/chat?tab=general`,
    },
  });
}

// Send notification when a group is renamed
export async function notifyGroupRename(
  groupId: string,
  oldName: string,
  newName: string,
  adminId: string,
  adminName: string
): Promise<void> {
  // Get all accepted members of this group (except the admin who renamed it)
  const { data: members, error } = await supabase
    .from("group_chat_members")
    .select("user_id, notifications_enabled, muted")
    .eq("group_id", groupId)
    .eq("status", "accepted")
    .neq("user_id", adminId);

  if (error || !members || members.length === 0) {
    return;
  }

  // Filter to only members who are NOT muted AND have notifications enabled
  const notifiableMembers = members.filter(
    (member: { user_id: string; notifications_enabled: boolean | null; muted: boolean | null }) =>
      !member.muted && member.notifications_enabled !== false
  );

  if (notifiableMembers.length === 0) {
    return;
  }

  // Send notifications to all notifiable members
  const sendPromises = notifiableMembers.map((member: { user_id: string }) =>
    sendPushNotification(member.user_id, {
      title: "Group Renamed",
      body: `${adminName} renamed the group to "${newName}"`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `group-rename-${groupId}`,
      requireInteraction: false,
      data: {
        type: "group_message",
        groupId,
        url: `/chat?tab=groups`,
      },
    })
  );

  await Promise.all(sendPromises);
}

// Send notification when a user joins a group
export async function notifyGroupMemberJoined(
  groupId: string,
  groupName: string,
  joinedUserId: string,
  joinedUserName: string
): Promise<void> {
  // Get all accepted members of this group (except the user who joined) with muted and notifications settings
  const { data: members, error } = await supabase
    .from("group_chat_members")
    .select("user_id, notifications_enabled, muted")
    .eq("group_id", groupId)
    .eq("status", "accepted")
    .neq("user_id", joinedUserId);

  if (error || !members || members.length === 0) {
    return;
  }

  // Filter to only members who are NOT muted AND have notifications enabled
  const notifiableMembers = members.filter(
    (member: { user_id: string; notifications_enabled: boolean | null; muted: boolean | null }) =>
      !member.muted && member.notifications_enabled !== false
  );

  if (notifiableMembers.length === 0) {
    return;
  }

  // Send notifications to all notifiable members
  const sendPromises = notifiableMembers.map((member: { user_id: string }) =>
    sendPushNotification(member.user_id, {
      title: `${joinedUserName} joined ${groupName}`,
      body: `${joinedUserName} has joined the group chat`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `group-join-${groupId}-${joinedUserId}`,
      requireInteraction: false,
      data: {
        type: "group_message",
        groupId,
        url: `/chat?group=${groupId}`,
      },
    })
  );

  await Promise.all(sendPromises);
}

// Send notification when a group invite is declined
export async function notifyGroupInviteDeclined(
  receiverId: string,
  declinedUserName: string,
  groupName: string
): Promise<void> {
  await sendPushNotification(receiverId, {
    title: "Group Invite Declined",
    body: `${declinedUserName} declined your invite to ${groupName}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `group-invite-declined-${Date.now()}`,
    requireInteraction: false,
    data: {
      type: "group_message",
      url: `/chat?tab=groups`,
    },
  });
}

// Send notification when admin is transferred
export async function notifyGroupAdminTransfer(
  receiverId: string,
  groupName: string,
  groupId: string,
  previousAdminName: string
): Promise<void> {
  await sendPushNotification(receiverId, {
    title: "You're Now Group Admin",
    body: `${previousAdminName} made you the admin of ${groupName}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `group-admin-${groupId}`,
    requireInteraction: true,
    data: {
      type: "group_message",
      groupId,
      url: `/chat?group=${groupId}`,
    },
    actions: [
      { action: "view", title: "View Group" },
      { action: "dismiss", title: "OK" },
    ],
  });
}

// Check and send reminders to users with incomplete profiles who have push notifications enabled
export async function sendIncompleteProfileReminders(): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  try {
    // Get all users who have push subscriptions (meaning they have notifications enabled)
    const { data: usersWithPush, error: subError } = await supabase
      .from("push_subscriptions")
      .select("user_id")
      .order("user_id");

    if (subError || !usersWithPush || usersWithPush.length === 0) {
      return { sent: 0, errors: subError ? [subError.message] : [] };
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(usersWithPush.map(s => s.user_id))];

    // For each user, check if their profile is incomplete
    for (const userId of uniqueUserIds) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, avatar_url, role, bio")
        .eq("id", userId)
        .single();

      if (profileError || !profile) {
        continue;
      }

      // Profile is incomplete if missing avatar, role, OR bio
      const isIncomplete = !profile.avatar_url || !profile.role || !profile.bio;

      if (isIncomplete) {
        try {
          await notifyIncompleteProfile(userId);
          sent++;
        } catch (err: any) {
          errors.push(`Failed to notify ${userId}: ${err.message}`);
        }
      }
    }

    return { sent, errors };
  } catch (err: any) {
    return { sent, errors: [err.message] };
  }
}

// Send reminder notification for pending connection requests
export async function sendPendingConnectionReminders(): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  try {
    // Get all users who have push subscriptions
    const { data: usersWithPush, error: subError } = await supabase
      .from("push_subscriptions")
      .select("user_id")
      .order("user_id");

    if (subError || !usersWithPush || usersWithPush.length === 0) {
      return { sent: 0, errors: subError ? [subError.message] : [] };
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(usersWithPush.map(s => s.user_id))];

    // For each user, check if they have pending connection requests
    for (const userId of uniqueUserIds) {
      const { data: pendingRequests, error: pendingError } = await supabase
        .from("connections")
        .select("id")
        .eq("following_id", userId)
        .eq("status", "pending");

      if (pendingError || !pendingRequests || pendingRequests.length === 0) {
        continue;
      }

      try {
        await sendPushNotification(userId, {
          title: "Pending Connection Requests",
          body: `You have ${pendingRequests.length} connection request${pendingRequests.length > 1 ? "s" : ""} waiting for your response`,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "pending-connections-reminder",
          requireInteraction: false,
          data: {
            type: "connection",
            url: "/connections",
          },
          actions: [
            { action: "view", title: "View Requests" },
            { action: "dismiss", title: "Later" },
          ],
        });
        sent++;
      } catch (err: any) {
        errors.push(`Failed to notify ${userId}: ${err.message}`);
      }
    }

    return { sent, errors };
  } catch (err: any) {
    return { sent, errors: [err.message] };
  }
}

// Send reminder notification for unread messages (DMs, groups, topics)
export async function sendUnreadMessagesReminders(): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  try {
    // Get all users who have push subscriptions
    const { data: usersWithPush, error: subError } = await supabase
      .from("push_subscriptions")
      .select("user_id")
      .order("user_id");

    if (subError || !usersWithPush || usersWithPush.length === 0) {
      return { sent: 0, errors: subError ? [subError.message] : [] };
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(usersWithPush.map(s => s.user_id))];

    // For each user, check if they have unread messages
    for (const userId of uniqueUserIds) {
      let totalUnread = 0;
      const unreadTypes: string[] = [];

      // Check unread DMs (not muted)
      const { data: dmSettings } = await supabase
        .from("dm_settings")
        .select("other_user_id, muted")
        .eq("user_id", userId);

      const mutedDmUsers = new Set(
        (dmSettings || []).filter((s: any) => s.muted).map((s: any) => s.other_user_id)
      );

      const { data: unreadDms } = await supabase
        .from("private_messages")
        .select("id, sender_id")
        .eq("receiver_id", userId)
        .is("read_at", null);

      const filteredDms = (unreadDms || []).filter((dm: any) => !mutedDmUsers.has(dm.sender_id));
      if (filteredDms.length > 0) {
        totalUnread += filteredDms.length;
        unreadTypes.push("direct message");
      }

      // Check unread group messages (not muted)
      const { data: groupMemberships } = await supabase
        .from("group_chat_members")
        .select("group_id, last_read_at, muted")
        .eq("user_id", userId)
        .eq("status", "accepted");

      if (groupMemberships) {
        for (const membership of groupMemberships) {
          if (membership.muted) continue;

          const { count } = await supabase
            .from("group_messages")
            .select("id", { count: "exact", head: true })
            .eq("group_id", membership.group_id)
            .neq("user_id", userId)
            .is("deleted_at", null)
            .gt("created_at", membership.last_read_at || "1970-01-01");

          if (count && count > 0) {
            totalUnread += count;
            if (!unreadTypes.includes("group chat")) {
              unreadTypes.push("group chat");
            }
          }
        }
      }

      // Check unread topic messages (not muted)
      const { data: topicSettings } = await supabase
        .from("topic_settings")
        .select("topic_id, muted")
        .eq("user_id", userId);

      const mutedTopics = new Set(
        (topicSettings || []).filter((s: any) => s.muted).map((s: any) => s.topic_id)
      );

      const { data: topicReadStatus } = await supabase
        .from("topic_read_status")
        .select("topic_id, last_read_at")
        .eq("user_id", userId);

      const readStatusMap: Record<string, string> = {};
      for (const status of topicReadStatus || []) {
        readStatusMap[status.topic_id] = status.last_read_at;
      }

      const { data: topics } = await supabase.from("topics").select("id");

      if (topics) {
        for (const topic of topics) {
          if (mutedTopics.has(topic.id)) continue;

          const lastRead = readStatusMap[topic.id] || "1970-01-01";
          const { count } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("topic_id", topic.id)
            .neq("user_id", userId)
            .is("deleted_at", null)
            .gt("created_at", lastRead);

          if (count && count > 0) {
            totalUnread += count;
            if (!unreadTypes.includes("topic")) {
              unreadTypes.push("topic");
            }
          }
        }
      }

      // Only send notification if there are unread messages
      if (totalUnread > 0) {
        const typeStr = unreadTypes.length > 1
          ? unreadTypes.slice(0, -1).join(", ") + " and " + unreadTypes[unreadTypes.length - 1]
          : unreadTypes[0];

        try {
          await sendPushNotification(userId, {
            title: "Unread Messages",
            body: `You have ${totalUnread} unread ${typeStr} message${totalUnread > 1 ? "s" : ""}`,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: "unread-messages-reminder",
            requireInteraction: false,
            data: {
              type: "chat",
              url: "/chat",
            },
            actions: [
              { action: "view", title: "View Messages" },
              { action: "dismiss", title: "Later" },
            ],
          });
          sent++;
        } catch (err: any) {
          errors.push(`Failed to notify ${userId}: ${err.message}`);
        }
      }
    }

    return { sent, errors };
  } catch (err: any) {
    return { sent, errors: [err.message] };
  }
}
