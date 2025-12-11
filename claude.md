# Co:Lab Connect - Claude Code Reference

Essential context for AI-assisted development on this codebase.

## Quick Start

```bash
npm run dev     # Start dev server (frontend + backend on port 5000)
npm run build   # Production build
npm start       # Run production server
```

## Architecture Overview

**Monorepo Structure**: Single package.json at root manages both client and server.

```
/client          → React frontend (Vite)
/server          → Express backend (tsx)
/public          → Static assets & PWA manifest
```

**Key Technologies**:
- Frontend: React 19, TypeScript, Vite 7, Tailwind v4, Wouter, TanStack Query
- Backend: Express, Supabase (DB/Auth/Storage/Realtime), OpenRouter AI
- UI: Shadcn/UI components in `/client/src/components/ui/`

## Database Schema (Supabase)

### Core Tables

**profiles** (extends auth.users)
```sql
id UUID PRIMARY KEY REFERENCES auth.users(id)
name TEXT NOT NULL
email TEXT UNIQUE
role TEXT                    -- "Entrepreneur", "Investor", etc.
company TEXT
bio TEXT
avatar_url TEXT
tags TEXT[]                  -- ["Fintech", "Design", "AI"]
social_links JSONB           -- Array of {id, type, url, order}
phone TEXT
show_email BOOLEAN DEFAULT true
show_phone BOOLEAN DEFAULT false
created_at, updated_at TIMESTAMPTZ
```

**messages** (group chat)
```sql
id UUID PRIMARY KEY
topic_id UUID REFERENCES topics(id)
user_id UUID REFERENCES profiles(id)
content TEXT
created_at TIMESTAMPTZ
```

**private_messages** (DMs)
```sql
id UUID PRIMARY KEY
sender_id UUID REFERENCES profiles(id)
receiver_id UUID REFERENCES profiles(id)
content TEXT
read_at TIMESTAMPTZ          -- NULL = unread
created_at TIMESTAMPTZ
```

**connections** (follow/connect system)
```sql
id UUID PRIMARY KEY
follower_id UUID             -- User sending request
following_id UUID            -- User receiving request
status TEXT                  -- 'pending' | 'accepted' | 'rejected'
created_at TIMESTAMPTZ
```

**topics** (chat rooms)
```sql
id UUID PRIMARY KEY
slug TEXT UNIQUE             -- 'general', 'hiring', etc.
name TEXT
icon TEXT                    -- emoji
description TEXT
```

## File Reference

### Pages (`/client/src/pages/`)

| File | Route | Purpose |
|------|-------|---------|
| `Home.tsx` | `/` | Landing page with hero, trending topics |
| `Login.tsx` | `/login` | Email/password + Google OAuth |
| `Directory.tsx` | `/directory` | Member grid with search/filter |
| `Chat.tsx` | `/chat` | Group topics + private DMs |
| `MyProfile.tsx` | `/my-profile` | Current user's profile view |
| `UserProfile.tsx` | `/profile/:id` | Other user's profile |
| `EditProfile.tsx` | `/profile/edit` | Profile editor form |
| `CreateProfile.tsx` | `/create-card` | New user onboarding |
| `Connections.tsx` | `/connections` | Pending/accepted connections |

### Key Components

| File | Purpose |
|------|---------|
| `Layout.tsx` | App shell - sidebar nav, bottom nav, theme toggle |
| `AIHelper.tsx` | Floating AI chat assistant |
| `SocialLinksEditor.tsx` | Drag-drop social link management |
| `ImageCropDialog.tsx` | Avatar upload with crop |
| `QRCodeButton.tsx` | Profile QR code generator |
| `NotificationSettings.tsx` | Push notification preferences |
| `PWAInstallPrompt.tsx` | PWA install banner |

### Core Libraries

| File | Purpose |
|------|---------|
| `lib/supabase.ts` | Supabase client + type exports |
| `lib/utils.ts` | Social platform config, helpers |
| `contexts/AuthContext.tsx` | Auth state + profile caching |
| `hooks/usePushNotifications.ts` | Web Push subscription logic |

### Server (`/server/`)

