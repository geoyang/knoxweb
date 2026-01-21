import { next } from '@vercel/edge';

const SUPABASE_URL = 'https://quqlovduekdasldqadge.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const WEB_APP_URL = 'https://dashboard.kizu.online';

// Social media crawler user agents
const CRAWLER_AGENTS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'WhatsApp',
  'LinkedInBot',
  'Slackbot',
  'TelegramBot',
  'Discordbot',
  'Pinterest',
  'Applebot',
];

function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_AGENTS.some(agent => ua.includes(agent.toLowerCase()));
}

export const config = {
  matcher: '/asset/:token*',
};

export default async function middleware(request: Request) {
  const userAgent = request.headers.get('user-agent');

  // For non-crawlers, let the request continue to the SPA
  if (!isCrawler(userAgent)) {
    return next();
  }

  // Extract token from URL
  const url = new URL(request.url);
  const pathname = url.pathname;
  const token = pathname.split('/asset/')[1];

  if (!token) {
    return next();
  }

  // For crawlers, fetch asset metadata and return OG tags
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/asset-share-api?action=view&token=${token}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.valid) {
      return new Response(generateOGHtml({
        title: 'Photo shared via Kizu',
        description: data.expired
          ? 'This share link has expired. Request access from the owner.'
          : 'This photo is no longer available.',
        imageUrl: null,
        pageUrl: `${WEB_APP_URL}/asset/${token}`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const isVideo = data.asset?.media_type?.startsWith('video');
    const thumbnailUrl = `${SUPABASE_URL}/functions/v1/asset-share-api?action=serve&token=${token}&type=thumbnail`;
    const ownerName = data.owner?.name || 'Someone';

    return new Response(generateOGHtml({
      title: `${isVideo ? 'Video' : 'Photo'} shared by ${ownerName}`,
      description: data.memories?.length
        ? `${data.memories.length} memor${data.memories.length === 1 ? 'y' : 'ies'} attached`
        : 'View this moment on Kizu',
      imageUrl: thumbnailUrl,
      pageUrl: `${WEB_APP_URL}/asset/${token}`,
      isVideo,
      width: data.asset?.width,
      height: data.asset?.height,
    }), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Error fetching asset metadata:', error);
    return next();
  }
}

interface OGParams {
  title: string;
  description: string;
  imageUrl: string | null;
  pageUrl: string;
  isVideo?: boolean;
  width?: number;
  height?: number;
}

function generateOGHtml(params: OGParams): string {
  const { title, description, imageUrl, pageUrl, isVideo, width, height } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${isVideo ? 'video.other' : 'article'}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ''}
  ${width ? `<meta property="og:image:width" content="${width}">` : ''}
  ${height ? `<meta property="og:image:height" content="${height}">` : ''}
  <meta property="og:site_name" content="Kizu">

  <!-- Twitter -->
  <meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:url" content="${escapeHtml(pageUrl)}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ''}
</head>
<body>
  <p>Loading...</p>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
