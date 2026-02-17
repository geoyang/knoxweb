import type { VercelRequest, VercelResponse } from '@vercel/node';
import sharp from 'sharp';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const GAP = 8;
const BG_COLOR = '#1a1a2e';

function getEnvironmentConfig(hostname: string) {
  const isDev =
    hostname.includes('dev.dashboard') || hostname.includes('localhost');

  if (isDev) {
    return {
      supabaseUrl: 'https://cbuclvdrdqetfwecphhw.supabase.co',
    };
  }

  return {
    supabaseUrl: 'https://quqlovduekdasldqadge.supabase.co',
  };
}

async function fetchImage(url: string, anonKey: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { apikey: anonKey },
    });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
}

async function compositeThreeImages(
  buffers: Buffer[],
): Promise<Buffer> {
  const heroHeight = CANVAS_HEIGHT - GAP - Math.floor((CANVAS_HEIGHT - GAP) / 3);
  const smallHeight = CANVAS_HEIGHT - heroHeight - GAP;
  const smallWidth = Math.floor((CANVAS_WIDTH - GAP) / 2);

  const hero = await sharp(buffers[0])
    .resize(CANVAS_WIDTH, heroHeight, { fit: 'cover' })
    .toBuffer();
  const small1 = await sharp(buffers[1])
    .resize(smallWidth, smallHeight, { fit: 'cover' })
    .toBuffer();
  const small2 = await sharp(buffers[2])
    .resize(smallWidth, smallHeight, { fit: 'cover' })
    .toBuffer();

  return sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 3,
      background: BG_COLOR,
    },
  })
    .composite([
      { input: hero, top: 0, left: 0 },
      { input: small1, top: heroHeight + GAP, left: 0 },
      { input: small2, top: heroHeight + GAP, left: smallWidth + GAP },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function compositeTwoImages(
  buffers: Buffer[],
): Promise<Buffer> {
  const halfWidth = Math.floor((CANVAS_WIDTH - GAP) / 2);

  const img1 = await sharp(buffers[0])
    .resize(halfWidth, CANVAS_HEIGHT, { fit: 'cover' })
    .toBuffer();
  const img2 = await sharp(buffers[1])
    .resize(halfWidth, CANVAS_HEIGHT, { fit: 'cover' })
    .toBuffer();

  return sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 3,
      background: BG_COLOR,
    },
  })
    .composite([
      { input: img1, top: 0, left: 0 },
      { input: img2, top: 0, left: halfWidth + GAP },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function compositeSingleImage(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const token = req.query.token;
  if (!token || typeof token !== 'string') {
    return res.status(400).send('Missing token');
  }

  const hostname = req.headers.host || 'dashboard.kizu.online';
  const env = getEnvironmentConfig(hostname);
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

  // Fetch album data
  const viewUrl = `${env.supabaseUrl}/functions/v1/album-share-api?action=view&token=${encodeURIComponent(token)}`;
  let albumData: any;
  try {
    const viewRes = await fetch(viewUrl, {
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
    });
    albumData = await viewRes.json();
    if (!viewRes.ok || !albumData.valid) {
      return res.status(404).send('Album not found');
    }
  } catch {
    return res.status(500).send('Failed to fetch album');
  }

  const assets = albumData.album?.assets || [];
  if (assets.length === 0) {
    return res.status(404).send('Album has no assets');
  }

  // Fetch up to 3 asset thumbnails
  const toFetch = assets.slice(0, 3);
  const imageBuffers: Buffer[] = [];

  for (const asset of toFetch) {
    const serveUrl = `${env.supabaseUrl}/functions/v1/album-share-api?action=serve&token=${encodeURIComponent(token)}&asset_id=${asset.id}&type=thumbnail`;
    const buf = await fetchImage(serveUrl, anonKey);
    if (buf) imageBuffers.push(buf);
  }

  if (imageBuffers.length === 0) {
    return res.status(404).send('No images available');
  }

  // Composite based on how many images we got
  let result: Buffer;
  if (imageBuffers.length >= 3) {
    result = await compositeThreeImages(imageBuffers);
  } else if (imageBuffers.length === 2) {
    result = await compositeTwoImages(imageBuffers);
  } else {
    result = await compositeSingleImage(imageBuffers[0]);
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader(
    'Cache-Control',
    'public, max-age=3600, s-maxage=86400',
  );
  return res.send(result);
}