| File | Purpose |
|------|---------|
| `index.ts` | Express entry, Vite middleware |
| `routes.ts` | API endpoints (AI, push, account) |
| `pushNotifications.ts` | Web Push sending logic |

## Common Patterns

### Auth Context Usage
```tsx
const { user, profile, signOut, loading } = useAuth();
// user = Supabase auth user
// profile = profiles table row (cached in localStorage)
```

### Supabase Queries
```tsx
// Client-side (with anon key)
import { supabase } from "@/lib/supabase";
const { data } = await supabase.from("profiles").select("*");

// Server-side (with service role key) - in /server/routes.ts
const supabase = createClient(url, serviceRoleKey);
await supabase.auth.admin.deleteUser(userId);
```

### Real-time Subscriptions
```tsx
const channel = supabase
  .channel("messages")
  .on("postgres_changes", {
    event: "INSERT",
    schema: "public",
    table: "messages",
    filter: `topic_id=eq.${topicId}`,
  }, (payload) => {
    // Handle new message
  })
  .subscribe();
```

### TanStack Query Pattern
```tsx
const { data, isLoading } = useQuery({
  queryKey: ["profiles"],
  queryFn: async () => {
    const { data } = await supabase.from("profiles").select("*");
    return data;
  },
});
```

## Social Links System

Stored in `profiles.social_links` as JSONB array:
```typescript
interface SocialLink {
  id: string;        // UUID
  type: SocialPlatformType;  // 'linkedin' | 'twitter' | 'instagram' | etc.
  url: string;
  order: number;     // For drag-drop ordering
}
```

Supported platforms defined in `lib/utils.ts`:
- linkedin, twitter, instagram, github, youtube, spotify, facebook, dribbble, behance, website

## Environment Variables

```env
# Required - Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only

# Supabase Management API (for running migrations/SQL via CLI)
SUPABASE_ACCESS_TOKEN=sbp_...     # Found in .env, used for schema changes

# Optional - AI
OPENROUTER_API_KEY=sk-or-...

# Optional - Push Notifications
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

## Styling Conventions

- **Tailwind v4** with CSS variables for theming
- Color tokens in `/client/src/index.css`: `--primary`, `--secondary`, `--background`
- Fonts: `Outfit` (headings), `DM Sans` (body)
- Dark mode: Toggle adds `dark` class to `<html>`

### Common Classes
```tsx
// Hover effects pattern
className="hover:scale-105 hover:shadow-lg hover:brightness-110 transition-all"

// Card styling
className="rounded-2xl border border-border shadow-sm"

// Button with ring focus
className="rounded-full focus:ring-2 focus:ring-primary/20"
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/chat` | POST | AI assistant chat (Gemini via OpenRouter) |
| `/api/push/subscribe` | POST | Subscribe to push notifications |
| `/api/push/unsubscribe` | POST | Unsubscribe from notifications |
| `/api/notify/dm` | POST | Send DM notification |
| `/api/notify/connection` | POST | Send connection request notification |
| `/api/account` | DELETE | Delete user account (requires service role) |

## Common Tasks

### Add new page
1. Create component in `/client/src/pages/NewPage.tsx`
2. Add route in `/client/src/App.tsx`
3. Optionally add nav link in `/client/src/components/Layout.tsx`

### Add API endpoint
1. Add handler in `/server/routes.ts`
2. Call from frontend using fetch or add to TanStack Query

### Add UI component
1. Use existing Shadcn components from `/client/src/components/ui/`
2. Or add new via: `npx shadcn-ui@latest add [component]`

### Modify profile fields
1. Update Supabase table (SQL or dashboard)
2. Update `Profile` interface in `/client/src/lib/supabase.ts`
3. Update relevant forms and display components

## Known Gotchas

1. **Profile caching**: Auth context caches profile in localStorage. Clear with `localStorage.removeItem("colab_profile_cache")` when debugging

2. **Service role key**: Required for admin operations (delete user). Never expose client-side.

3. **Avatar storage**: Uses Supabase Storage bucket `avatars`. URLs include cache-busting query param.

4. **Social links migration**: Old format was object `{linkedin: "url"}`, new is array. `migrateOldSocialLinks()` in utils.ts handles conversion.

5. **Push notifications**: Require HTTPS in production. VAPID keys generated once and reused.

## Supabase Project

- **URL**: `https://oyneqfcajnioyipoixix.supabase.co`
- **Region**: us-east-1

