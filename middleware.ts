import { next } from '@vercel/edge';

// Environment detection based on hostname
function getEnvironmentConfig(hostname: string) {
  const isDev = hostname.includes('dev.dashboard') || hostname.includes('localhost');

  if (isDev) {
    return {
      supabaseUrl: 'https://cbuclvdrdqetfwecphhw.supabase.co',
      webAppUrl: 'https://dev.dashboard.kizu.online',
    };
  }

  return {
    supabaseUrl: 'https://quqlovduekdasldqadge.supabase.co',
    webAppUrl: 'https://dashboard.kizu.online',
  };
}

const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

// Social media crawler user agents
const CRAWLER_AGENTS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'WhatsApp',
  'LinkedInBot',
  'Slackbot',
  'Slack-ImgProxy',
  'TelegramBot',
  'Discordbot',
  'Pinterest',
  'Applebot',
  'iMessageLinkPreviews',
];

function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_AGENTS.some(agent => ua.includes(agent.toLowerCase()));
}

export const config = {
  matcher: ['/asset/:token*', '/shared-album/:token*'],
};

export default async function middleware(request: Request) {
  const userAgent = request.headers.get('user-agent');

  // For non-crawlers, let the request continue to the SPA
  if (!isCrawler(userAgent)) {
    return next();
  }

  // Extract token and determine share type from URL
  const url = new URL(request.url);
  const pathname = url.pathname;

  const isAlbumShare = pathname.includes('/shared-album/');
  const token = isAlbumShare
    ? pathname.split('/shared-album/')[1]
    : pathname.split('/asset/')[1];

  if (!token) {
    return next();
  }

  // Get environment config based on hostname
  const hostname = url.hostname;
  const envConfig = getEnvironmentConfig(hostname);

  // For crawlers, fetch metadata and return OG tags
  try {
    if (isAlbumShare) {
      return await handleAlbumShare(token, envConfig);
    } else {
      return await handleAssetShare(token, envConfig);
    }
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return next();
  }
}

interface EnvConfig {
  supabaseUrl: string;
  webAppUrl: string;
}

async function handleAssetShare(token: string, env: EnvConfig) {
  const response = await fetch(
    `${env.supabaseUrl}/functions/v1/asset-share-api?action=view&token=${token}`,
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
      pageUrl: `${env.webAppUrl}/asset/${token}`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const isVideo = data.asset?.media_type?.startsWith('video');
  const thumbnailUrl = `${env.supabaseUrl}/functions/v1/asset-share-api?action=serve&token=${token}&type=thumbnail`;
  const ownerName = data.owner?.name || 'Someone';

  return new Response(generateOGHtml({
    title: `${isVideo ? 'Video' : 'Photo'} shared by ${ownerName}`,
    description: data.memories?.length
      ? `${data.memories.length} memor${data.memories.length === 1 ? 'y' : 'ies'} attached`
      : 'View this moment on Kizu',
    imageUrl: thumbnailUrl,
    pageUrl: `${env.webAppUrl}/asset/${token}`,
    isVideo,
    width: data.asset?.width,
    height: data.asset?.height,
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

async function handleAlbumShare(token: string, env: EnvConfig) {
  const response = await fetch(
    `${env.supabaseUrl}/functions/v1/album-share-api?action=view&token=${token}`,
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
      title: 'Album shared via Kizu',
      description: data.expired
        ? 'This share link has expired. Request access from the owner.'
        : 'This album is no longer available.',
      imageUrl: null,
      pageUrl: `${env.webAppUrl}/shared-album/${token}`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const album = data.album;
  const ownerName = data.owner?.name || 'Someone';
  const photoCount = album?.assets?.length || 0;

  // Use the first asset as the thumbnail for the album preview
  let thumbnailUrl: string | null = null;
  let firstAssetWidth: number | undefined;
  let firstAssetHeight: number | undefined;

  if (album?.assets?.length > 0) {
    const firstAsset = album.assets[0];
    thumbnailUrl = `${env.supabaseUrl}/functions/v1/album-share-api?action=serve&token=${token}&asset_id=${firstAsset.id}&type=thumbnail`;
    firstAssetWidth = firstAsset.width;
    firstAssetHeight = firstAsset.height;
  }

  return new Response(generateOGHtml({
    title: album?.title
      ? `${album.title} · Shared by ${ownerName}`
      : `Shared by ${ownerName}`,
    description: photoCount > 0
      ? `${photoCount} photo${photoCount === 1 ? '' : 's'} on Kizu`
      : 'View this album on Kizu',
    imageUrl: thumbnailUrl,
    pageUrl: `${env.webAppUrl}/shared-album/${token}`,
    isVideo: false,
    width: firstAssetWidth,
    height: firstAssetHeight,
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
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
