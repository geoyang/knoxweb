import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  importServicesApi,
  importSourcesApi,
  importJobsApi,
  dedupApi,
  formatDuration,
  getServiceIcon,
  getServiceColor,
  ImportService,
  ImportSource,
  ImportJob,
  ImportAlbum,
  PlanInfo,
  DedupJob,
  DuplicateGroup,
} from '../../services/importApi';

export const ImportManager: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [services, setServices] = useState<ImportService[]>([]);
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<ImportSource | null>(null);
  const [albums, setAlbums] = useState<ImportAlbum[]>([]);
  const [selectedAlbums, setSelectedAlbums] = useState<Set<string>>(new Set());
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [newAssetsCount, setNewAssetsCount] = useState<number | null>(null);
  const [skipDedup, setSkipDedup] = useState(false);
  const [importing, setImporting] = useState(false);

  // Active job tracking
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Dedup state
  const [showDedupModal, setShowDedupModal] = useState(false);
  const [dedupJob, setDedupJob] = useState<DedupJob | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loadingDedup, setLoadingDedup] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<'sources' | 'history' | 'duplicates'>('sources');

  // Load essential data (services + sources). Jobs loaded lazily.
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [servicesRes, sourcesRes] = await Promise.all([
        importServicesApi.list(),
        importSourcesApi.list(),
      ]);

      if (servicesRes.success && servicesRes.services) {
        setServices(servicesRes.services);
      }

      if (sourcesRes.success) {
        setSources(sourcesRes.sources || []);
        setPlanInfo(sourcesRes.planInfo || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }

    // Check for active jobs in background (non-blocking)
    importJobsApi.list().then((jobsRes) => {
      if (jobsRes.success && jobsRes.jobs) {
        setJobs(jobsRes.jobs);
        setJobsLoaded(true);
        const active = jobsRes.jobs.find((j) =>
          ['pending', 'estimating', 'ready', 'importing'].includes(j.status)
        );
        if (active) {
          setActiveJob(active);
          startPolling(active.id);
        }
      }
    });
  }, []);

  useEffect(() => {
    loadData();
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [loadData]);

  // Polling for active job
  const startPolling = useCallback((jobId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    const poll = async () => {
      const result = await importJobsApi.status(jobId);
      if (result.success && result.job) {
        setActiveJob(result.job);
        if (['completed', 'failed', 'cancelled', 'blocked_limit', 'paused'].includes(result.job.status)) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          loadData();
        }
      }
    };

    pollIntervalRef.current = setInterval(poll, 2000);
    poll();
  }, [loadData]);

  // Check if service is connected
  const isServiceConnected = (serviceKey: string): boolean => {
    return sources.some((s) => {
      const service = services.find((svc) => svc.id === s.service_id);
      return service?.service_key === serviceKey && s.is_active;
    });
  };

  // Get source by service key
  const getSourceByServiceKey = (serviceKey: string): ImportSource | undefined => {
    return sources.find((s) => {
      const service = services.find((svc) => svc.id === s.service_id);
      return service?.service_key === serviceKey;
    });
  };

  // Handle connect service
  const handleConnect = async (serviceKey: string) => {
    const service = services.find((s) => s.service_key === serviceKey);
    if (!service) return;

    if (service.requires_app_review) {
      alert('This service is coming soon!');
      return;
    }

    // Camera roll is local only - not supported on web
    if (serviceKey === 'camera_roll') {
      alert('Camera Roll import is only available on mobile devices.');
      return;
    }

    const result = await importSourcesApi.connect(serviceKey);
    if (result.success && result.authUrl) {
      window.location.href = result.authUrl;
    } else if (result.success && result.source) {
      await loadData();
    } else {
      alert(result.error || 'Failed to connect');
    }
  };

  // Handle disconnect
  const handleDisconnect = async (source: ImportSource) => {
    if (!confirm('Are you sure you want to disconnect this source?')) return;

    const result = await importSourcesApi.disconnect(source.id);
    if (result.success) {
      await loadData();
    } else {
      alert(result.error || 'Failed to disconnect');
    }
  };

  // Handle source click - open import modal
  const handleSourceClick = async (source: ImportSource) => {
    setSelectedSource(source);
    setShowImportModal(true);
    setAlbums([]);
    setSelectedAlbums(new Set());
    setNewAssetsCount(null);

    // Check for new assets
    const result = await importSourcesApi.checkNew(source.id);
    if (result.success) {
      setNewAssetsCount(result.newCount ?? 0);
    }
  };

  // Load albums for source
  const handleLoadAlbums = async () => {
    if (!selectedSource) return;

    setLoadingAlbums(true);
    const result = await importSourcesApi.listAlbums(selectedSource.id);
    setLoadingAlbums(false);

    if (result.success && result.albums) {
      setAlbums(result.albums);
    } else {
      alert(result.error || 'Failed to load albums');
    }
  };

  // Toggle album selection
  const toggleAlbum = (albumId: string) => {
    setSelectedAlbums((prev) => {
      const next = new Set(prev);
      if (next.has(albumId)) {
        next.delete(albumId);
      } else {
        next.add(albumId);
      }
      return next;
    });
  };

  // Start import
  const handleStartImport = async () => {
    if (!selectedSource) return;

    setImporting(true);

    const options = {
      importScope: selectedAlbums.size > 0 ? 'albums' : 'full',
      selectedAlbumIds: selectedAlbums.size > 0 ? Array.from(selectedAlbums) : undefined,
      skipDeduplication: skipDedup,
    };

    const result = await importJobsApi.start(selectedSource.id, options);
    setImporting(false);

    if (result.success && result.job) {
      setShowImportModal(false);
      setActiveJob(result.job);
      startPolling(result.job.id);
    } else {
      alert(result.error || 'Failed to start import');
    }
  };

  // Cancel active job
  const handleCancelJob = async () => {
    if (!activeJob) return;

    if (!confirm('Are you sure you want to cancel this import?')) return;

    const result = await importJobsApi.cancel(activeJob.id);
    if (result.success) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setActiveJob(null);
      await loadData();
    } else {
      alert(result.error || 'Failed to cancel');
    }
  };

  // Start dedup scan
  const handleStartDedupScan = async () => {
    setLoadingDedup(true);
    const result = await dedupApi.startScan();
    setLoadingDedup(false);

    if (result.success && result.job) {
      setDedupJob(result.job);
      setShowDedupModal(true);
      startDedupPolling(result.job.id);
    } else {
      alert(result.error || 'Failed to start scan');
    }
  };

  // Rollback/Undo import
  const [rollbackJobId, setRollbackJobId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const handleRollback = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    const confirmed = window.confirm(
      `Are you sure you want to undo this import?\n\nThis will permanently delete ${job.imported_assets} photos that were imported from this job.\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setRollingBack(true);
    setRollbackJobId(jobId);

    const result = await importJobsApi.rollback(jobId);

    setRollingBack(false);
    setRollbackJobId(null);

    if (result.success) {
      alert(`Successfully rolled back import. ${result.deleted_assets} photos deleted.`);
      loadData(); // Refresh
    } else {
      alert(result.error || 'Failed to rollback import');
    }
  };

  // Dedup polling
  const startDedupPolling = (jobId: string) => {
    const poll = async () => {
      const result = await dedupApi.getStatus(jobId);
      if (result.success && result.job) {
        setDedupJob(result.job);
        if (['completed', 'failed', 'cancelled'].includes(result.job.status)) {
          // Load duplicate groups
          const groupsResult = await dedupApi.getGroups({ status: 'pending' });
          if (groupsResult.success && groupsResult.groups) {
            setDuplicateGroups(groupsResult.groups);
          }
        } else {
          setTimeout(() => poll(), 2000);
        }
      }
    };
    poll();
  };

  // Load duplicate groups
  const loadDuplicateGroups = async () => {
    setLoadingDedup(true);
    const result = await dedupApi.getGroups({ status: 'pending' });
    setLoadingDedup(false);

    if (result.success && result.groups) {
      setDuplicateGroups(result.groups);
    }
  };

  // Resolve duplicate group
  const handleResolveGroup = async (groupId: string, action: 'keep_one' | 'keep_all', keepAssetId?: string) => {
    const result = await dedupApi.resolveGroup(groupId, action, keepAssetId);
    if (result.success) {
      await loadDuplicateGroups();
    } else {
      alert(result.error || 'Failed to resolve');
    }
  };

  // Get service for source
  const getServiceForSource = (source: ImportSource): ImportService | undefined => {
    return services.find((s) => s.id === source.service_id);
  };

  // Render progress percentage
  const getProgress = (job: ImportJob): number => {
    if (!job.total_assets) return 0;
    return Math.round((job.processed_assets / job.total_assets) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Import Photos</h2>
          <p className="text-gray-600 mt-1">Import photos from other services into Kizu</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleStartDedupScan}
            disabled={loadingDedup}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            🔍 Find Duplicates
          </button>
        </div>
      </div>

      {/* Plan Info */}
      {planInfo && (
        <div className="bg-white rounded-lg border p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium text-gray-700">Photo Capacity</span>
            <span className="text-gray-600">
              {planInfo.current_photos.toLocaleString()} / {planInfo.max_photos.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                planInfo.remaining_photos < 100 ? 'bg-red-500' : 'bg-blue-600'
              }`}
              style={{ width: `${Math.min(100, (planInfo.current_photos / planInfo.max_photos) * 100)}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {planInfo.remaining_photos.toLocaleString()} photos remaining
          </p>
        </div>
      )}

      {/* Active Job Progress */}
      {activeJob && ['pending', 'importing', 'estimating'].includes(activeJob.status) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="font-medium text-blue-800">Importing Photos...</span>
            </div>
            <button
              onClick={handleCancelJob}
              className="text-red-600 hover:text-red-800 text-sm"
            >
              Cancel
            </button>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${getProgress(activeJob)}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-blue-700">
            <span>
              {activeJob.imported_assets.toLocaleString()} of {activeJob.total_assets.toLocaleString()} photos
            </span>
            <span>{getProgress(activeJob)}%</span>
          </div>
          {activeJob.skipped_duplicates > 0 && (
            <p className="text-sm text-blue-600 mt-1">
              {activeJob.skipped_duplicates} duplicates skipped
            </p>
          )}
        </div>
      )}

      {/* View Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4">
          <button
            onClick={() => setViewMode('sources')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              viewMode === 'sources'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Sources
          </button>
          <button
            onClick={() => {
              setViewMode('history');
              if (!jobsLoaded) {
                importJobsApi.list().then((res) => {
                  if (res.success && res.jobs) {
                    setJobs(res.jobs);
                    setJobsLoaded(true);
                  }
                });
              }
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              viewMode === 'history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Import History
          </button>
          <button
            onClick={() => {
              setViewMode('duplicates');
              loadDuplicateGroups();
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              viewMode === 'duplicates'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Duplicates
          </button>
        </nav>
      </div>

      {/* Sources View */}
      {viewMode === 'sources' && (
        <div className="grid gap-4 md:grid-cols-2">
          {services
            .filter((s) => s.is_active && s.service_key !== 'camera_roll')
            .map((service) => {
              const connected = isServiceConnected(service.service_key);
              const source = getSourceByServiceKey(service.service_key);

              return (
                <div
                  key={service.id}
                  className={`bg-white rounded-lg border p-4 ${
                    connected ? 'cursor-pointer hover:border-blue-300' : ''
                  }`}
                  onClick={() => connected && source && handleSourceClick(source)}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                      style={{ backgroundColor: `${getServiceColor(service.service_key)}15` }}
                    >
                      {getServiceIcon(service.service_key)}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{service.display_name}</h3>
                      {connected && source ? (
                        <p className="text-sm text-gray-600">
                          {source.total_assets_synced > 0
                            ? `${source.total_assets_synced.toLocaleString()} photos synced`
                            : 'Connected'}
                        </p>
                      ) : service.service_key === 'facebook' ? (
                        <p className="text-sm text-gray-500">Import from ZIP export</p>
                      ) : (
                        <p className="text-sm text-gray-500">
                          {service.requires_app_review ? 'Coming soon' : 'Not connected'}
                        </p>
                      )}
                    </div>
                    {connected ? (
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            source && handleDisconnect(source);
                          }}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : service.service_key === 'facebook' ? (
                      <button
                        onClick={() => navigate('/import/facebook')}
                        className="px-4 py-2 bg-[#1877F2] text-white rounded-lg hover:bg-[#1565D8]"
                      >
                        Import
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(service.service_key)}
                        disabled={service.requires_app_review}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* History View */}
      {viewMode === 'history' && (
        <div className="bg-white rounded-lg border">
          {!jobsLoaded ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No import history yet</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imported</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Skipped</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {job.service?.display_name || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          job.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : job.status === 'rolled_back'
                            ? 'bg-orange-100 text-orange-800'
                            : job.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : job.status === 'importing'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {job.status === 'rolled_back' ? 'undone' : job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {job.imported_assets.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {job.skipped_duplicates + job.skipped_similar}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(job.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {job.status === 'completed' && job.imported_assets > 0 && (
                        <button
                          onClick={() => handleRollback(job.id)}
                          disabled={rollingBack}
                          className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {rollbackJobId === job.id ? 'Undoing...' : 'Undo'}
                        </button>
                      )}
                      {job.status === 'rolled_back' && (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Duplicates View */}
      {viewMode === 'duplicates' && (
        <div className="space-y-4">
          {loadingDedup ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : duplicateGroups.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center">
              <p className="text-gray-500 mb-4">No duplicate groups found</p>
              <button
                onClick={handleStartDedupScan}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Scan for Duplicates
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                {duplicateGroups.length} duplicate group{duplicateGroups.length !== 1 ? 's' : ''} found
              </p>
              {duplicateGroups.map((group) => (
                <div key={group.id} className="bg-white rounded-lg border p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-medium">
                      {group.group_type === 'exact' ? '🔴 Exact Duplicates' : '🟡 Similar Images'}
                    </span>
                    <span className="text-sm text-gray-500">{group.asset_count} photos</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {group.assets?.map((item) => (
                      <div
                        key={item.id}
                        className={`relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 ${
                          item.is_primary ? 'border-blue-500' : 'border-transparent'
                        }`}
                      >
                        <img
                          src={item.asset?.thumbnail || item.asset?.path}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {item.is_primary && (
                          <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-1 rounded">
                            Best
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        const primary = group.assets?.find((a) => a.is_primary);
                        if (primary) {
                          handleResolveGroup(group.id, 'keep_one', primary.asset_id);
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      Keep Best, Delete Others
                    </button>
                    <button
                      onClick={() => handleResolveGroup(group.id, 'keep_all')}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      Keep All
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && selectedSource && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">
                  Import from {getServiceForSource(selectedSource)?.display_name}
                </h3>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
              {/* Stats */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Photos available</span>
                  <span className="font-medium">
                    {newAssetsCount !== null ? newAssetsCount.toLocaleString() : 'Checking...'}
                  </span>
                </div>
              </div>

              {/* Album Selection */}
              {albums.length === 0 ? (
                <button
                  onClick={handleLoadAlbums}
                  disabled={loadingAlbums}
                  className="w-full py-3 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  {loadingAlbums ? 'Loading albums...' : 'Select specific albums to import'}
                </button>
              ) : (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {albums.map((album) => (
                    <label
                      key={album.id}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAlbums.has(album.id)}
                        onChange={() => toggleAlbum(album.id)}
                        className="rounded text-blue-600"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{album.name}</p>
                        <p className="text-xs text-gray-500">{album.asset_count || 0} photos</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Skip Dedup Toggle */}
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDedup}
                  onChange={(e) => setSkipDedup(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <div>
                  <p className="font-medium text-sm">Skip duplicate check</p>
                  <p className="text-xs text-gray-500">Faster import, can check for duplicates later</p>
                </div>
              </label>
            </div>

            <div className="p-6 border-t bg-gray-50">
              <button
                onClick={handleStartImport}
                disabled={importing || (newAssetsCount !== null && newAssetsCount <= 0)}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {importing ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Starting...
                  </span>
                ) : selectedAlbums.size > 0 ? (
                  `Import ${selectedAlbums.size} Album${selectedAlbums.size !== 1 ? 's' : ''}`
                ) : newAssetsCount && newAssetsCount > 0 ? (
                  `Import ${newAssetsCount.toLocaleString()} Photos`
                ) : (
                  'No Photos to Import'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedup Progress Modal */}
      {showDedupModal && dedupJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">Scanning for Duplicates</h3>

            {dedupJob.status === 'completed' ? (
              <div className="text-center">
                <div className="text-4xl mb-4">✅</div>
                <p className="text-gray-700 mb-2">Scan complete!</p>
                <p className="text-sm text-gray-500 mb-4">
                  Found {dedupJob.duplicates_found} exact duplicates and {dedupJob.similar_found} similar images
                </p>
                <button
                  onClick={() => {
                    setShowDedupModal(false);
                    setViewMode('duplicates');
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  View Results
                </button>
              </div>
            ) : dedupJob.status === 'failed' ? (
              <div className="text-center">
                <div className="text-4xl mb-4">❌</div>
                <p className="text-gray-700 mb-2">Scan failed</p>
                <p className="text-sm text-red-500 mb-4">{dedupJob.error_message}</p>
                <button
                  onClick={() => setShowDedupModal(false)}
                  className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="text-gray-600">
                    {dedupJob.status === 'scanning' ? 'Scanning photos...' : 'Finding duplicates...'}
                  </span>
                </div>
                <div className="bg-gray-100 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${dedupJob.total_assets ? (dedupJob.scanned_assets / dedupJob.total_assets) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-gray-500">
                  {dedupJob.scanned_assets} of {dedupJob.total_assets || '?'} photos scanned
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportManager;
