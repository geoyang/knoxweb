import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { useAuth } from '../context/AuthContext';
import { getSupabaseUrl } from '../lib/environments';
import { FacebookImportGuide } from './FacebookImportGuide';

type Step = 'instructions' | 'parsing' | 'summary' | 'importing' | 'complete';

interface ImportSummary {
  photos: number;
  videos: number;
  comments: number;
  reactions: number;
}

interface ParsedAsset {
  file: File;
  filename: string;
  sourceAssetId: string;
  createdAt?: string;
  description?: string;
  mediaType: 'photo' | 'video';
  albumName?: string;
  comments: Array<{ author_name: string; text: string; timestamp: string }>;
  reactions: Array<{ author_name: string; emoji: string; timestamp: string }>;
}

interface ImportProgress {
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
}

const FB_IMPORT_API = `${getSupabaseUrl()}/functions/v1/facebook-import-api`;

const MEDIA_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic',
  'mp4', 'mov', 'avi', 'mkv',
]);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv']);

export function FacebookImport() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('instructions');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [parsedAssets, setParsedAssets] = useState<ParsedAsset[]>([]);
  const [progress, setProgress] = useState<ImportProgress>({
    total: 0, processed: 0, imported: 0, skipped: 0, failed: 0,
  });
  const cancelledRef = useRef(false);

  const getAuthHeaders = useCallback(() => ({
    Authorization: `Bearer ${session?.access_token}`,
  }), [session]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep('parsing');

    try {
      const zip = await JSZip.loadAsync(file);
      await parseExport(zip);
    } catch (error: any) {
      console.error('Failed to parse ZIP:', error);
      alert('Failed to open the export file. Make sure it\'s a valid Facebook export ZIP.');
      setStep('instructions');
    }
  };

  const parseExport = async (zip: JSZip) => {
    const assets: ParsedAsset[] = [];
    const allComments: any[] = [];
    const allReactions: any[] = [];

    // Find root prefix (may be nested in a folder like facebook-username/)
    let rootPrefix = '';
    const topEntries = Object.keys(zip.files).map(p => p.split('/')[0]);
    const uniqueTop = [...new Set(topEntries)];
    if (uniqueTop.length === 1 && zip.files[uniqueTop[0] + '/']) {
      rootPrefix = uniqueTop[0] + '/';
    }

    // 1. Parse posts
    const postFiles = Object.keys(zip.files).filter(
      p => p.startsWith(`${rootPrefix}posts/`) && p.endsWith('.json')
    );
    for (const path of postFiles) {
      try {
        const content = await zip.files[path].async('string');
        const posts = JSON.parse(content);
        for (const post of (Array.isArray(posts) ? posts : [])) {
          const postText = post.data?.[0]?.post || '';
          if (post.attachments) {
            for (const attachment of post.attachments) {
              for (const data of (attachment.data || [])) {
                if (data.media?.uri) {
                  const mediaPath = `${rootPrefix}${data.media.uri}`;
                  const zipFile = zip.files[mediaPath];
                  if (zipFile && !zipFile.dir) {
                    const ext = data.media.uri.split('.').pop()?.toLowerCase() || '';
                    const isVideo = VIDEO_EXTENSIONS.has(ext);
                    const blob = await zipFile.async('blob');
                    assets.push({
                      file: new File([blob], data.media.uri.split('/').pop() || 'media', {
                        type: isVideo ? 'video/mp4' : 'image/jpeg',
                      }),
                      filename: data.media.uri.split('/').pop() || 'media',
                      sourceAssetId: `fb_post_${post.timestamp}_${data.media.uri}`,
                      createdAt: post.timestamp
                        ? new Date(post.timestamp * 1000).toISOString()
                        : undefined,
                      description: postText || data.media.title || undefined,
                      mediaType: isVideo ? 'video' : 'photo',
                      comments: [],
                      reactions: [],
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Failed to parse post file:', path, e);
      }
    }

    // 2. Scan photos_and_videos and stories directories
    const mediaPaths = Object.keys(zip.files).filter(p => {
      const ext = p.split('.').pop()?.toLowerCase() || '';
      return (
        (p.startsWith(`${rootPrefix}photos_and_videos/`) || p.startsWith(`${rootPrefix}stories/`)) &&
        MEDIA_EXTENSIONS.has(ext) &&
        !zip.files[p].dir
      );
    });

    const existingPaths = new Set(assets.map(a => a.sourceAssetId));
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
            type: isVideo ? 'video/mp4' : 'image/jpeg',
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

    // 3. Parse comments
    const commentsPath = `${rootPrefix}comments_and_reactions/comments.json`;
    if (zip.files[commentsPath]) {
      try {
        const content = await zip.files[commentsPath].async('string');
        const data = JSON.parse(content);
        for (const entry of (data.comments_v2 || [])) {
          for (const d of (entry.data || [])) {
            if (d.comment) {
              allComments.push({
                author_name: d.comment.author || 'Unknown',
                text: d.comment.comment || '',
                timestamp: d.comment.timestamp
                  ? new Date(d.comment.timestamp * 1000).toISOString()
                  : new Date().toISOString(),
              });
            }
          }
        }
      } catch (e) {
        console.warn('Failed to parse comments:', e);
      }
    }

    // 4. Parse reactions
    const reactionPaths = [
      `${rootPrefix}comments_and_reactions/posts_and_comments.json`,
      `${rootPrefix}likes_and_reactions/posts_and_comments.json`,
    ];
    for (const rPath of reactionPaths) {
      if (zip.files[rPath]) {
        try {
          const content = await zip.files[rPath].async('string');
          const data = JSON.parse(content);
          for (const entry of (data.reactions_v2 || data.post_and_comment_reactions_v2 || [])) {
            if (entry.data?.[0]?.reaction) {
              allReactions.push({
                author_name: entry.data[0].reaction.actor || 'Unknown',
                emoji: entry.data[0].reaction.reaction || 'LIKE',
                timestamp: entry.timestamp
                  ? new Date(entry.timestamp * 1000).toISOString()
                  : new Date().toISOString(),
              });
            }
          }
        } catch (e) {
          console.warn('Failed to parse reactions:', e);
        }
      }
    }

    // Assign comments/reactions to first asset
    if (assets.length > 0 && (allComments.length > 0 || allReactions.length > 0)) {
      assets[0].comments = allComments;
      assets[0].reactions = allReactions;
    }

    // Deduplicate
    const seen = new Set<string>();
    const uniqueAssets = assets.filter(a => {
      if (seen.has(a.sourceAssetId)) return false;
      seen.add(a.sourceAssetId);
      return true;
    });

    setParsedAssets(uniqueAssets);
    setSummary({
      photos: uniqueAssets.filter(a => a.mediaType === 'photo').length,
      videos: uniqueAssets.filter(a => a.mediaType === 'video').length,
      comments: allComments.length,
      reactions: allReactions.length,
    });
    setStep('summary');
  };

  const handleStartImport = async () => {
    if (!session?.access_token || parsedAssets.length === 0) return;

    cancelledRef.current = false;
    setStep('importing');
    setProgress({ total: parsedAssets.length, processed: 0, imported: 0, skipped: 0, failed: 0 });

    try {
      // Create job
      const startRes = await fetch(`${FB_IMPORT_API}?action=start`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: {
            total_photos: summary?.photos || 0,
            total_videos: summary?.videos || 0,
            total_stories: 0,
            total_comments: summary?.comments || 0,
            total_reactions: summary?.reactions || 0,
          },
        }),
      });
      const startData = await startRes.json();
      if (!startData.success) throw new Error(startData.error);
      const jobId = startData.job_id;
      const folderId = startData.folder_id;
      const albumId = startData.album_id;

      // Upload assets
      for (let i = 0; i < parsedAssets.length; i++) {
        if (cancelledRef.current) break;

        const asset = parsedAssets[i];
        try {
          const formData = new FormData();
          formData.append('file', asset.file);
          formData.append('metadata', JSON.stringify({
            job_id: jobId,
            source_asset_id: asset.sourceAssetId,
            filename: asset.filename,
            created_at: asset.createdAt,
            description: asset.description,
            media_type: asset.mediaType,
            album_name: asset.albumName,
            folder_id: folderId,
            album_id: albumId,
          }));

          const res = await fetch(`${FB_IMPORT_API}?action=upload-asset`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData,
          });
          const data = await res.json();

          if (data.success) {
            const wasSkipped = data.skipped === true;
            if (data.asset_id && (asset.comments.length > 0 || asset.reactions.length > 0)) {
              await fetch(`${FB_IMPORT_API}?action=upload-batch`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  asset_id: data.asset_id,
                  memories: asset.comments,
                  reactions: asset.reactions,
                }),
              });
            }
            setProgress(prev => ({
              ...prev,
              processed: prev.processed + 1,
              imported: prev.imported + (wasSkipped ? 0 : 1),
              skipped: prev.skipped + (wasSkipped ? 1 : 0),
            }));
          } else {
            setProgress(prev => ({ ...prev, processed: prev.processed + 1, failed: prev.failed + 1 }));
          }
        } catch {
          setProgress(prev => ({ ...prev, processed: prev.processed + 1, failed: prev.failed + 1 }));
        }
      }

      // Complete
      await fetch(`${FB_IMPORT_API}?action=complete&job_id=${jobId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      setStep('complete');
    } catch (error: any) {
      alert(error.message || 'Import failed');
      setStep('summary');
    }
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 py-8">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
        {/* Instructions */}
        {step === 'instructions' && (
          <div>
            <FacebookImportGuide />

            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 mt-5 bg-[#1877F2] text-white rounded-xl font-semibold hover:bg-[#1565D8] transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Select Facebook Export ZIP
            </button>
          </div>
        )}

        {/* Parsing */}
        {step === 'parsing' && (
          <div className="text-center py-12">
            <div className="animate-spin w-10 h-10 border-4 border-[#1877F2] border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Extracting...</h2>
            <p className="text-gray-500">Reading your Facebook export. This may take a moment.</p>
          </div>
        )}

        {/* Summary */}
        {step === 'summary' && summary && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Ready to Import</h2>

            <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-3">
              {summary.photos > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Photos</span>
                  <span className="font-semibold">{summary.photos.toLocaleString()}</span>
                </div>
              )}
              {summary.videos > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Videos</span>
                  <span className="font-semibold">{summary.videos.toLocaleString()}</span>
                </div>
              )}
              {summary.comments > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Comments</span>
                  <span className="font-semibold">{summary.comments.toLocaleString()}</span>
                </div>
              )}
              {summary.reactions > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Reactions</span>
                  <span className="font-semibold">{summary.reactions.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('instructions')}
                className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Back
              </button>
              <button
                onClick={handleStartImport}
                className="flex-[2] py-3 bg-[#1877F2] text-white rounded-xl font-semibold hover:bg-[#1565D8] transition"
              >
                Import All
              </button>
            </div>
          </div>
        )}

        {/* Importing */}
        {step === 'importing' && (
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Importing...</h2>
            <p className="text-gray-500 mb-4">
              Uploading photo {progress.processed} of {progress.total}
            </p>

            <div className="w-full h-3 bg-gray-200 rounded-full mb-2 overflow-hidden">
              <div
                className="h-full bg-[#1877F2] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-4">{progressPercent}%</p>

            <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Imported</span>
                <span className="font-semibold text-green-600">{progress.imported}</span>
              </div>
              {progress.skipped > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Skipped</span>
                  <span className="font-semibold text-gray-500">{progress.skipped}</span>
                </div>
              )}
              {progress.failed > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Failed</span>
                  <span className="font-semibold text-red-500">{progress.failed}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                cancelledRef.current = true;
                setStep('complete');
              }}
              className="py-3 px-8 border border-red-500 text-red-500 rounded-xl font-semibold hover:bg-red-50 transition"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Complete */}
        {step === 'complete' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {cancelledRef.current ? 'Import Cancelled' : 'Import Complete'}
            </h2>

            <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Imported</span>
                <span className="font-semibold text-green-600">{progress.imported}</span>
              </div>
              {progress.skipped > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Skipped</span>
                  <span className="font-semibold">{progress.skipped}</span>
                </div>
              )}
              {progress.failed > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Failed</span>
                  <span className="font-semibold text-red-500">{progress.failed}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-3 bg-[#1877F2] text-white rounded-xl font-semibold hover:bg-[#1565D8] transition"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
