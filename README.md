# Kizu Web Application

The Kizu Web App is the primary dashboard for managing photos, albums, circles, and settings. It provides a full-featured interface for photo management, sharing, and the Picture Frame display mode.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.3 | UI Framework |
| TypeScript | 5.2.2 | Type Safety |
| Vite | 5.0.8 | Build Tool |
| Tailwind CSS | 3.4.0 | Styling |
| Supabase | 2.39.0 | Backend (Auth, DB, Storage) |
| Firebase | 12.7.0 | Push Notifications |
| React Router | 6.8.0 | Client-side Routing |

## Features

### Core Features
- **Photo Management**: Upload, organize, and view photos/videos
- **Albums**: Create and manage photo albums
- **Circles**: Share albums with groups of people
- **Media Gallery**: Grid view with sorting and filtering
- **Search**: Full-text search across chats and content

### Picture Frame Mode
- Dedicated full-screen photo display
- Configurable slideshow settings (interval, transitions, shuffle)
- Real-time updates when new photos are added
- Settings persistence across sessions

### AI Integration
- Face detection and clustering
- Object recognition
- OCR (text extraction)
- Photo descriptions

### Communication
- Real-time chat/messaging
- Push notifications via Firebase
- Reactions and memories on photos

## Project Structure

```
src/
├── components/              # React components
│   ├── admin/              # Admin dashboard components
│   │   ├── chat/           # Chat interface components
│   │   ├── CirclesManager.tsx
│   │   ├── AlbumsManager.tsx
│   │   ├── UsersManager.tsx
│   │   ├── AccountScreen.tsx
│   │   └── ...
│   ├── ui/                 # Reusable UI components
│   ├── AlbumViewer.tsx     # Public album viewing
│   ├── Dashboard.tsx       # User dashboard
│   ├── FrameMode.tsx       # Picture frame display
│   ├── MediaGallery.tsx    # Photo grid
│   └── Login.tsx           # Authentication
├── services/               # API integration
│   ├── adminApi.ts         # Admin operations (albums, circles, images)
│   ├── aiApi.ts            # AI processing integration
│   ├── chatApi.ts          # Chat backend
│   ├── memoriesApi.ts      # Memories/comments
│   ├── reactionsApi.ts     # Likes and reactions
│   └── pushNotifications.ts # Firebase Cloud Messaging
├── context/                # React Context providers
│   ├── AuthContext.tsx     # Authentication state
│   └── ThemeContext.tsx    # Theme management
├── lib/                    # Core initializations
│   ├── supabase.ts         # Supabase client + DB types
│   └── firebase.ts         # Firebase setup
├── utils/                  # Utility functions
│   └── tokenManager.ts     # Auth token management
├── App.tsx                 # Main routing component
└── main.tsx                # Entry point
```

## Installation

### Prerequisites
- Node.js 18+ (20 recommended)
- npm or yarn
- Docker (optional)

### Quick Start

```bash
# Clone the repository
git clone git@github.com:geoyang/knoxweb.git
cd Kizu-Web

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`

## Environment Variables

Create a `.env` file with the following variables:

```env
# Supabase (Required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# ImageKit - Image CDN (Required for image display)
VITE_IMAGEKIT_URL=https://ik.imagekit.io/your-account
VITE_IMAGEKIT_KEY=your-public-key

# Firebase - Push Notifications (Optional)
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_VAPID_KEY=your-vapid-key

# Kizu AI API (Optional - for AI features)
VITE_AI_API_URL=http://localhost:8000
```

## Development

### Available Scripts

```bash
npm run dev          # Start dev server on port 3000
npm run build        # Production build to dist/
npm run build:strict # TypeScript check + build
npm run preview      # Preview production build
npm run lint         # TypeScript type checking
```

### Docker Development

```bash
# Development with hot reload
docker-compose -f docker-compose.dev.yml up --build

# Production-like build
docker-compose up --build

# Stop all containers
docker-compose down

# View logs
docker-compose logs -f
```

## Deployment

### Vercel (Production)

The app is deployed on Vercel and auto-deploys on push to `main` branch.

**Repository**: `git@github.com:geoyang/knoxweb.git`