## Design System

- **Primary**: Teal (`--primary` in HSL)
- **Secondary**: Coral (`--secondary`)
- **Typography**: Outfit (headings), DM Sans (body)
- **Border Radius**: Generally `rounded-xl` or `rounded-2xl`
- **Shadows**: `shadow-sm` for cards, `shadow-lg` on hover

## Production Deployment

### Architecture

The production server runs on DigitalOcean with:
- **Caddy** (reverse proxy in Docker) handles HTTPS/SSL for `colabconnect.app`
- **colab-connect** Docker container serves the app on port 3000
- Caddy routes traffic to the container via Docker network `n8n-docker-caddy_default`

```
Internet → Caddy (ports 80/443) → Docker network → colab-connect:3000
```

### Server Access

```bash
ssh colab-droplet   # Uses ~/.ssh/id_ed25519_digitalocean
# Server IP: 104.131.176.167
# Project path: /root/CoLabConnect
```

### Deployment Steps (REQUIRED)

**IMPORTANT**: Code changes require rebuilding the Docker container. Just pushing to git or running `npm run build` is NOT enough.

```bash
# 1. Commit and push changes locally
git add . && git commit -m "Your message" && git push

# 2. SSH into server
ssh colab-droplet

# 3. Pull latest code
cd /root/CoLabConnect && git pull

# 4. Stop and remove old container
docker stop colab-connect && docker rm colab-connect

# 5. Rebuild Docker image (includes npm install + build)
source .env && docker build \
  --build-arg VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
  --build-arg VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
  --build-arg VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY \
  -t colab-connect .

# 6. Start new container ON THE CADDY NETWORK
docker run -d \
  --name colab-connect \
  -p 5000:3000 \
  --network n8n-docker-caddy_default \
  --env-file .env \
  colab-connect

# 7. Verify it's running
docker logs colab-connect --tail 10
curl -sI https://colabconnect.app | head -5
```

### Common Deployment Mistakes

1. **Only running `npm run build`** - The Docker container has its own filesystem. Builds on the host don't affect it.

2. **Forgetting `--network n8n-docker-caddy_default`** - Caddy uses container DNS names. Without the network, Caddy can't reach the container and returns 502.

3. **Not pulling git changes first** - Docker builds from the local filesystem, not from git directly.

4. **Container port confusion** - The Dockerfile uses port 3000 internally. We map external 5000 to internal 3000, but Caddy connects to port 3000 via Docker DNS.

### Checking Deployment Status

```bash
# Check container is running
docker ps | grep colab-connect

# Check container logs
docker logs colab-connect --tail 50

# Check Caddy can reach it
docker exec n8n-docker-caddy-caddy-1 wget -qO- http://colab-connect:3000 | head -5

# Check from outside
curl -sI https://colabconnect.app
```

### Rollback

```bash
# If deployment fails, the old image might still exist
docker images | grep colab-connect

# Re-run previous image by tag (if you tagged it)
docker run -d --name colab-connect -p 5000:3000 \
  --network n8n-docker-caddy_default \
  --env-file .env \
  colab-connect:previous
```

### Caddyfile Location

The Caddy config is at `/opt/n8n-docker-caddy/caddy_config/Caddyfile`

```
colabconnect.app {
    reverse_proxy colab-connect:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote}
        header_up X-Forwarded-For {remote}
        header_up X-Forwarded-Proto {scheme}
    }
    encode gzip
    ...
}
```

## Testing Considerations

- No test framework currently configured
- Key flows to test:
  1. Auth (signup, login, logout, OAuth callback)
  2. Profile CRUD (create, edit, delete account)
  3. Connections (send, accept, reject)
  4. Chat (messages, DMs, realtime)
  5. Push notifications (subscribe, receive)
