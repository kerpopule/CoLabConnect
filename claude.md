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

## Supabase Projects

### Production
- **URL**: `https://oyneqfcajnioyipoixix.supabase.co`
- **Project**: Co:Lab Connect
- **Region**: West US (Oregon)
- **Env file**: `.env`

### Staging (Two Modes)

**Default Mode** - Uses production Supabase (same data):
- **Env file**: `.env.staging`
- **Deploy**: `./deploy.sh`
- **Use for**: Code changes, UI fixes, new features, bug fixes
- Tests with real groups, DMs, connections, profiles

**Isolated Mode** - Uses separate Supabase (empty database):
- **URL**: `https://aktexrswaugzdmisxoun.supabase.co`
- **Env file**: `.env.staging-isolated`
- **Deploy**: `./deploy.sh --isolated`
- **Dashboard**: https://supabase.com/dashboard/project/aktexrswaugzdmisxoun
- **Use for**: Schema changes, migrations, destructive testing

### When to Use Isolated Mode

Use `./deploy.sh --isolated` ONLY when:
1. Testing database schema changes (new tables, columns, indexes)
2. Testing migrations before applying to production
3. Testing destructive operations that could corrupt data
4. Need a clean slate without real user data

For everything else (99% of deploys), use the default `./deploy.sh` which gives you real data to test with.

## Design System

- **Primary**: Teal (`--primary` in HSL)
- **Secondary**: Coral (`--secondary`)
- **Typography**: Outfit (headings), DM Sans (body)
- **Border Radius**: Generally `rounded-xl` or `rounded-2xl`
- **Shadows**: `shadow-sm` for cards, `shadow-lg` on hover

## Production Deployment (Blue-Green)

### Architecture

The production server runs on DigitalOcean with **blue-green deployment** for zero-downtime releases:

- **Caddy** (reverse proxy in Docker) handles HTTPS/SSL
- **Two containers**: `colab-blue` and `colab-green` (one is production, one is staging)
- **Zero-downtime switching**: Caddy restart swaps which container serves production
- **Same database by default**: Staging uses production Supabase for realistic testing with real data
- **Isolated mode available**: Use `--isolated` flag for schema changes

```
Internet → Caddy (ports 80/443) → Docker network
                                    ├── colab-blue:3000  (production OR staging)
                                    └── colab-green:3000 (staging OR production)
```

**URLs**:
- Production: `https://colabconnect.app`
- Staging: `https://staging.colabconnect.app`

### Server Access

```bash
ssh colab-droplet   # Uses ~/.ssh/id_ed25519_digitalocean
# Server IP: 104.131.176.167
# Project path: /root/CoLabConnect
# Deploy scripts: /root/CoLabConnect/deploy/
```

### Deployment Workflow (Zero-Downtime)

**Standard deployment process**:

```bash
# 1. Commit and push changes locally
git add . && git commit -m "Your message" && git push

# 2. SSH into server
ssh colab-droplet

# 3. Deploy to staging (does NOT affect production)
cd /root/CoLabConnect/deploy
./deploy.sh

# 4. Test at https://staging.colabconnect.app
#    - Verify features work
#    - Check for errors in logs: docker logs colab-green --tail 50

# 5. When satisfied, promote to production (instant, zero-downtime)
./promote.sh
```

### Deploy Scripts Reference

| Script | Purpose |
|--------|---------|
| `deploy/setup-blue-green.sh` | One-time setup (already done) |
| `deploy/deploy.sh` | Deploy to staging (uses production database) |
| `deploy/deploy.sh --isolated` | Deploy to staging with isolated database (for schema changes) |
| `deploy/promote.sh` | Promote staging to production (zero-downtime) |
| `deploy/status.sh` | Show current deployment status |

### How Blue-Green Works

1. **Two containers always available**: `colab-blue` and `colab-green`
2. **One is production**, one is staging (tracked in `/opt/n8n-docker-caddy/caddy_config/active_color`)
3. **deploy.sh** always deploys to the NON-production container
4. **promote.sh** updates Caddy config and reloads (zero-downtime switch)
5. **Instant rollback**: Just run `promote.sh` again to swap back

### Check Deployment Status

```bash
# On server
cd /root/CoLabConnect/deploy
./status.sh

# Or manually
docker ps | grep colab-       # See running containers
cat /opt/n8n-docker-caddy/caddy_config/active_color  # Current production color
```

### Rollback

If something goes wrong after promoting:

```bash
# Instant rollback - just promote again (swaps back to previous)
./promote.sh
```

The old production container is still running as the new "staging", so rollback is instant.

### One-Time Setup (Already Done)

If you need to set up blue-green on a fresh server:

```bash
# Only run this ONCE when first setting up blue-green deployment
cd /root/CoLabConnect/deploy
./setup-blue-green.sh
```

This:
1. Renames `colab-connect` to `colab-blue`
2. Updates Caddyfile to reference `colab-blue`
3. Adds staging subdomain configuration
4. Creates tracking files

### DNS Requirements

Ensure these DNS records exist (both point to same IP):
- `colabconnect.app` → `104.131.176.167`
- `staging.colabconnect.app` → `104.131.176.167`

### Caddyfile Location

```
/opt/n8n-docker-caddy/caddy_config/Caddyfile
```

Managed automatically by `promote.sh`. Don't edit manually unless necessary.

## Testing Considerations

- No test framework currently configured
- Key flows to test:
  1. Auth (signup, login, logout, OAuth callback)
  2. Profile CRUD (create, edit, delete account)
  3. Connections (send, accept, reject)
  4. Chat (messages, DMs, realtime)
  5. Push notifications (subscribe, receive)