```bash
# Manual deploy
npm i -g vercel
vercel --prod
```

### Docker Production

```bash
# Build image
docker build -t kizu-web .

# Run container
docker run -p 3000:3000 --env-file .env kizu-web
```

**Docker Configuration:**
- Base: Node.js 20 Alpine
- Build: `npm ci && npm run build`
- Serve: `npm run preview`

## Architecture

### Authentication Flow
```
1. User enters email
2. Magic link sent via Supabase Auth
3. User clicks link → session established
4. JWT token stored in localStorage
5. Token used for all API calls
```

### Data Flow
```
User Action → React Component → Service Layer → Supabase Edge Function → Database
                                     ↓
                              AI API (optional)
```

### API Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `/` | No | Redirect to dashboard |
| `/login` | No | Authentication |
| `/admin/*` | Yes | Admin dashboard |
| `/frame` | Yes | Picture frame mode |
| `/album/:inviteId` | No | Public album viewing |
| `/album/:inviteId/:albumId` | No | Public album detail |

### Key Services

| Service | File | Purpose |
|---------|------|---------|
| Admin API | `adminApi.ts` | Albums, circles, images CRUD |
| AI API | `aiApi.ts` | Face detection, OCR, descriptions |
| Chat API | `chatApi.ts` | Real-time messaging |
| Memories API | `memoriesApi.ts` | Photo comments/memories |
| Reactions API | `reactionsApi.ts` | Likes and emoji reactions |

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User information |
| `circles` | Sharing groups |
| `circle_users` | Circle membership with roles |
| `albums` | Photo albums |
| `album_assets` | Photos/videos in albums |
| `album_shares` | Album sharing to circles |
| `conversations` | Chat conversations |
| `messages` | Chat messages |

### Role System
- `read_only` - View only access
- `contributor` - Can add photos
- `editor` - Can edit albums
- `admin` - Full control

### Security
- Row Level Security (RLS) enabled on all tables
- Users can only access data they own or are shared with
- Public album access controlled by invitation status

## Theming

The app supports light and dark modes using Tailwind CSS:

```javascript
// tailwind.config.js
darkMode: 'class'
```

**Color Palette:**
- Primary: Indigo (#6366f1)
- Surface Dark: #0f172a
- Surface Elevated: #1e293b

## Troubleshooting

### Common Issues

**CORS Errors**
- Verify `VITE_SUPABASE_URL` is correct
- Check Supabase edge functions allow your origin

**Authentication Issues**
- Clear localStorage: `localStorage.clear()`
- Check Supabase Auth configuration
- Verify magic link email delivery

**Images Not Loading**
- Check ImageKit credentials
- Verify image URLs in browser network tab
- Check CORS settings on ImageKit

**Build Failures**
```bash
npm run lint  # Check for type errors
```

### Performance Notes

Large components that may benefit from code splitting:
- `FrameMode.tsx` (37KB) - Picture frame display
- `AlbumViewer.tsx` (63KB) - Public album view

## Maintenance

### Adding New Features
1. Create component in `src/components/`
2. Add API methods to appropriate service in `src/services/`
3. Update routing in `App.tsx` if adding new pages
4. Add any new env variables to `.env.example`

### Updating Dependencies
```bash
npm update           # Update within semver range
npm outdated        # Check for outdated packages
npm audit           # Check for security issues
```

### Database Migrations
Migrations are managed in the Kizu-Mobile repo under `supabase/migrations/`.

```bash
# Deploy migrations (from Kizu-Mobile directory)
npx supabase db push
```

### Edge Functions
Edge functions are in `Kizu-Mobile/supabase/functions/`. Deploy with:

```bash
npx supabase functions deploy <function-name>
```

## Contributing

1. Create a feature branch from `main`
2. Make changes with proper TypeScript types
3. Run `npm run lint` before committing
4. Test in development environment
5. Submit PR with description of changes

## Related Repositories

| Repository | Purpose |
|------------|---------|
| Kizu-Mobile | React Native mobile app |
| Kizu-Web-Public | Marketing website |
| Kizu-AI | AI processing engine (Docker) |

## Support

For issues and feature requests, contact the development team.

## License

Proprietary - All rights reserved
