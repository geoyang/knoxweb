# Knox Web Application

A React-based web application for managing Knox photo circles and providing public album viewing.

## Features

- **Admin Dashboard**: Comprehensive management interface for circles, albums, users, and invitations
- **Public Album Viewing**: Unauthenticated access to shared albums via invite links
- **Role-based Access Control**: Different permission levels (read-only, contributor, editor, admin)
- **Real-time Data**: Live updates using Supabase real-time subscriptions

## Development Setup

### Prerequisites
- Node.js 20+ (recommended)
- npm or yarn
- Docker (optional)

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000`

### Docker Development

For a consistent development environment using Docker:

1. **Development with hot reload:**
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

2. **Production-like build:**
   ```bash
   docker-compose up --build
   ```

3. **With nginx proxy:**
   ```bash
   docker-compose --profile production up --build
   ```

### Docker Commands

- **Build development container:**
  ```bash
  docker build -f Dockerfile.dev -t knox-web-dev .
  ```

- **Run development container:**
  ```bash
  docker run -p 3000:3000 -v $(pwd):/app -v /app/node_modules knox-web-dev
  ```

- **Stop all containers:**
  ```bash
  docker-compose down
  ```

- **View logs:**
  ```bash
  docker-compose logs -f knox-web-dev
  ```

## Project Structure

```
src/
├── components/
│   ├── admin/          # Admin panel components
│   │   ├── CirclesManager.tsx
│   │   ├── AlbumsManager.tsx
│   │   ├── UsersManager.tsx
│   │   └── InvitesManager.tsx
│   ├── AlbumViewer.tsx # Public album viewing
│   ├── Login.tsx       # Authentication
│   └── AdminDashboard.tsx
├── context/
│   └── AuthContext.tsx # Authentication context
├── lib/
│   └── supabase.ts     # Supabase client setup
└── App.tsx             # Main application component
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Environment Variables

Required environment variables:

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key

## Deployment

### AWS Amplify
1. Connect your GitHub repository to AWS Amplify
2. Set environment variables in Amplify console
3. Deploy automatically on push to main branch

### Docker Production
```bash
docker build -t knox-web .
docker run -p 3000:3000 --env-file .env knox-web
```

## API Routes

- `/` - Redirects to admin dashboard
- `/login` - Admin login
- `/admin/*` - Admin dashboard (requires authentication)
- `/album/:inviteId` - Public album viewing (no authentication required)

## Database Integration

The application integrates with Supabase for:
- User authentication and management
- Circle and album data
- Real-time updates
- File storage (images/videos)

## Security

- Row Level Security (RLS) policies protect data access
- Admin functions require authentication
- Public album access is controlled by invitation status
- Environment variables secure API keys