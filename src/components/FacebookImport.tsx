import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { useAuth } from '../context/AuthContext';
import { getSupabaseUrl } from '../lib/environments';
import { FacebookImportGuide } from './FacebookImportGuide';
import { FacebookPairingGrid } from './FacebookPairingGrid';
import {
  parseExport,
  mergeGraphApiComments,
  buildUploadOrder,
  type ParsedAsset,
  type ImportSummary,
  type GraphApiStats,
} from '../lib/facebookParser';

type Step = 'instructions' | 'parsing' | 'summary' | 'importing' | 'complete';

interface ImportProgress {
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
}

const FB_IMPORT_API = `${getSupabaseUrl()}/functions/v1/facebook-import-api`;
const BATCH_SIZE = 50;

export function FacebookImport() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const graphApiInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('instructions');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [parsedAssets, setParsedAssets] = useState<ParsedAsset[]>([]);
  const [fbidMap, setFbidMap] = useState<Map<string, number>>(new Map());
  const [progress, setProgress] = useState<ImportProgress>({
    total: 0, processed: 0, imported: 0, skipped: 0, failed: 0,
  });
  const [graphApiStats, setGraphApiStats] = useState<GraphApiStats | null>(null);
  const [backSidePairs, setBackSidePairs] = useState<Map<number, number>>(new Map());
  const [pairingMode, setPairingMode] = useState(false);
  const [pairingSelection, setPairingSelection] = useState<number[]>([]);
  const [uploadStartTime, setUploadStartTime] = useState<number>(0);
  const [batchPaused, setBatchPaused] = useState(false);
  const skipPausesRef = useRef(false);
  const cancelledRef = useRef(false);
  const batchResolveRef = useRef<((skip: boolean) => void) | null>(null);

  const getAuthHeaders = useCallback(() => ({
    Authorization: `Bearer ${session?.access_token}`,
  }), [session]);

  /* ---- File select & parse ---- */

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStep('parsing');
    try {
      const zip = await JSZip.loadAsync(file);
      const result = await parseExport(zip);
      setParsedAssets(result.assets);
      setSummary(result.summary);
      setFbidMap(result.fbidMap);
      setStep('summary');
    } catch (error: any) {
      console.error('Failed to parse ZIP:', error);
      alert('Failed to open the export file. Make sure it\'s a valid Facebook export ZIP.');
      setStep('instructions');
    }
  };

  /* ---- Graph API merge ---- */

  const handleGraphApiFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const stats = mergeGraphApiComments(content, parsedAssets, fbidMap);
      if (!stats) {
        alert('Invalid file. Expected a Graph API comments file (version 1 format).');
        return;
      }
      setGraphApiStats(stats);
      setSummary(prev => prev ? {
        ...prev,
        comments: stats.comments,
        reactions: prev.reactions + stats.reactions,
      } : prev);
    } catch {
      alert('Failed to read the comments file.');
    }
  };

  /* ---- Front/back pairing ---- */

  const handlePairingTap = (index: number) => {
    const asset = parsedAssets[index];
    if (asset.mediaType === 'video') { alert('Only photos can be paired.'); return; }
    const isAlreadyFront = backSidePairs.has(index);
    const isAlreadyBack = Array.from(backSidePairs.values()).includes(index);
    if (isAlreadyFront || isAlreadyBack) { alert('Already paired. Unlink first.'); return; }

    if (pairingSelection.length === 0) {
      setPairingSelection([index]);
    } else if (pairingSelection[0] === index) {
      setPairingSelection([]);
    } else {
      setBackSidePairs(prev => { const next = new Map(prev); next.set(pairingSelection[0], index); return next; });
      setPairingSelection([]);
    }
  };

  const handleUnpair = (frontIndex: number) => {
    setBackSidePairs(prev => { const next = new Map(prev); next.delete(frontIndex); return next; });
  };

  /* ---- Import ---- */

  const handleStartImport = async () => {
    if (!session?.access_token || parsedAssets.length === 0) return;

    cancelledRef.current = false;
    skipPausesRef.current = false;
    setBatchPaused(false);
    setStep('importing');
    setUploadStartTime(Date.now());
    const uploadOrder = buildUploadOrder(parsedAssets, backSidePairs);
    setProgress({ total: uploadOrder.length, processed: 0, imported: 0, skipped: 0, failed: 0 });

    try {
      const uniqueAlbums = [...new Set(parsedAssets.map(a => a.albumName).filter(Boolean) as string[])];

      const startRes = await fetch(`${FB_IMPORT_API}?action=start`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: {
            total_photos: summary?.photos || 0,
            total_videos: summary?.videos || 0,
            total_stories: summary?.stories || 0,
            total_comments: summary?.comments || 0,
            total_reactions: summary?.reactions || 0,
          },
          album_names: uniqueAlbums,
        }),
      });
      const startData = await startRes.json();
      if (!startData.success) throw new Error(startData.error || 'Failed to create import job');

      const jobId = startData.job_id;
      const folderId = startData.folder_id;
      const albumMap: Record<string, string> = startData.album_map || {};
      const backIndexes = new Set(backSidePairs.values());
      const uploadedAssetIds = new Map<number, string>();

      for (let orderIdx = 0; orderIdx < uploadOrder.length; orderIdx++) {
        if (cancelledRef.current) break;

        // Batch pause every 50 (unless user chose to skip pauses)
        if (orderIdx > 0 && orderIdx % BATCH_SIZE === 0 && !skipPausesRef.current) {
          setBatchPaused(true);
          const skipFuturePauses = await new Promise<boolean>(resolve => {
            batchResolveRef.current = resolve;
          });
          setBatchPaused(false);
          batchResolveRef.current = null;
          if (cancelledRef.current) break;
          if (skipFuturePauses) skipPausesRef.current = true;
        }

        const i = uploadOrder[orderIdx];
        const asset = parsedAssets[i];
        const albumId = asset.albumName
          ? (albumMap[asset.albumName] || albumMap['__default__'])
          : albumMap['__default__'];

        const isBackSide = backIndexes.has(i);
        let frontAssetId: string | undefined;
        if (isBackSide) {
          for (const [frontIdx, backIdx] of backSidePairs.entries()) {
            if (backIdx === i) { frontAssetId = uploadedAssetIds.get(frontIdx); break; }
          }
        }

        try {
          const formData = new FormData();
          formData.append('file', asset.file);
          const metadataObj: Record<string, any> = {
            job_id: jobId,
            source_asset_id: asset.sourceAssetId,
            filename: asset.filename,
            created_at: asset.createdAt,
            description: asset.description,
            media_type: asset.mediaType,
            album_name: asset.albumName,
            gps_lat: asset.gpsLat,
            gps_lng: asset.gpsLng,
            folder_id: folderId,
            album_id: albumId,
          };
          if (isBackSide) {
            metadataObj.is_back_side = true;
            if (frontAssetId) metadataObj.front_asset_id = frontAssetId;
          }
          formData.append('metadata', JSON.stringify(metadataObj));

          const res = await fetch(`${FB_IMPORT_API}?action=upload-asset`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData,
          });
          const data = await res.json();

          if (data.success) {
            if (data.asset_id) uploadedAssetIds.set(i, data.asset_id);
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

  const progressPercent = progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100) : 0;

  const estimatedRemaining = progress.processed > 0
    ? Math.round(((Date.now() - uploadStartTime) / progress.processed) * (progress.total - progress.processed) / 1000)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 py-8">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
        {/* Instructions */}
        {step === 'instructions' && (
          <div>
            <FacebookImportGuide />
            <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={handleFileSelect} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 mt-5 bg-[#1877F2] text-white rounded-xl font-semibold hover:bg-[#1565D8] transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Select Facebook Export ZIP
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-2 mt-3 text-sm text-gray-500 hover:text-gray-700 font-medium transition"
            >
              Cancel
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

        {/* Summary — no media */}
        {step === 'summary' && summary && parsedAssets.length === 0 && (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No Media Found</h2>
            <p className="text-gray-500 mb-4 text-sm">
              Make sure you downloaded your data (JSON or HTML format) from Facebook's "Export your information" page.
            </p>
            <button
              onClick={() => setStep('instructions')}
              className="w-full py-3 bg-[#1877F2] text-white rounded-xl font-semibold hover:bg-[#1565D8] transition"
            >
              Back to Instructions
            </button>
          </div>
        )}

        {/* Summary — media found */}
        {step === 'summary' && summary && parsedAssets.length > 0 && (
          <SummaryStep
            summary={summary}
            graphApiStats={graphApiStats}
            graphApiInputRef={graphApiInputRef}
            onGraphApiFile={handleGraphApiFile}
            backSidePairs={backSidePairs}
            pairingMode={pairingMode}
            pairingSelection={pairingSelection}
            assets={parsedAssets}
            onStartPairing={() => { setPairingMode(true); setPairingSelection([]); }}
            onPairingTap={handlePairingTap}
            onUnpair={handleUnpair}
            onDonePairing={() => { setPairingMode(false); setPairingSelection([]); }}
            onBack={() => setStep('instructions')}
            onCancel={() => navigate('/dashboard')}
            onImport={handleStartImport}
          />
        )}

        {/* Importing */}
        {step === 'importing' && (
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {batchPaused ? 'Batch Complete' : 'Importing...'}
            </h2>
            <p className="text-sm text-gray-700 mb-4">
              {batchPaused
                ? `Uploaded ${progress.processed} of ${progress.total} assets`
                : `Uploading asset ${progress.processed} of ${progress.total}`}
            </p>
            <div className="w-full h-3 bg-gray-200 rounded-full mb-3 overflow-hidden">
              <div className="h-full bg-[#1877F2] rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="text-3xl font-bold text-gray-900">{progressPercent}%</p>
            {estimatedRemaining !== null && estimatedRemaining > 0 && (
              <p className="text-sm text-gray-600 mt-1 mb-3">
                ~{estimatedRemaining > 60 ? `${Math.round(estimatedRemaining / 60)} min` : `${estimatedRemaining}s`} remaining
              </p>
            )}
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
              <StatRow label="Imported" value={progress.imported} color="text-green-700" />
              {progress.skipped > 0 && <StatRow label="Skipped (duplicates)" value={progress.skipped} color="text-gray-600" />}
              {progress.failed > 0 && <StatRow label="Failed" value={progress.failed} color="text-red-600" />}
            </div>

            {batchPaused ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Duplicates are automatically skipped and won't be imported again.
                </p>
                <button
                  onClick={() => batchResolveRef.current?.(false)}
                  className="w-full py-3 bg-[#1877F2] text-white rounded-xl font-semibold hover:bg-[#1565D8] transition"
                >
                  Continue (next {Math.min(BATCH_SIZE, progress.total - progress.processed)})
                </button>
                <button
                  onClick={() => batchResolveRef.current?.(true)}
                  className="w-full py-3 border border-[#1877F2] text-[#1877F2] rounded-xl font-semibold hover:bg-blue-50 transition"
                >
                  Import All Remaining Without Pausing
                </button>
                <button
                  onClick={() => { cancelledRef.current = true; batchResolveRef.current?.(false); }}
                  className="w-full py-2 text-sm text-red-500 hover:text-red-600 font-medium"
                >
                  Stop Import
                </button>
              </div>
            ) : (
              <button
                onClick={() => { cancelledRef.current = true; setStep('complete'); }}
                className="py-3 px-8 border border-red-500 text-red-500 rounded-xl font-semibold hover:bg-red-50 transition"
              >
                Cancel
              </button>
            )}
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
              <StatRow label="Imported" value={progress.imported} color="text-green-600" />
              {progress.skipped > 0 && <StatRow label="Skipped" value={progress.skipped} />}
              {progress.failed > 0 && <StatRow label="Failed" value={progress.failed} color="text-red-500" />}
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

/* ------------------------------------------------------------------ */
/*  Summary step — extracted to stay within size limit                  */
/* ------------------------------------------------------------------ */

function SummaryStep({ summary, graphApiStats, graphApiInputRef, onGraphApiFile, backSidePairs,
  pairingMode, pairingSelection, assets, onStartPairing, onPairingTap, onUnpair, onDonePairing,
  onBack, onCancel, onImport }: {
  summary: ImportSummary;
  graphApiStats: GraphApiStats | null;
  graphApiInputRef: React.RefObject<HTMLInputElement | null>;
  onGraphApiFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  backSidePairs: Map<number, number>;
  pairingMode: boolean;
  pairingSelection: number[];
  assets: ParsedAsset[];
  onStartPairing: () => void;
  onPairingTap: (index: number) => void;
  onUnpair: (frontIndex: number) => void;
  onDonePairing: () => void;
  onBack: () => void;
  onCancel: () => void;
  onImport: () => void;
}) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">Ready to Import</h2>

      {/* Stats */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
        {summary.photos > 0 && <StatRow label="Photos" value={summary.photos} />}
        {summary.videos > 0 && <StatRow label="Videos" value={summary.videos} />}
        {summary.albums.length > 0 && <StatRow label="Albums" value={summary.albums.length} />}
        {summary.comments > 0 && <StatRow label="Comments" value={summary.comments} />}
        {summary.reactions > 0 && <StatRow label="Reactions" value={summary.reactions} />}
      </div>

      {/* Where assets go */}
      <div className="bg-blue-50 rounded-xl p-4 mb-4 text-left space-y-1.5">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-[#1877F2] mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-900">Your assets will be imported to:</p>
            <p className="text-xs text-gray-600 mt-1">
              A <span className="font-semibold">Facebook</span> folder in your asset library
              {summary.albums.length > 0 && (
                <>, with {summary.albums.length} album{summary.albums.length !== 1 ? 's' : ''} as sub-folders</>
              )}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 ml-6">
          Duplicates are automatically detected and won't be imported again.
        </p>
      </div>

      {/* Graph API enhancement */}
      <div className="border border-gray-200 rounded-xl p-4 mb-4 text-left">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Enhance with Graph API</h3>
        <p className="text-xs text-gray-500 mb-3">
          Your export only includes your own comments. Load a Graph API comments file to include friends' comments and reactions.
        </p>
        <input ref={graphApiInputRef} type="file" accept=".json" className="hidden" onChange={onGraphApiFile} />
        {graphApiStats ? (
          <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-xs text-green-700">
              Matched {graphApiStats.matched} photos — {graphApiStats.comments} comments, {graphApiStats.reactions} new reactions
            </span>
          </div>
        ) : (
          <button
            onClick={() => graphApiInputRef.current?.click()}
            className="w-full py-2 border border-[#1877F2] text-[#1877F2] rounded-lg text-sm font-semibold hover:bg-blue-50 transition"
          >
            Select Comments File
          </button>
        )}
      </div>

      {/* Front/back pairing */}
      <div className="border border-gray-200 rounded-xl p-4 mb-6 text-left">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-900">Front/Back Pairs</h3>
          {!pairingMode && (
            <button onClick={onStartPairing} className="text-xs font-semibold text-[#1877F2]">
              {backSidePairs.size > 0 ? 'Edit Pairs' : 'Link Photos'}
            </button>
          )}
        </div>
        {!pairingMode && (
          <p className="text-xs text-gray-500">
            {backSidePairs.size > 0
              ? `${backSidePairs.size} pair${backSidePairs.size !== 1 ? 's' : ''} linked.`
              : 'Link photos that are backs of other photos (e.g., handwriting on the back of a print).'}
          </p>
        )}
        {pairingMode && (
          <FacebookPairingGrid
            assets={assets}
            backSidePairs={backSidePairs}
            pairingSelection={pairingSelection}
            onTap={onPairingTap}
            onUnpair={onUnpair}
            onDone={onDonePairing}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          onClick={onImport}
          className="flex-[2] py-3 bg-[#1877F2] text-white rounded-xl font-semibold hover:bg-[#1565D8] transition"
        >
          Import All
        </button>
      </div>
      <button
        onClick={onCancel}
        className="w-full py-2 mt-3 text-sm text-gray-500 hover:text-gray-700 font-medium transition"
      >
        Cancel
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared UI                                                          */
/* ------------------------------------------------------------------ */

function StatRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold ${color || ''}`}>{value.toLocaleString()}</span>
    </div>
  );
}
