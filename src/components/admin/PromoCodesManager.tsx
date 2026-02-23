import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/adminApi';
import { getDisplayIdentifier } from '../../utils/phoneDisplayUtils';

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  trial_days_override: number | null;
  is_perpetual_trial: boolean;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  date_created: string;
  subscription_plan_id: string | null;
  created_by_profile?: {
    display_name: string | null;
    email: string | null;
  };
  usage_count?: number;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  display_name: string;
}

interface PromoCodeStats {
  total_uses: number;
  active_users: number;
  cancelled_users: number;
  remaining_uses: number | null;
}

interface PromoCodeUser {
  user_id: string;
  display_name: string | null;
  email: string | null;
  status: string;
  signed_up_at: string;
}

// Preset duration options
const DURATION_PRESETS = [
  { label: '3 Months', days: 90 },
  { label: '6 Months', days: 180 },
  { label: '1 Year', days: 365 },
  { label: 'Perpetual (Forever)', days: null, isPerpetual: true },
  { label: 'Custom', days: -1 },
];

export const PromoCodesManager: React.FC = () => {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPromoCode, setSelectedPromoCode] = useState<PromoCode | null>(null);
  const [promoStats, setPromoStats] = useState<PromoCodeStats | null>(null);
  const [promoUsers, setPromoUsers] = useState<PromoCodeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewPromoForm, setShowNewPromoForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDurationPreset, setFormDurationPreset] = useState<string>('90');
  const [formCustomDays, setFormCustomDays] = useState('');
  const [formIsPerpetual, setFormIsPerpetual] = useState(false);
  const [formDiscountPercent, setFormDiscountPercent] = useState('0');
  const [formMaxUses, setFormMaxUses] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formSubscriptionPlanId, setFormSubscriptionPlanId] = useState<string>('');

  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.id) {
      loadPromoCodes();
      loadSubscriptionPlans();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  const loadSubscriptionPlans = async () => {
    try {
      const result = await adminApi.getSubscriptionPlans();
      if (result.success && result.data?.plans) {
        setSubscriptionPlans(result.data.plans);
      }
    } catch (err) {
      console.error('Error loading subscription plans:', err);
    }
  };

  const loadPromoCodes = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await adminApi.getPromoCodes();

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
        throw new Error(adminApi.handleApiError(result));
      }

      setPromoCodes(result.data?.promo_codes || []);
    } catch (err) {
      console.error('Error loading promo codes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load promo codes');
    } finally {
      setLoading(false);
    }
  };

  const loadPromoCodeStats = async (promoId: string) => {
    try {
      const result = await adminApi.getPromoCodeStats(promoId);

      if (!result.success) {
        console.warn('Could not load promo code stats:', adminApi.handleApiError(result));
        setPromoStats(null);
        setPromoUsers([]);
        return;
      }

      setPromoStats(result.data?.stats || null);
      setPromoUsers(result.data?.users || []);
    } catch (err) {
      console.error('Error loading promo code stats:', err);
      setPromoStats(null);
      setPromoUsers([]);
    }
  };

  const handleSelectPromoCode = async (promo: PromoCode) => {
    setSelectedPromoCode(promo);
    await loadPromoCodeStats(promo.id);
  };

  const resetForm = () => {
    setFormCode('');
    setFormDescription('');
    setFormDurationPreset('90');
    setFormCustomDays('');
    setFormIsPerpetual(false);
    setFormDiscountPercent('0');
    setFormMaxUses('');
    setFormExpiresAt('');
    setFormSubscriptionPlanId('');
  };

  const populateEditForm = (promo: PromoCode) => {
    setFormCode(promo.code);
    setFormDescription(promo.description || '');
    setFormDiscountPercent(String(promo.discount_percent || 0));
    setFormMaxUses(promo.max_uses ? String(promo.max_uses) : '');
    setFormExpiresAt(promo.expires_at ? promo.expires_at.split('T')[0] : '');
    setFormSubscriptionPlanId(promo.subscription_plan_id || '');

    if (promo.is_perpetual_trial) {
      setFormDurationPreset('perpetual');
      setFormIsPerpetual(true);
    } else if (promo.trial_days_override) {
      const preset = DURATION_PRESETS.find(p => p.days === promo.trial_days_override);
      if (preset) {
        setFormDurationPreset(String(preset.days));
      } else {
        setFormDurationPreset('custom');
        setFormCustomDays(String(promo.trial_days_override));
      }
      setFormIsPerpetual(false);
    } else {
      setFormDurationPreset('90');
      setFormIsPerpetual(false);
    }
  };

  const getTrialDaysFromForm = (): { trial_days_override?: number; is_perpetual_trial: boolean } => {
    if (formDurationPreset === 'perpetual') {
      return { is_perpetual_trial: true };
    }
    if (formDurationPreset === 'custom') {
      return {
        trial_days_override: parseInt(formCustomDays) || 90,
        is_perpetual_trial: false
      };
    }
    return {
      trial_days_override: parseInt(formDurationPreset) || 90,
      is_perpetual_trial: false
    };
  };

  const handleCreatePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formCode.trim()) {
      setError('Promo code is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const { trial_days_override, is_perpetual_trial } = getTrialDaysFromForm();

      const result = await adminApi.createPromoCode({
        code: formCode.toUpperCase().trim(),
        description: formDescription || undefined,
        trial_days_override,
        is_perpetual_trial,
        discount_percent: parseInt(formDiscountPercent) || 0,
        max_uses: formMaxUses ? parseInt(formMaxUses) : undefined,
        expires_at: formExpiresAt || undefined,
        subscription_plan_id: formSubscriptionPlanId || undefined,
      });

      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }

      setShowNewPromoForm(false);
      resetForm();
      await loadPromoCodes();
    } catch (err) {
      console.error('Error creating promo code:', err);
      setError(err instanceof Error ? err.message : 'Failed to create promo code');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPromoCode) return;

    try {
      setSaving(true);
      setError(null);

      const { trial_days_override, is_perpetual_trial } = getTrialDaysFromForm();

      const result = await adminApi.updatePromoCode({
        id: selectedPromoCode.id,
        description: formDescription || undefined,
        trial_days_override,
        is_perpetual_trial,
        discount_percent: parseInt(formDiscountPercent) || 0,
        max_uses: formMaxUses ? parseInt(formMaxUses) : undefined,
        expires_at: formExpiresAt || undefined,
        subscription_plan_id: formSubscriptionPlanId || undefined,
      });

      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }

      setShowEditForm(false);
      resetForm();
      await loadPromoCodes();
      // Refresh selected promo code
      if (result.data?.promo_code) {
        setSelectedPromoCode(result.data.promo_code);
      }
    } catch (err) {
      console.error('Error updating promo code:', err);
      setError(err instanceof Error ? err.message : 'Failed to update promo code');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (promo: PromoCode) => {
    try {
      const result = await adminApi.updatePromoCode({
        id: promo.id,
        is_active: !promo.is_active,
      });

      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }

      await loadPromoCodes();
    } catch (err) {
      console.error('Error toggling promo code:', err);
      setError(err instanceof Error ? err.message : 'Failed to update promo code');
    }
  };

  const handleDeletePromoCode = async (promoId: string) => {
    if (!confirm('Are you sure you want to delete this promo code?')) {
      return;
    }

    try {
      const result = await adminApi.deletePromoCode(promoId);

      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }

      if (selectedPromoCode?.id === promoId) {
        setSelectedPromoCode(null);
        setPromoStats(null);
        setPromoUsers([]);
      }
      await loadPromoCodes();
    } catch (err) {
      console.error('Error deleting promo code:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete promo code');
    }
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'KIZU-';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormCode(code);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDurationLabel = (promo: PromoCode): string => {
    if (promo.is_perpetual_trial) return 'Perpetual';
    if (promo.trial_days_override) {
      if (promo.trial_days_override === 90) return '3 Months';
      if (promo.trial_days_override === 180) return '6 Months';
      if (promo.trial_days_override === 365) return '1 Year';
      return `${promo.trial_days_override} Days`;
    }
    return 'Standard';
  };

  const getPlanLabel = (planId: string | null): string => {
    if (!planId) return 'Not Set';
    const plan = subscriptionPlans.find(p => p.id === planId);
    return plan?.display_name || 'Unknown';
  };

  // Render promo code form
  const renderPromoForm = (isEdit: boolean) => (
    <form onSubmit={isEdit ? handleUpdatePromoCode : handleCreatePromoCode} className="space-y-4">
      {/* Code */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">
          Promo Code *
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={formCode}
            onChange={(e) => setFormCode(e.target.value.toUpperCase())}
            disabled={isEdit}
            placeholder="e.g., KNOX-ABC123"
            className="flex-1 input uppercase"
            required
          />
          {!isEdit && (
            <button
              type="button"
              onClick={generateRandomCode}
              className="px-3 py-2 btn-secondary"
            >
              Generate
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">
          Description
        </label>
        <input
          type="text"
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder="e.g., Beta tester reward"
          className="w-full input"
        />
      </div>

      {/* Subscription Plan */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">
          Subscription Level *
        </label>
        <select
          value={formSubscriptionPlanId}
          onChange={(e) => setFormSubscriptionPlanId(e.target.value)}
          className="w-full input"
          required
        >
          <option value="">Select a plan...</option>
          {subscriptionPlans.filter(p => p.name !== 'free').map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.display_name}
            </option>
          ))}
        </select>
        <p className="text-xs text-theme-tertiary mt-1">
          The subscription tier users get when redeeming this code
        </p>
      </div>

      {/* Duration */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">
          Subscription Duration *
        </label>
        <select
          value={formDurationPreset}
          onChange={(e) => {
            setFormDurationPreset(e.target.value);
            setFormIsPerpetual(e.target.value === 'perpetual');
          }}
          className="w-full input"
        >
          {DURATION_PRESETS.map((preset) => (
            <option key={preset.label} value={preset.isPerpetual ? 'perpetual' : preset.days === -1 ? 'custom' : preset.days ?? 0}>
              {preset.label}
            </option>
          ))}
        </select>

        {formDurationPreset === 'custom' && (
          <input
            type="number"
            value={formCustomDays}
            onChange={(e) => setFormCustomDays(e.target.value)}
            placeholder="Number of days"
            min="1"
            className="w-full mt-2 input"
            required
          />
        )}
        <p className="text-xs text-theme-tertiary mt-1">
          How long the subscription lasts after redemption
        </p>
      </div>

      {/* Discount (optional) */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">
          Discount % (optional, for paid plans after trial)
        </label>
        <input
          type="number"
          value={formDiscountPercent}
          onChange={(e) => setFormDiscountPercent(e.target.value)}
          min="0"
          max="100"
          className="w-full input"
        />
      </div>

      {/* Max Uses */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">
          Max Uses (leave empty for unlimited)
        </label>
        <input
          type="number"
          value={formMaxUses}
          onChange={(e) => setFormMaxUses(e.target.value)}
          min="1"
          placeholder="Unlimited"
          className="w-full input"
        />
      </div>

      {/* Expires At */}
      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">
          Code Valid Until (optional)
        </label>
        <input
          type="date"
          value={formExpiresAt}
          onChange={(e) => setFormExpiresAt(e.target.value)}
          className="w-full input"
        />
        <p className="text-xs text-theme-tertiary mt-1">
          Last date this code can be redeemed
        </p>
      </div>

      {/* Submit buttons */}
      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 btn-primary"
        >
          {saving ? 'Saving...' : isEdit ? 'Update Code' : 'Create Code'}
        </button>
        <button
          type="button"
          onClick={() => {
            isEdit ? setShowEditForm(false) : setShowNewPromoForm(false);
            resetForm();
          }}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );

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
        <h2 className="text-2xl font-bold text-theme-primary">Promo Codes</h2>
        <button
          onClick={() => {
            resetForm();
            setShowNewPromoForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          <span>+</span> New Promo Code
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

      {/* New Promo Code Form */}
      {showNewPromoForm && (
        <div className="mb-6 p-6 card-themed rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-4 text-theme-primary">Create New Promo Code</h3>
          {renderPromoForm(false)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Promo Codes List */}
        <div className="card-themed rounded-lg shadow-md overflow-hidden">
          <div className="p-4 bg-theme-secondary/10 border-b border-theme-border">
            <h3 className="font-semibold text-theme-primary">
              All Promo Codes ({promoCodes.length})
            </h3>
          </div>

          {promoCodes.length === 0 ? (
            <div className="p-8 text-center text-theme-secondary">
              No promo codes yet. Create one to get started.
            </div>
          ) : (
            <div className="divide-y divide-theme-border">
              {promoCodes.map((promo) => (
                <div
                  key={promo.id}
                  onClick={() => handleSelectPromoCode(promo)}
                  className={`p-4 cursor-pointer hover:bg-theme-hover transition-colors ${
                    selectedPromoCode?.id === promo.id ? 'bg-blue-500/10 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-lg text-theme-primary">{promo.code}</span>
                        {!promo.is_active && (
                          <span className="px-2 py-0.5 bg-gray-500/20 text-theme-secondary text-xs rounded">
                            Inactive
                          </span>
                        )}
                        {promo.is_perpetual_trial && (
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">
                            Perpetual
                          </span>
                        )}
                      </div>
                      {promo.description && (
                        <p className="text-sm text-theme-secondary mt-1">{promo.description}</p>
                      )}
                      <div className="text-xs text-theme-tertiary mt-2 space-x-3">
                        <span className="text-blue-400">{getPlanLabel(promo.subscription_plan_id)}</span>
                        <span>|</span>
                        <span>{getDurationLabel(promo)}</span>
                        <span>|</span>
                        <span>{promo.usage_count || 0} uses</span>
                        {promo.max_uses && (
                          <>
                            <span>/</span>
                            <span>{promo.max_uses} max</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(promo);
                        }}
                        className={`px-2 py-1 text-xs rounded ${
                          promo.is_active
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-gray-500/20 text-theme-secondary hover:bg-gray-500/30'
                        }`}
                      >
                        {promo.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Promo Code Details */}
        <div className="card-themed rounded-lg shadow-md overflow-hidden">
          {selectedPromoCode ? (
            <>
              <div className="p-4 bg-theme-secondary/10 border-b border-theme-border flex justify-between items-center">
                <h3 className="font-semibold text-theme-primary">
                  {selectedPromoCode.code} Details
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      populateEditForm(selectedPromoCode);
                      setShowEditForm(true);
                    }}
                    className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeletePromoCode(selectedPromoCode.id)}
                    className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {showEditForm ? (
                <div className="p-4">
                  <h4 className="font-medium mb-4 text-theme-primary">Edit Promo Code</h4>
                  {renderPromoForm(true)}
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {/* Stats */}
                  {promoStats && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-blue-500/10 rounded-lg">
                        <div className="text-2xl font-bold text-blue-400">{promoStats.total_uses}</div>
                        <div className="text-sm text-blue-400/80">Total Uses</div>
                      </div>
                      <div className="p-3 bg-green-500/10 rounded-lg">
                        <div className="text-2xl font-bold text-green-400">{promoStats.active_users}</div>
                        <div className="text-sm text-green-400/80">Active Users</div>
                      </div>
                      {promoStats.remaining_uses !== null && (
                        <div className="p-3 bg-orange-500/10 rounded-lg">
                          <div className="text-2xl font-bold text-orange-400">{promoStats.remaining_uses}</div>
                          <div className="text-sm text-orange-400/80">Remaining</div>
                        </div>
                      )}
                      <div className="p-3 bg-theme-secondary/10 rounded-lg">
                        <div className="text-2xl font-bold text-theme-primary">{promoStats.cancelled_users}</div>
                        <div className="text-sm text-theme-secondary">Cancelled</div>
                      </div>
                    </div>
                  )}

                  {/* Details */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b border-theme-border">
                      <span className="text-theme-secondary">Subscription Level:</span>
                      <span className="font-medium text-blue-400">{getPlanLabel(selectedPromoCode.subscription_plan_id)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-theme-border">
                      <span className="text-theme-secondary">Duration:</span>
                      <span className="font-medium text-theme-primary">{getDurationLabel(selectedPromoCode)}</span>
                    </div>
                    {selectedPromoCode.discount_percent > 0 && (
                      <div className="flex justify-between py-2 border-b border-theme-border">
                        <span className="text-theme-secondary">Discount:</span>
                        <span className="font-medium text-theme-primary">{selectedPromoCode.discount_percent}%</span>
                      </div>
                    )}
                    <div className="flex justify-between py-2 border-b border-theme-border">
                      <span className="text-theme-secondary">Created:</span>
                      <span className="font-medium text-theme-primary">{formatDate(selectedPromoCode.date_created)}</span>
                    </div>
                    {selectedPromoCode.expires_at && (
                      <div className="flex justify-between py-2 border-b border-theme-border">
                        <span className="text-theme-secondary">Expires:</span>
                        <span className="font-medium text-theme-primary">{formatDate(selectedPromoCode.expires_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* Users who used this code */}
                  {promoUsers.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2 text-theme-primary">Users ({promoUsers.length})</h4>
                      <div className="max-h-48 overflow-y-auto border border-theme-border rounded-md divide-y divide-theme-border">
                        {promoUsers.map((user) => (
                          <div key={user.user_id} className="p-2 text-sm">
                            <div className="font-medium text-theme-primary">{user.display_name || getDisplayIdentifier(user.email)}</div>
                            <div className="text-xs text-theme-tertiary flex justify-between">
                              <span>{user.status}</span>
                              <span>{formatDate(user.signed_up_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center text-theme-secondary">
              Select a promo code to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromoCodesManager;
