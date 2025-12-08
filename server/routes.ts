import type { Express } from "express";
import { createServer, type Server } from "http";
import { createClient } from "@supabase/supabase-js";
import { log } from "./index";
import { notifyNewDM, notifyConnectionRequest, notifyFollowedChat } from "./pushNotifications";

// Initialize Supabase client with service role key for server-side operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const AI_MODEL = "google/gemini-2.5-flash-lite";

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  tags: string[] | null;
}

// Build context from all profiles for AI
function buildProfileContext(profiles: Profile[]): string {
  if (!profiles || profiles.length === 0) {
    return "No community members found in the database.";
  }

  const profileSummaries = profiles.map((p) => {
    const tags = p.tags?.join(", ") || "none";
    return `- **${p.name}** (ID: ${p.id})
  - Role: ${p.role || "Not specified"}
  - Company: ${p.company || "Not specified"}
  - Bio: ${p.bio || "No bio"}
  - Tags: ${tags}`;
  }).join("\n\n");

  return `## Co:Lab Community Members (${profiles.length} total)

${profileSummaries}`;
}

// System prompt for the AI
const SYSTEM_PROMPT = `You are the Co:Lab AI Assistant, a helpful guide for the Co:Lab Pensacola community - a coworking space for entrepreneurs, investors, and creative professionals.

Your responsibilities:
1. Help users discover relevant community members based on their needs
2. Answer questions about who's in the community
3. Make personalized recommendations when users are looking for specific skills, roles, or expertise
4. Be friendly, concise, and helpful

CRITICAL - Profile Link Format:
When mentioning ANY community member by name, you MUST format their name as a clickable link using this EXACT format:
[Name](/profile/USER_ID)

For example, if someone's ID is "abc-123-def", write: [John Smith](/profile/abc-123-def)

This is REQUIRED for every member mention. Never write just the name without the link.

When recommending people:
- ALWAYS format names as clickable links: [Name](/profile/USER_ID)
- Explain WHY you're recommending each person based on their bio, role, or tags
- If multiple people match, rank them by relevance

Formatting guidelines:
- Use **bold** for important terms (but not for names - names should be links)
- Use bullet points for lists of recommendations
- Keep responses concise but informative

Example format:
"Looking for tech expertise? Here are some great matches:
- [Marcus Johnson](/profile/abc123) - Software Developer with 10 years experience in React
- [Sarah Lee](/profile/def456) - Full-stack engineer focused on AI/ML"

If you can't find relevant matches, be honest and suggest alternative approaches.`;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // AI Chat endpoint
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message, conversationHistory = [] } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === "your-openrouter-api-key-here") {
        return res.status(500).json({ error: "OpenRouter API key not configured" });
      }

      // Fetch all profiles from Supabase
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name, email, role, company, bio, tags")
        .order("created_at", { ascending: false });

      if (profilesError) {
        log(`Error fetching profiles: ${profilesError.message}`);
        return res.status(500).json({ error: "Failed to fetch community data" });
      }

      // Build context from profiles
      const profileContext = buildProfileContext(profiles || []);

      // Build messages array for the API
      const messages = [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\n---\n\n${profileContext}`,
        },
        // Include conversation history for context
        ...conversationHistory.slice(-10).map((msg: { role: string; content: string }) => ({
          role: msg.role === "ai" ? "assistant" : "user",
          content: msg.content,
        })),
        {
          role: "user",
          content: message,
        },
      ];

      // Call OpenRouter API
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://colab-connect.app",
          "X-Title": "Co:Lab Connect",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages,
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log(`OpenRouter API error: ${response.status} - ${errorText}`);
        return res.status(500).json({ error: "AI service error" });
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

      res.json({ response: aiResponse });
    } catch (error: any) {
      log(`AI chat error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // Push Notification Endpoints
  // ============================================

  // Subscribe to push notifications
  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const { userId, subscription } = req.body;

      if (!userId || !subscription) {
        return res.status(400).json({ error: "userId and subscription are required" });
      }

      const { endpoint, keys } = subscription;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: "Invalid subscription format" });
      }

      // Upsert the subscription
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert({
          user_id: userId,
          endpoint: endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "user_id,endpoint",
        });

      if (error) {
        log(`Error saving push subscription: ${error.message}`);
        return res.status(500).json({ error: "Failed to save subscription" });
      }

      log(`Push subscription saved for user ${userId}`);
      res.json({ success: true });
    } catch (error: any) {
      log(`Push subscribe error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Unsubscribe from push notifications
  app.delete("/api/push/subscribe", async (req, res) => {
    try {
      const { userId, endpoint } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      let query = supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId);

      // If endpoint is provided, only delete that subscription
      if (endpoint) {
        query = query.eq("endpoint", endpoint);
      }

      const { error } = await query;

      if (error) {
        log(`Error removing push subscription: ${error.message}`);
        return res.status(500).json({ error: "Failed to remove subscription" });
      }

      log(`Push subscription removed for user ${userId}`);
      res.json({ success: true });
    } catch (error: any) {
      log(`Push unsubscribe error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // Topic Follow Endpoints
  // ============================================

  // Helper to get topic UUID from slug or UUID
  async function getTopicUUID(topicIdOrSlug: string): Promise<string | null> {
    // Check if it's a valid UUID pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(topicIdOrSlug)) {
      return topicIdOrSlug;
    }

    // Look up by slug
    const { data, error } = await supabase
      .from("topics")
      .select("id")
      .eq("slug", topicIdOrSlug)
      .single();

    if (error || !data) {
      return null;
    }

    return data.id;
  }

  // Follow a topic (for chat notifications)
  app.post("/api/topics/:topicId/follow", async (req, res) => {
    try {
      const { topicId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const topicUUID = await getTopicUUID(topicId);
      if (!topicUUID) {
        return res.status(404).json({ error: "Topic not found" });
      }

      const { error } = await supabase
        .from("topic_follows")
        .upsert({
          user_id: userId,
          topic_id: topicUUID,
        }, {
          onConflict: "user_id,topic_id",
        });

      if (error) {
        log(`Error following topic: ${error.message}`);
        return res.status(500).json({ error: "Failed to follow topic" });
      }

      log(`User ${userId} followed topic ${topicId}`);
      res.json({ success: true, following: true });
    } catch (error: any) {
      log(`Topic follow error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Unfollow a topic
  app.delete("/api/topics/:topicId/follow", async (req, res) => {
    try {
      const { topicId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const topicUUID = await getTopicUUID(topicId);
      if (!topicUUID) {
        return res.status(404).json({ error: "Topic not found" });
      }

      const { error } = await supabase
        .from("topic_follows")
        .delete()
        .eq("user_id", userId)
        .eq("topic_id", topicUUID);

      if (error) {
        log(`Error unfollowing topic: ${error.message}`);
        return res.status(500).json({ error: "Failed to unfollow topic" });
      }

      log(`User ${userId} unfollowed topic ${topicId}`);
      res.json({ success: true, following: false });
    } catch (error: any) {
      log(`Topic unfollow error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check if following a topic
  app.get("/api/topics/:topicId/following", async (req, res) => {
    try {
      const { topicId } = req.params;
      const userId = req.query.userId as string;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const topicUUID = await getTopicUUID(topicId);
      if (!topicUUID) {
        // Topic not found in DB - it's a fallback topic, so not following
        return res.json({ following: false });
      }

      const { data, error } = await supabase
        .from("topic_follows")
        .select("id")
        .eq("user_id", userId)
        .eq("topic_id", topicUUID)
        .single();

      if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
        log(`Error checking topic follow: ${error.message}`);
        return res.status(500).json({ error: "Failed to check follow status" });
      }

      res.json({ following: !!data });
    } catch (error: any) {
      log(`Topic follow check error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all followed topics for a user
  app.get("/api/topics/followed", async (req, res) => {
    try {
      const userId = req.query.userId as string;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const { data, error } = await supabase
        .from("topic_follows")
        .select("topic_id")
        .eq("user_id", userId);

      if (error) {
        log(`Error fetching followed topics: ${error.message}`);
        return res.status(500).json({ error: "Failed to fetch followed topics" });
      }

      const topicIds = data?.map((f: { topic_id: string }) => f.topic_id) || [];
      res.json({ topicIds });
    } catch (error: any) {
      log(`Fetch followed topics error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // Account Management Endpoints
  // ============================================

  // Delete user account (requires service role key)
  app.delete("/api/account", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      log(`Attempting to delete account for user: ${userId}`);

      // Delete from auth.users using admin API (this cascades to profiles via FK)
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);

      if (authError) {
        log(`Error deleting auth user: ${authError.message}`);
        return res.status(500).json({ error: `Failed to delete account: ${authError.message}` });
      }

      // Also clean up any push subscriptions
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId);

      // Clean up topic follows
      await supabase
        .from("topic_follows")
        .delete()
        .eq("user_id", userId);

      log(`Successfully deleted account for user: ${userId}`);
      res.json({ success: true });
    } catch (error: any) {
      log(`Account deletion error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // Link Preview Endpoint
  // ============================================

  app.post("/api/link-preview", async (req, res) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // Validate URL format
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Fetch the page with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "CoLab-Connect/1.0 (Link Preview Bot)",
            "Accept": "text/html",
          },
        });

        clearTimeout(timeout);

        if (!response.ok) {
          return res.status(404).json({ error: "Failed to fetch URL" });
        }

        const html = await response.text();

        // Parse meta tags with regex (simple approach, no external deps)
        const getMetaContent = (property: string): string | undefined => {
          // Try og: tags first
          const ogMatch = html.match(new RegExp(`<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']+)["']`, "i"))
            || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${property}["']`, "i"));
          if (ogMatch) return ogMatch[1];

          // Try twitter: tags
          const twitterMatch = html.match(new RegExp(`<meta[^>]*name=["']twitter:${property}["'][^>]*content=["']([^"']+)["']`, "i"))
            || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:${property}["']`, "i"));
          if (twitterMatch) return twitterMatch[1];

          // Try standard meta name
          const metaMatch = html.match(new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`, "i"))
            || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${property}["']`, "i"));
          if (metaMatch) return metaMatch[1];

          return undefined;
        };

        // Get title
        let title = getMetaContent("title");
        if (!title) {
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          title = titleMatch ? titleMatch[1].trim() : undefined;
        }

        // Get description
        const description = getMetaContent("description");

        // Get image
        let image = getMetaContent("image");
        if (image && !image.startsWith("http")) {
          // Convert relative URL to absolute
          image = new URL(image, url).href;
        }

        // Get site name
        const siteName = getMetaContent("site_name");

        // Get favicon
        let favicon: string | undefined;
        const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
          || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
        if (faviconMatch) {
          favicon = faviconMatch[1];
          if (!favicon.startsWith("http")) {
            favicon = new URL(favicon, url).href;
          }
        } else {
          // Default to /favicon.ico
          favicon = `${parsedUrl.origin}/favicon.ico`;
        }

        // Decode HTML entities in title and description
        const decodeEntities = (str: string | undefined): string | undefined => {
          if (!str) return undefined;
          return str
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, " ");
        };

        res.json({
          title: decodeEntities(title),
          description: decodeEntities(description),
          image,
          siteName: decodeEntities(siteName),
          favicon,
        });
      } catch (fetchError: any) {
        clearTimeout(timeout);
        if (fetchError.name === "AbortError") {
          return res.status(408).json({ error: "Request timeout" });
        }
        throw fetchError;
      }
    } catch (error: any) {
      log(`Link preview error: ${error.message}`);
      res.status(500).json({ error: "Failed to fetch link preview" });
    }
  });

  // ============================================
  // Notification Trigger Endpoints (internal use)
  // ============================================

  // Trigger notification for new DM
  app.post("/api/notify/dm", async (req, res) => {
    try {
      const { receiverId, senderId, senderName, messagePreview } = req.body;

      if (!receiverId || !senderId || !senderName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      await notifyNewDM(receiverId, senderId, senderName, messagePreview || "New message");
      res.json({ success: true });
    } catch (error: any) {
      log(`DM notification error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trigger notification for connection request
  app.post("/api/notify/connection", async (req, res) => {
    try {
      const { receiverId, senderId, senderName } = req.body;

      if (!receiverId || !senderId || !senderName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      await notifyConnectionRequest(receiverId, senderId, senderName);
      res.json({ success: true });
    } catch (error: any) {
      log(`Connection notification error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trigger notification for emoji reaction
  app.post("/api/notify/reaction", async (req, res) => {
    try {
      const { receiverId, senderId, senderName, emoji } = req.body;

      if (!receiverId || !senderId || !senderName || !emoji) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Import and use the notification function
      const { notifyReaction } = await import("./pushNotifications");
      await notifyReaction(receiverId, senderId, senderName, emoji);
      res.json({ success: true });
    } catch (error: any) {
      log(`Reaction notification error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trigger notification for new chat message in followed topic
  app.post("/api/notify/chat", async (req, res) => {
    try {
      const { topicId, topicName, senderId, senderName, messagePreview } = req.body;

      if (!topicId || !topicName || !senderId || !senderName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      await notifyFollowedChat(topicId, topicName, senderId, senderName, messagePreview || "New message");
      res.json({ success: true });
    } catch (error: any) {
      log(`Chat notification error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trigger notification for @mentions in chat
  app.post("/api/notify/mention", async (req, res) => {
    try {
      const { topicId, topicName, senderId, senderName, messagePreview, mentionedNames } = req.body;

      if (!topicId || !topicName || !senderId || !senderName || !mentionedNames || !Array.isArray(mentionedNames)) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Look up user IDs by name
      const { data: mentionedProfiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, name")
        .in("name", mentionedNames);

      if (profileError) {
        log(`Error looking up mentioned users: ${profileError.message}`);
        return res.status(500).json({ error: "Failed to look up users" });
      }

      if (!mentionedProfiles || mentionedProfiles.length === 0) {
        return res.json({ success: true, notified: 0 });
      }

      // Send notifications to each mentioned user (except the sender)
      const { notifyMention } = await import("./pushNotifications");
      let notifiedCount = 0;

      for (const profile of mentionedProfiles) {
        if (profile.id !== senderId) {
          try {
            await notifyMention(profile.id, senderId, senderName, topicName, messagePreview || "mentioned you");
            notifiedCount++;
          } catch (err: any) {
            log(`Failed to notify ${profile.name}: ${err.message}`);
          }
        }
      }

      log(`Mention notifications sent: ${notifiedCount}/${mentionedProfiles.length}`);
      res.json({ success: true, notified: notifiedCount });
    } catch (error: any) {
      log(`Mention notification error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // Profile Reminder Notifications
  // ============================================

  // Trigger incomplete profile reminders (call daily via cron or manually)
  app.post("/api/notify/profile-reminders", async (req, res) => {
    try {
      const { sendIncompleteProfileReminders } = await import("./pushNotifications");
      const result = await sendIncompleteProfileReminders();
      log(`Profile reminders sent: ${result.sent}, errors: ${result.errors.length}`);
      res.json(result);
    } catch (error: any) {
      log(`Profile reminder error: ${error.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // Daily Scheduler for Profile Reminders
  // ============================================

  // Schedule daily profile reminder at 10 AM local server time
  const scheduleProfileReminders = () => {
    const now = new Date();
    const targetHour = 10; // 10 AM

    // Calculate time until next 10 AM
    let next10AM = new Date(now);
    next10AM.setHours(targetHour, 0, 0, 0);

    // If it's already past 10 AM today, schedule for tomorrow
    if (now > next10AM) {
      next10AM.setDate(next10AM.getDate() + 1);
    }

    const msUntilNext = next10AM.getTime() - now.getTime();

    log(`Profile reminders scheduled for ${next10AM.toLocaleString()} (in ${Math.round(msUntilNext / 1000 / 60)} minutes)`);

    // Set timeout for first run
    setTimeout(async () => {
      try {
        const { sendIncompleteProfileReminders } = await import("./pushNotifications");
        const result = await sendIncompleteProfileReminders();
        log(`Daily profile reminders sent: ${result.sent}, errors: ${result.errors.length}`);
      } catch (error: any) {
        log(`Daily profile reminder error: ${error.message}`);
      }

      // Then set interval for every 24 hours
      setInterval(async () => {
        try {
          const { sendIncompleteProfileReminders } = await import("./pushNotifications");
          const result = await sendIncompleteProfileReminders();
          log(`Daily profile reminders sent: ${result.sent}, errors: ${result.errors.length}`);
        } catch (error: any) {
          log(`Daily profile reminder error: ${error.message}`);
        }
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilNext);
  };

  // Start the scheduler
  scheduleProfileReminders();

  return httpServer;
}
