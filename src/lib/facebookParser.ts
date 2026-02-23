import JSZip from 'jszip';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ParsedAsset {
  file: File;
  filename: string;
  sourceAssetId: string;
  createdAt?: string;
  description?: string;
  mediaType: 'photo' | 'video';
  albumName?: string;
  gpsLat?: number;
  gpsLng?: number;
  comments: Array<{ author_name: string; text: string; timestamp: string }>;
  reactions: Array<{ author_name: string; emoji: string; timestamp: string; fbid?: string }>;
  isBackSide?: boolean;
  frontPhotoIndex?: number;
}

export interface ImportSummary {
  photos: number;
  videos: number;
  stories: number;
  comments: number;
  reactions: number;
  albums: string[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Facebook encodes JSON strings as Latin-1 escaped UTF-8.
 * Each character's code point is actually a byte in a UTF-8 sequence.
 */
function decodeFbString(str: string): string {
  if (!str) return str;
  try {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return str;
  }
}

const MEDIA_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic',
  'mp4', 'mov', 'avi', 'mkv',
]);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv']);
const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
};
const SKIP_DIRS = new Set(['stickers_used', 'gifs']);
const SKIP_ALBUM_DIRS = new Set(['media', 'posts', 'your_facebook_activity', 'photos_and_videos']);
const MAX_GAP_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ------------------------------------------------------------------ */
/*  Main parser                                                        */
/* ------------------------------------------------------------------ */

