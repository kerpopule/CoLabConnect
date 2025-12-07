# Co:Lab Connect

A progressive web app (PWA) for the Co:Lab coworking community in Pensacola, FL. Connect with entrepreneurs, investors, and creative professionals through real-time chat, AI-powered member discovery, and seamless networking.

## Features

- **Member Directory** - Browse and search community members by name, role, or specialty tags
- **Real-time Chat** - Topic-based group chats and private messaging with push notifications
- **AI Assistant** - Gemini-powered helper to discover relevant community members
- **Connection System** - Send/accept connection requests to build your network
- **User Profiles** - Rich profiles with photos, bios, social links, and specialty tags
- **QR Code Sharing** - Share your profile via QR code for in-person networking
- **PWA Support** - Install as a native app with offline capabilities and push notifications
- **Dark/Light Mode** - System-aware theme switching

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Vite 7** for blazing fast builds
- **Tailwind CSS v4** for styling
- **Shadcn/UI** component library (Radix primitives)
- **Wouter** for routing
- **TanStack Query** for data fetching
- **Framer Motion** for animations

### Backend
- **Node.js** with Express
- **Supabase** for PostgreSQL database, auth, realtime, and storage
- **OpenRouter API** with Gemini 2.5 Flash Lite for AI chat
- **Web Push** for notifications

## Project Structure

```
CoLab-Connect/
├── client/                 # Frontend React app
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── ui/         # Shadcn/UI primitives
│   │   │   ├── Layout.tsx  # Main app shell with nav
│   │   │   ├── AIHelper.tsx
│   │   │   └── ...
│   │   ├── pages/          # Route components
│   │   │   ├── Home.tsx
│   │   │   ├── Directory.tsx
│   │   │   ├── Chat.tsx
│   │   │   ├── UserProfile.tsx
│   │   │   └── ...
│   │   ├── contexts/       # React contexts (AuthContext)
│   │   ├── hooks/          # Custom hooks
│   │   ├── lib/            # Utilities and clients
│   │   │   ├── supabase.ts # Supabase client
│   │   │   └── utils.ts
│   │   └── App.tsx         # Root component with routes
│   └── index.html
├── server/
│   ├── index.ts            # Express server entry
│   ├── routes.ts           # API endpoints
│   └── pushNotifications.ts
├── public/                 # Static assets, PWA manifest
└── package.json
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### Environment Variables

Create a `.env` file in the root:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI (OpenRouter)
OPENROUTER_API_KEY=your-openrouter-api-key

# Push Notifications (generate with web-push)
VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
```

### Installation

```bash
# Install dependencies
npm install

# Run development server (frontend + backend)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Database Setup

The app uses Supabase with the following tables:
- `profiles` - User profiles (extends auth.users)
- `topics` - Chat topic rooms
- `messages` - Chat messages
- `private_messages` - Direct messages between users
- `connections` - User connection/follow relationships
- `push_subscriptions` - Web push notification subscriptions
- `topic_follows` - Topic subscription preferences

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/chat` | POST | AI assistant chat |
| `/api/push/subscribe` | POST | Subscribe to push notifications |
| `/api/push/unsubscribe` | POST | Unsubscribe from notifications |
| `/api/notify/dm` | POST | Send DM notification |
| `/api/notify/connection` | POST | Send connection request notification |
| `/api/account` | DELETE | Delete user account |

## Key Features Implementation

### Authentication
Uses Supabase Auth with email/password and Google OAuth. Profile data cached in localStorage for fast loading.

### Real-time Chat
Supabase Realtime subscriptions for instant message delivery. Supports both group topics and private DMs.

### AI Helper
OpenRouter API with Gemini 2.5 Flash Lite. Queries all member profiles and returns contextual recommendations with clickable profile links.

### Push Notifications
Web Push API with VAPID keys. Notifies for new DMs, connection requests, and messages in followed topics.

## License

MIT
