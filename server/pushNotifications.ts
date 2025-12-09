import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

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
      url: `/profile/${senderId}`,
    },
    actions: [
      { action: "view", title: "View Profile" },
      { action: "dismiss", title: "Later" },
    ],
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

  // Send notifications to all followers
  const sendPromises = followers.map((follower: { user_id: string }) =>
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
  // Get all accepted members of this group who have notifications enabled (except the sender)
  const { data: members, error } = await supabase
    .from("group_chat_members")
    .select("user_id, notifications_enabled")
    .eq("group_id", groupId)
    .eq("status", "accepted")
    .neq("user_id", senderId);

  if (error || !members || members.length === 0) {
    return;
  }

  // Filter to only members with notifications enabled (default to true if not set)
  const notifiableMembers = members.filter(
    (member: { user_id: string; notifications_enabled: boolean | null }) =>
      member.notifications_enabled !== false
  );

  if (notifiableMembers.length === 0) {
    return;
  }

  // Send notifications to members with notifications enabled
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
    .select("user_id, notifications_enabled")
    .eq("group_id", groupId)
    .eq("status", "accepted")
    .neq("user_id", adminId);

  if (error || !members || members.length === 0) {
    return;
  }

  // Filter to only members with notifications enabled
  const notifiableMembers = members.filter(
    (member: { user_id: string; notifications_enabled: boolean | null }) =>
      member.notifications_enabled !== false
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
