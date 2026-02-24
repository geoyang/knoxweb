import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/adminApi';

interface CircleSeed {
  id: string;
  token: string;
  circle_id: string | null;
  claimed_by: string | null;
  promo_code_id: string | null;
  default_role: string;
  label: string | null;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  date_created: string;
  url: string;
  circles: { name: string } | null;
  promo_codes: { code: string; description: string | null } | null;
}

interface PromoCodeOption {
  id: string;
  code: string;
  description: string | null;
}

interface CreatedBatch {
  seeds: Array<{ id: string; label: string | null; url: string }>;
}

export const CircleSeedsManager: React.FC = () => {
  const [seeds, setSeeds] = useState<CircleSeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [promoCodes, setPromoCodes] = useState<PromoCodeOption[]>([]);
  const [createdBatch, setCreatedBatch] = useState<CreatedBatch | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Form state
  const [formLabel, setFormLabel] = useState('');
  const [formPromoCodeId, setFormPromoCodeId] = useState('');
  const [formDefaultRole, setFormDefaultRole] = useState('contributor');
  const [formMaxUses, setFormMaxUses] = useState('');
  const [formExpiresInDays, setFormExpiresInDays] = useState('');
  const [formCount, setFormCount] = useState('1');

  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.id) {
      loadSeeds();
      loadPromoCodes();
    }
  }, [user?.id]);

  const loadSeeds = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await adminApi.getCircleSeeds();

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
        throw new Error(adminApi.handleApiError(result));
      }

      setSeeds(result.data?.seeds || []);
    } catch (err) {
      console.error('Error loading seeds:', err);
      setError(err instanceof Error ? err.message : 'Failed to load circle seeds');
    } finally {
      setLoading(false);
    }
  };

  const loadPromoCodes = async () => {
    try {
      const result = await adminApi.getPromoCodes();
      if (result.success && result.data?.promo_codes) {
        setPromoCodes(
          result.data.promo_codes
            .filter((p: any) => p.is_active)
            .map((p: any) => ({ id: p.id, code: p.code, description: p.description }))
        );
      }
    } catch (err) {
      console.error('Error loading promo codes:', err);
    }
  };

  const resetForm = () => {
    setFormLabel('');
    setFormPromoCodeId('');
    setFormDefaultRole('contributor');
    setFormMaxUses('');
    setFormExpiresInDays('');
    setFormCount('1');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);

      const count = Math.max(parseInt(formCount) || 1, 1);

      const result = await adminApi.createCircleSeed({
        label: formLabel || undefined,
        promo_code_id: formPromoCodeId || undefined,
        default_role: formDefaultRole,
        max_uses: formMaxUses ? parseInt(formMaxUses) : undefined,
        expires_in_days: formExpiresInDays ? parseInt(formExpiresInDays) : undefined,
        count,
      });

      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }

      setShowCreateForm(false);

      // Show batch results if multiple were created
      if (result.data?.seeds && result.data.seeds.length > 1) {
        setCreatedBatch({ seeds: result.data.seeds });
      }

      resetForm();
      await loadSeeds();
    } catch (err) {
      console.error('Error creating seed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create seed');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (seedId: string) => {
    if (!confirm('Are you sure you want to deactivate this seed?')) return;

    try {
      const result = await adminApi.revokeCircleSeed(seedId);
      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }
      await loadSeeds();
    } catch (err) {
      console.error('Error revoking seed:', err);
      setError(err instanceof Error ? err.message : 'Failed to revoke seed');
    }
  };

  const copyLink = async (url: string, seedId: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(seedId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      fallbackCopy(url);
      setCopiedId(seedId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const copyAllLinks = async (seedsList: Array<{ url: string }>) => {
    const text = seedsList.map((s) => s.url).join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      fallbackCopy(text);
    }
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const fallbackCopy = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const getStatusBadge = (seed: CircleSeed) => {
    if (!seed.is_active) {
      return <span className="px-2 py-0.5 bg-gray-500/20 text-theme-secondary text-xs rounded">Deactivated</span>;
    }
    if (seed.expires_at && new Date(seed.expires_at) < new Date()) {
      return <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded">Expired</span>;
    }
    if (seed.max_uses !== null && seed.current_uses >= seed.max_uses) {
      return <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded">Max Uses Reached</span>;
    }
    if (!seed.circle_id) {
      return <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">Unclaimed</span>;
    }
    return <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">Active</span>;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const roleLabel = (role: string) => {
    const labels: Record<string, string> = {
      read_only: 'Viewer',
      contributor: 'Contributor',
      editor: 'Editor',
      admin: 'Admin',
    };
    return labels[role] || role;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-theme-primary">Circle Seeds</h2>
        <button
          onClick={() => {
            resetForm();
            setShowCreateForm(true);
            setCreatedBatch(null);
          }}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2"
        >
          <span>+</span> New Seeds
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      {/* Batch Created Results */}
      {createdBatch && (
        <div className="mb-6 p-6 card-themed rounded-lg shadow-md border-2 border-green-500/30">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-theme-primary">
              Created {createdBatch.seeds.length} Seeds
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => copyAllLinks(createdBatch.seeds)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                {copiedAll ? 'Copied All!' : 'Copy All Links'}
              </button>
              <button
                onClick={() => setCreatedBatch(null)}
                className="px-3 py-2 text-theme-secondary hover:text-theme-primary text-sm"
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {createdBatch.seeds.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 p-2 bg-theme-secondary/5 rounded">
                <span className="text-xs text-theme-tertiary w-6 text-right">{i + 1}.</span>
                <code className="flex-1 text-sm text-theme-primary break-all">{s.url}</code>
                <button
                  onClick={() => copyLink(s.url, s.id)}
                  className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 text-xs flex-shrink-0"
                >
                  {copiedId === s.id ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="mb-6 p-6 card-themed rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-4 text-theme-primary">Create Circle Seeds</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">Quantity</label>
              <input
                type="number"
                value={formCount}
                onChange={(e) => setFormCount(e.target.value)}
                min="1"
                max="100"
                className="w-full input"
              />
              <p className="text-xs text-theme-tertiary mt-1">Each seed creates one unique link for one group (max 100)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">Label</label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="e.g., Valentine's Day Promo"
                className="w-full input"
              />
              <p className="text-xs text-theme-tertiary mt-1">Admin-facing description — each seed will be numbered automatically</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">Promo Code (optional)</label>
              <select
                value={formPromoCodeId}
                onChange={(e) => setFormPromoCodeId(e.target.value)}
                className="w-full input"
              >
                <option value="">No promo code</option>
                {promoCodes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}{p.description ? ` — ${p.description}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">Default Role for Joiners</label>
              <select
                value={formDefaultRole}
                onChange={(e) => setFormDefaultRole(e.target.value)}
                className="w-full input"
              >
                <option value="read_only">Viewer</option>
                <option value="contributor">Contributor</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
              <p className="text-xs text-theme-tertiary mt-1">Role assigned to users who join (the claimer always gets Admin)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">Max Uses per Seed (leave empty for unlimited)</label>
              <input
                type="number"
                value={formMaxUses}
                onChange={(e) => setFormMaxUses(e.target.value)}
                min="1"
                placeholder="Unlimited"
                className="w-full input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">Expires In (days, leave empty for no expiry)</label>
              <input
                type="number"
                value={formExpiresInDays}
                onChange={(e) => setFormExpiresInDays(e.target.value)}
                min="1"
                placeholder="No expiry"
                className="w-full input"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 btn-primary"
              >
                {saving ? 'Creating...' : `Create ${parseInt(formCount) > 1 ? `${formCount} Seeds` : 'Seed'}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  resetForm();
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Seeds List */}
      <div className="card-themed rounded-lg shadow-md overflow-hidden">
        <div className="p-4 bg-theme-secondary/10 border-b border-theme-border">
          <h3 className="font-semibold text-theme-primary">
            All Seeds ({seeds.length})
          </h3>
        </div>

        {seeds.length === 0 ? (
          <div className="p-8 text-center text-theme-secondary">
            No circle seeds yet. Create one to get started.
          </div>
        ) : (
          <div className="divide-y divide-theme-border">
            {seeds.map((seed) => (
              <div key={seed.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-theme-primary">
                        {seed.label || 'Untitled Seed'}
                      </span>
                      {getStatusBadge(seed)}
                      {seed.promo_codes && (
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">
                          {seed.promo_codes.code}
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-theme-secondary mt-1">
                      {seed.circles
                        ? <>Circle: <strong>{seed.circles.name}</strong></>
                        : <em>Not yet claimed</em>
                      }
                    </div>

                    <div className="text-xs text-theme-tertiary mt-2 space-x-3">
                      <span>Role: {roleLabel(seed.default_role)}</span>
                      <span>|</span>
                      <span>{seed.current_uses} uses{seed.max_uses !== null ? ` / ${seed.max_uses} max` : ''}</span>
                      <span>|</span>
                      <span>Created {formatDate(seed.date_created)}</span>
                      {seed.expires_at && (
                        <>
                          <span>|</span>
                          <span>Expires {formatDate(seed.expires_at)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    <button
                      onClick={() => copyLink(seed.url, seed.id)}
                      className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 text-sm"
                    >
                      {copiedId === seed.id ? 'Copied!' : 'Copy Link'}
                    </button>
                    {seed.is_active && (
                      <button
                        onClick={() => handleRevoke(seed.id)}
                        className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 text-sm"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CircleSeedsManager;