export async function parseExport(zip: JSZip): Promise<{
  assets: ParsedAsset[];
  summary: ImportSummary;
  fbidMap: Map<string, number>;
}> {
  const assets: ParsedAsset[] = [];
  const allComments: any[] = [];
  const allReactions: any[] = [];

  // Find root prefix (may be nested in a folder like facebook-username/)
  const rootPrefix = findRootPrefix(zip);
  console.log('[FB Import] Root prefix:', JSON.stringify(rootPrefix));
  console.log('[FB Import] Total files in ZIP:', Object.keys(zip.files).length);

  // 1. Parse JSON post/album/uncategorized/video files
  const postFiles = Object.keys(zip.files).filter(
    p => p.startsWith(`${rootPrefix}posts/`) && p.endsWith('.json')
  );
  console.log('[FB Import] JSON post files found:', postFiles.length, postFiles.slice(0, 3));

  let hasJsonPosts = false;

  for (const path of postFiles) {
    try {
      const content = await zip.files[path].async('string');
      const parsed = JSON.parse(content);

      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.photos)) {
        // Album format: { name, photos: [...] }
        hasJsonPosts = true;
        const albumName = decodeFbString(parsed.name) || undefined;
        for (const photo of parsed.photos) {
          const asset = await extractMediaAsset(zip, rootPrefix, photo.uri, {
            sourcePrefix: 'fb_album',
            createdAt: photo.creation_timestamp,
            description: decodeFbString(photo.title || parsed.description),
            albumName,
            gpsLat: photo.media_metadata?.photo_metadata?.latitude,
            gpsLng: photo.media_metadata?.photo_metadata?.longitude,
          });
          if (asset) assets.push(asset);
        }
      } else if (parsed && !Array.isArray(parsed) &&
                 (Array.isArray(parsed.other_photos_v2) || Array.isArray(parsed.videos_v2))) {
        // Uncategorized photos or videos list
        hasJsonPosts = true;
        const items = parsed.other_photos_v2 || parsed.videos_v2 || [];
        const defaultVideo = !!parsed.videos_v2;
        for (const item of items) {
          const asset = await extractMediaAsset(zip, rootPrefix, item.uri, {
            sourcePrefix: 'fb_media',
            createdAt: item.creation_timestamp,
            description: decodeFbString(item.description),
            forceVideo: defaultVideo,
            gpsLat: item.media_metadata?.photo_metadata?.latitude,
            gpsLng: item.media_metadata?.photo_metadata?.longitude,
          });
          if (asset) assets.push(asset);
        }
      } else if (Array.isArray(parsed)) {
        // Posts array format
        hasJsonPosts = true;
        for (const post of parsed) {
          const postText = decodeFbString(post.data?.[0]?.post || '');
          if (!post.attachments) continue;
          for (const attachment of post.attachments) {
            for (const data of (attachment.data || [])) {
              if (!data.media?.uri) continue;
              const uriParts = data.media.uri.split('/');
              const mediaDir = uriParts.length >= 2 ? uriParts[uriParts.length - 2] : undefined;
              const postAlbumName = mediaDir && !SKIP_ALBUM_DIRS.has(mediaDir)
                ? decodeFbString(mediaDir) : undefined;
              const asset = await extractMediaAsset(zip, rootPrefix, data.media.uri, {
                sourcePrefix: `fb_post_${post.timestamp}`,
                createdAt: post.timestamp,
                description: postText || decodeFbString(data.media.title),
                albumName: postAlbumName,
                gpsLat: data.media?.media_metadata?.photo_metadata?.latitude,
                gpsLng: data.media?.media_metadata?.photo_metadata?.longitude,
              });
              if (asset) assets.push(asset);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse post file:', path, e);
    }
  }

  console.log('[FB Import] Assets from JSON:', assets.length, '| hasJsonPosts:', hasJsonPosts);

  // 2. HTML fallback if no JSON posts found
  if (!hasJsonPosts) {
    const htmlAssets = await parseHtmlExport(zip, rootPrefix);
    assets.push(...htmlAssets);
    console.log('[FB Import] Assets from HTML fallback:', htmlAssets.length);
  }

  // 3. Scan for all media files in the export
  const existingPaths = new Set(assets.map(a => a.sourceAssetId));
  const mediaPaths = Object.keys(zip.files).filter(p => {
    const ext = p.split('.').pop()?.toLowerCase() || '';
    if (!MEDIA_EXTENSIONS.has(ext) || zip.files[p].dir) return false;
    if (!p.startsWith(rootPrefix)) return false;
    const lower = p.toLowerCase();
    if (SKIP_DIRS.has(lower.split('/').slice(-2, -1)[0] || '')) return false;
    const relative = p.slice(rootPrefix.length);
    // Include photos_and_videos/, stories/, posts/media/, and any album dirs
    return (
      relative.startsWith('photos_and_videos/') ||
      relative.startsWith('stories/') ||
      relative.startsWith('posts/media/') ||
      relative.startsWith('photos/')
    );
  });

  console.log('[FB Import] Additional media files found:', mediaPaths.length, mediaPaths.slice(0, 3));

  for (const path of mediaPaths) {
    const relativePath = path.replace(rootPrefix, '');
    const sourceId = `fb_media_${relativePath}`;
    if (existingPaths.has(sourceId)) continue;

    const ext = path.split('.').pop()?.toLowerCase() || '';
    const isVideo = VIDEO_EXTENSIONS.has(ext);
    const filename = path.split('/').pop() || 'media';
    const albumName = path.split('/').slice(0, -1).pop() || undefined;

    try {
      const blob = await zip.files[path].async('blob');
      assets.push({
        file: new File([blob], filename, {
          type: isVideo ? (VIDEO_MIME[ext] || 'video/mp4') : 'image/jpeg',
        }),
        filename,
        sourceAssetId: sourceId,
        mediaType: isVideo ? 'video' : 'photo',
        albumName,
        comments: [],
        reactions: [],
      });
      existingPaths.add(sourceId);
    } catch (e) {
      console.warn('Failed to read media:', path, e);
    }
  }

  // 4. Parse comments — scan all comment-related files
  const commentFiles = Object.keys(zip.files).filter(p =>
    (p.startsWith(`${rootPrefix}comments_and_reactions/`) ||
     p.startsWith(`${rootPrefix}comments/`)) &&
    p.endsWith('.json') && p.toLowerCase().includes('comment')
  );
  for (const cPath of commentFiles) {
    try {
      const content = await zip.files[cPath].async('string');
      const data = JSON.parse(content);
      for (const entry of (data.comments_v2 || [])) {
        for (const d of (entry.data || [])) {
          if (d.comment) {
            allComments.push({
              author_name: decodeFbString(d.comment.author) || 'Unknown',
              text: decodeFbString(d.comment.comment) || '',
              timestamp: d.comment.timestamp
                ? new Date(d.comment.timestamp * 1000).toISOString()
                : new Date().toISOString(),
            });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse comments:', cPath, e);
    }
  }

  // 5. Parse reactions — scan all reaction-related files
  const reactionFiles = Object.keys(zip.files).filter(p =>
    (p.startsWith(`${rootPrefix}comments_and_reactions/`) ||
     p.startsWith(`${rootPrefix}likes_and_reactions/`)) &&
    p.endsWith('.json') &&
    (p.toLowerCase().includes('reaction') || p.toLowerCase().includes('like'))
  );
  for (const rPath of reactionFiles) {
    try {
      const content = await zip.files[rPath].async('string');
      const data = JSON.parse(content);

      // Old format: { reactions_v2: [...] }
      const oldEntries = data.reactions_v2 || data.post_and_comment_reactions_v2 || [];
      for (const entry of oldEntries) {
        if (entry.data?.[0]?.reaction) {
          allReactions.push({
            author_name: decodeFbString(entry.data[0].reaction.actor) || 'Unknown',
            emoji: decodeFbString(entry.data[0].reaction.reaction) || 'LIKE',
            timestamp: entry.timestamp
              ? new Date(entry.timestamp * 1000).toISOString()
              : new Date().toISOString(),
          });
        }
      }

      // New format: array with label_values and fbid
      if (Array.isArray(data)) {
        for (const entry of data) {
          if (!entry.label_values) continue;
          const reactionLabel = entry.label_values.find((lv: any) => lv.label === 'Reaction');
          const nameLabel = entry.label_values.find((lv: any) => lv.label === 'Name');
          if (reactionLabel) {
            allReactions.push({
              author_name: decodeFbString(nameLabel?.value) || 'Unknown',
              emoji: decodeFbString(reactionLabel.value) || 'LIKE',
              timestamp: entry.timestamp
                ? new Date(entry.timestamp * 1000).toISOString()
                : new Date().toISOString(),
              fbid: entry.fbid || undefined,
            });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse reactions:', rPath, e);
    }
  }

  // 6. Build fbid map and match comments/reactions to assets
  const fbidMap = new Map<string, number>();
  for (let i = 0; i < assets.length; i++) {
    const nameWithoutExt = assets[i].filename.replace(/\.[^.]+$/, '');
    if (/^\d+$/.test(nameWithoutExt)) {
      fbidMap.set(nameWithoutExt, i);
    }
  }

  // Timestamp-based fallback: binary search for nearest prior asset within 7 days
  const datedAssets = assets
    .map((a, i) => ({ idx: i, time: a.createdAt ? new Date(a.createdAt).getTime() : NaN }))
    .filter(a => !isNaN(a.time))
    .sort((a, b) => a.time - b.time);
  const assetTimes = datedAssets.map(a => a.time);

  const findByTimestamp = (timestamp: string): number | null => {
    if (datedAssets.length === 0) return null;
    const t = new Date(timestamp).getTime();
    let lo = 0, hi = assetTimes.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (assetTimes[mid] <= t) { best = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    if (best === -1) return null;
    return (t - assetTimes[best]) <= MAX_GAP_MS ? datedAssets[best].idx : null;
  };

  // Match comments (no fbid — timestamp only)
  for (const comment of allComments) {
    const idx = findByTimestamp(comment.timestamp);
    if (idx !== null) assets[idx].comments.push(comment);
  }

  // Match reactions (fbid first, then timestamp fallback)
  for (const reaction of allReactions) {
    let matched = false;
    if (reaction.fbid) {
      const idx = fbidMap.get(reaction.fbid);
      if (idx !== undefined) { assets[idx].reactions.push(reaction); matched = true; }
    }
    if (!matched) {
      const idx = findByTimestamp(reaction.timestamp);
      if (idx !== null) assets[idx].reactions.push(reaction);
    }
  }

  // 7. Deduplicate — prefer entries with more metadata
  const seen = new Map<string, number>();
  const uniqueAssets: ParsedAsset[] = [];
  for (const asset of assets) {
    const existIdx = seen.get(asset.sourceAssetId);
    if (existIdx === undefined) {
      seen.set(asset.sourceAssetId, uniqueAssets.length);
      uniqueAssets.push(asset);
    } else {
      const existing = uniqueAssets[existIdx];
      if (!existing.albumName && asset.albumName) {
        uniqueAssets[existIdx] = {
          ...asset,
          comments: existing.comments.length > asset.comments.length ? existing.comments : asset.comments,
          reactions: existing.reactions.length > asset.reactions.length ? existing.reactions : asset.reactions,
        };
      } else if (!existing.description && asset.description) {
        uniqueAssets[existIdx] = { ...asset, comments: existing.comments, reactions: existing.reactions };
      }
    }
  }

  const albums = [...new Set(uniqueAssets.map(a => a.albumName).filter(Boolean) as string[])];

  return {
    assets: uniqueAssets,
    summary: {
      photos: uniqueAssets.filter(a => a.mediaType === 'photo').length,
      videos: uniqueAssets.filter(a => a.mediaType === 'video').length,
      stories: 0,
      comments: allComments.length,
      reactions: allReactions.length,
      albums,
    },
    fbidMap,
  };
}

/* ------------------------------------------------------------------ */
/*  Graph API merge                                                    */
/* ------------------------------------------------------------------ */

export interface GraphApiStats {
  matched: number;
  comments: number;
  reactions: number;
}

export function mergeGraphApiComments(
  jsonContent: string,
  assets: ParsedAsset[],
  fbidMap: Map<string, number>,
): GraphApiStats | null {
  const data = JSON.parse(jsonContent);
  if (data.version !== 1 || !data.photos) return null;

  let matched = 0, addedComments = 0, addedReactions = 0;

  for (const [photoId, photoData] of Object.entries(data.photos) as [string, any][]) {
    const idx = fbidMap.get(photoId);
    if (idx === undefined) continue;
    matched++;
    const asset = assets[idx];

    // Replace comments — Graph API has all comments
    if (Array.isArray(photoData.comments) && photoData.comments.length > 0) {
      asset.comments = photoData.comments.map((c: any) => ({
        author_name: c.from_name || 'Unknown',
        text: c.message || '',
        timestamp: c.created_time || new Date().toISOString(),
      }));
      addedComments += asset.comments.length;
    }

    // Merge reactions — dedup by from_name + type
    if (Array.isArray(photoData.reactions) && photoData.reactions.length > 0) {
      const existingKeys = new Set(asset.reactions.map(r => `${r.author_name}:${r.emoji}`));
      for (const r of photoData.reactions) {
        const key = `${r.from_name}:${r.type}`;
        if (!existingKeys.has(key)) {
          asset.reactions.push({
            author_name: r.from_name || 'Unknown',
            emoji: r.type || 'LIKE',
            timestamp: new Date().toISOString(),
          });
          existingKeys.add(key);
          addedReactions++;
        }
      }
    }
  }

  return { matched, comments: addedComments, reactions: addedReactions };
}

/* ------------------------------------------------------------------ */
/*  HTML export fallback                                               */
/* ------------------------------------------------------------------ */

async function parseHtmlExport(zip: JSZip, rootPrefix: string): Promise<ParsedAsset[]> {
  const assets: ParsedAsset[] = [];

  // Find HTML files in posts/album/ directory
  const htmlFiles = Object.keys(zip.files).filter(
    p => p.startsWith(`${rootPrefix}posts/album/`) && p.endsWith('.html')
  );
  if (htmlFiles.length === 0) return assets;

  // Also parse caption files for descriptions and EXIF dates
  const captions = await parseHtmlCaptions(zip, rootPrefix);

  for (const path of htmlFiles) {
    try {
      const html = await zip.files[path].async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Album name from <title>
      const albumName = decodeFbString(doc.querySelector('title')?.textContent || '') || undefined;

      // Split into photo sections
      const sections = doc.querySelectorAll('section._a6-g, section[class*="_a6-g"]');
      // Fallback: split by section tag if class selectors don't work
      const sectionList = sections.length > 0
        ? Array.from(sections)
        : parseSectionsManually(html);

      for (const section of sectionList) {
        const sectionHtml = section instanceof Element ? section.innerHTML : section;

        // Extract image src
        const imgMatch = sectionHtml.match(/<img\s+[^>]*src="([^"]+)"/);
        if (!imgMatch) continue;

        const imgSrc = imgMatch[1];
        const srcLower = imgSrc.toLowerCase();
        if (srcLower.includes('stickers_used') || srcLower.includes('/gifs/')) continue;

        // Try to find the media file in the zip
        const mediaPath = resolveMediaPathInZip(zip, rootPrefix, imgSrc);
        if (!mediaPath) continue;

        // Extract timestamp
        const tsMatch = sectionHtml.match(/<div class="_a72d">(.*?)<\/div>/);
        let createdAt: string | undefined;
        if (tsMatch) createdAt = parseFbHtmlDate(tsMatch[1]);

        const filename = imgSrc.split('/').pop() || 'media';
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const isVideo = VIDEO_EXTENSIONS.has(ext);

        // Apply captions
        const captionData = captions.get(filename);
        const description = captionData?.caption;
        if (captionData?.takenDate && !createdAt) createdAt = captionData.takenDate;

        const blob = await zip.files[mediaPath].async('blob');
        assets.push({
          file: new File([blob], filename, {
            type: isVideo ? (VIDEO_MIME[ext] || 'video/mp4') : 'image/jpeg',
          }),
          filename,
          sourceAssetId: `fb_album_${imgSrc}`,
          createdAt,
          description,
          mediaType: isVideo ? 'video' : 'photo',
          albumName,
          comments: [],
          reactions: [],
        });
      }
    } catch (e) {
      console.warn('Failed to parse HTML album:', path, e);
    }
  }
  return assets;
}

async function parseHtmlCaptions(
  zip: JSZip, rootPrefix: string,
): Promise<Map<string, { caption?: string; takenDate?: string }>> {
  const result = new Map<string, { caption?: string; takenDate?: string }>();
  const captionFileNames = [
    'your_posts__check_ins__photos_and_videos_1.html',
    'your_uncategorized_photos.html',
    'your_photos.html',
    'your_videos.html',
  ];

  for (const name of captionFileNames) {
    const path = `${rootPrefix}posts/${name}`;
    if (!zip.files[path]) continue;
    try {
      const html = await zip.files[path].async('string');
      const sections = html.split('<section class="_a6-g">');
      for (let i = 1; i < sections.length; i++) {
        const section = sections[i];
        const srcMatch = section.match(/(?:<img|<video)\s+[^>]*src="([^"]+)"/);
        if (!srcMatch) continue;
        const filename = srcMatch[1].split('/').pop() || '';
        if (!filename) continue;
        const capMatch = section.match(/<div class="_3-95">(.*?)<\/div>/);
        const caption = decodeFbString(capMatch?.[1]?.trim() || '') || undefined;
        const takenMatch = section.match(
          /<div class="_a6-q">Taken<\/div>.*?<div class="_a6-q">(.*?)<\/div>/s,
        );
        const takenDate = takenMatch ? parseFbHtmlDate(takenMatch[1]) : undefined;
        if (caption || takenDate) result.set(filename, { caption, takenDate });
      }
    } catch (e) {
      console.warn('Failed to parse captions:', name, e);
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findRootPrefix(zip: JSZip): string {
  // Only look at actual files (not directory entries — many ZIPs lack them)
  const allPaths = Object.keys(zip.files).filter(p => !zip.files[p].dir);
  if (allPaths.length === 0) return '';

  // Check if all files share a single top-level folder
  const topDirs = new Set(allPaths.map(p => p.split('/')[0]));
  let prefix = '';
  if (topDirs.size === 1 && allPaths.every(p => p.includes('/'))) {
    prefix = [...topDirs][0] + '/';
  }

  // Collect unique second-level directory names
  const secondLevelDirs = new Set<string>();
  for (const p of allPaths) {
    const relative = prefix ? p.slice(prefix.length) : p;
    const slash = relative.indexOf('/');
    if (slash > 0) secondLevelDirs.add(relative.slice(0, slash));
  }

  // Look for activity root (e.g. "your_facebook_activity/")
  for (const dir of secondLevelDirs) {
    const lower = dir.toLowerCase().replace(/ /g, '_');
    if (lower.includes('facebook_activity') || lower.includes('your_activity')) {
      const result = `${prefix}${dir}/`;
      console.log('[FB Import] Found activity root:', result);
      return result;
    }
  }

  // Fallback: check if known FB data dirs exist at second level
  for (const dir of secondLevelDirs) {
    const testPrefix = `${prefix}${dir}/`;
    if (allPaths.some(p =>
      p.startsWith(`${testPrefix}posts/`) ||
      p.startsWith(`${testPrefix}photos_and_videos/`)
    )) {
      console.log('[FB Import] Found data root via fallback:', testPrefix);
      return testPrefix;
    }
  }

  // Check if posts/ or photos_and_videos/ exist directly under prefix
  if (allPaths.some(p =>
    p.startsWith(`${prefix}posts/`) ||
    p.startsWith(`${prefix}photos_and_videos/`)
  )) {
    console.log('[FB Import] Using prefix directly:', prefix || '(root)');
    return prefix;
  }

  console.log('[FB Import] No root prefix found. Top dirs:', [...topDirs].slice(0, 10));
  console.log('[FB Import] Sample paths:', allPaths.slice(0, 5));
  return prefix;
}

function shouldSkipUri(uri: string): boolean {
  const lower = uri.toLowerCase();
  return lower.includes('stickers_used') || lower.includes('/gifs/');
}

async function extractMediaAsset(
  zip: JSZip,
  rootPrefix: string,
  uri: string | undefined,
  opts: {
    sourcePrefix: string;
    createdAt?: number;
    description?: string;
    albumName?: string;
    forceVideo?: boolean;
    gpsLat?: number;
    gpsLng?: number;
  },
): Promise<ParsedAsset | null> {
  if (!uri) return null;
  if (shouldSkipUri(uri)) return null;

  const mediaPath = resolveMediaPathInZip(zip, rootPrefix, uri);
  if (!mediaPath) return null;

  const ext = uri.split('.').pop()?.toLowerCase() || '';
  const isVideo = opts.forceVideo || VIDEO_EXTENSIONS.has(ext);
  const filename = uri.split('/').pop() || 'media';

  try {
    const blob = await zip.files[mediaPath].async('blob');
    return {
      file: new File([blob], filename, {
        type: isVideo ? (VIDEO_MIME[ext] || 'video/mp4') : 'image/jpeg',
      }),
      filename,
      sourceAssetId: `${opts.sourcePrefix}_${uri}`,
      createdAt: opts.createdAt
        ? new Date(opts.createdAt * 1000).toISOString()
        : undefined,
      description: opts.description || undefined,
      mediaType: isVideo ? 'video' : 'photo',
      albumName: opts.albumName,
      gpsLat: opts.gpsLat,
      gpsLng: opts.gpsLng,
      comments: [],
      reactions: [],
    };
  } catch {
    return null;
  }
}

function resolveMediaPathInZip(zip: JSZip, rootPrefix: string, uri: string): string | null {
  // Try with rootPrefix (activity root)
  const withPrefix = `${rootPrefix}${uri}`;
  if (zip.files[withPrefix] && !zip.files[withPrefix].dir) return withPrefix;

  // Try without any prefix (raw uri from JSON)
  if (zip.files[uri] && !zip.files[uri].dir) return uri;

  // Try with just the outer wrapper folder (export root, not activity root)
  // e.g. rootPrefix="username/your_facebook_activity/" → try "username/{uri}"
  const parts = rootPrefix.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const exportRoot = parts[0] + '/';
    const withExportRoot = `${exportRoot}${uri}`;
    if (zip.files[withExportRoot] && !zip.files[withExportRoot].dir) return withExportRoot;
  }

  // Try just filename in common media dirs
  const filename = uri.split('/').pop() || '';
  for (const dir of ['posts/media/', 'photos_and_videos/', 'photos_and_videos/album/']) {
    const tryPath = `${rootPrefix}${dir}${filename}`;
    if (zip.files[tryPath] && !zip.files[tryPath].dir) return tryPath;
  }

  return null;
}

function parseFbHtmlDate(dateStr: string): string | undefined {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString();
    return undefined;
  } catch {
    return undefined;
  }
}

function parseSectionsManually(html: string): string[] {
  const parts = html.split('<section class="_a6-g">');
  return parts.slice(1);
}

/* ------------------------------------------------------------------ */
/*  Upload ordering helpers                                            */
/* ------------------------------------------------------------------ */

export function buildUploadOrder(
  assets: ParsedAsset[],
  backSidePairs: Map<number, number>,
): number[] {
  const backIndexes = new Set(backSidePairs.values());
  const order: number[] = [];
  for (let i = 0; i < assets.length; i++) {
    if (!backIndexes.has(i)) {
      order.push(i);
      if (backSidePairs.has(i)) {
        order.push(backSidePairs.get(i)!);
      }
    }
  }
  return order;
}
