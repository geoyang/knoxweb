import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/adminApi';

interface SiteDiscount {
  enabled: boolean;
  percent: number;
  code: string | null;
  applies_to: 'all' | 'new_users' | 'upgrades';
  starts_at: string | null;
  expires_at: string | null;
  banner_message: string | null;
}

const APPLIES_TO_OPTIONS = [
  { value: 'all', label: 'All Users' },
  { value: 'new_users', label: 'New Users Only' },
  { value: 'upgrades', label: 'Upgrades Only' },
] as const;

export const DiscountManager: React.FC = () => {
  const [discount, setDiscount] = useState<SiteDiscount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [percent, setPercent] = useState('0');
  const [code, setCode] = useState('');
  const [appliesTo, setAppliesTo] = useState<'all' | 'new_users' | 'upgrades'>('all');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');

  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.id) {
      loadDiscount();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  const loadDiscount = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await adminApi.getDiscount();

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
        throw new Error(adminApi.handleApiError(result));
      }

      const discountData = result.data?.discount;
      if (discountData) {
        setDiscount(discountData);
        populateForm(discountData);
      }
    } catch (err) {
      console.error('Error loading discount:', err);
      setError(err instanceof Error ? err.message : 'Failed to load discount settings');
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (data: SiteDiscount) => {
    setEnabled(data.enabled);
    setPercent(String(data.percent || 0));
    setCode(data.code || '');
    setAppliesTo(data.applies_to || 'all');
    setStartsAt(data.starts_at ? data.starts_at.split('T')[0] : '');
    setExpiresAt(data.expires_at ? data.expires_at.split('T')[0] : '');
    setBannerMessage(data.banner_message || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const result = await adminApi.setDiscount({
        enabled,
        percent: parseInt(percent) || 0,
        code: code || null,
        applies_to: appliesTo,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        banner_message: bannerMessage || null,
      });

      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }

      setSuccess('Discount settings saved successfully');
      if (result.data?.discount) {
        setDiscount(result.data.discount);
      }
    } catch (err) {
      console.error('Error saving discount:', err);
      setError(err instanceof Error ? err.message : 'Failed to save discount settings');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = () => {
    if (!discount) return null;

    if (!discount.enabled) {
      return <span className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-sm">Disabled</span>;
    }

    const now = new Date();
    if (discount.starts_at && new Date(discount.starts_at) > now) {
      return <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm">Scheduled</span>;
    }
    if (discount.expires_at && new Date(discount.expires_at) < now) {
      return <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">Expired</span>;
    }

    return <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">Active</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-theme-primary">Sitewide Discount</h2>
          <p className="text-theme-secondary mt-1">Configure promotional discounts for all users</p>
        </div>
        {getStatusBadge()}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-md text-red-700 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 hover:underline">Dismiss</button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-md text-green-700 dark:text-green-400">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Current Status Card */}
      {discount && (
        <div className="mb-6 p-6 card-themed rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-4 text-theme-primary">Current Settings</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-400">{discount.percent}%</div>
              <div className="text-sm text-blue-400/80">Discount</div>
            </div>
            <div className="p-3 bg-theme-secondary/10 rounded-lg text-center">
              <div className="text-lg font-bold text-theme-primary truncate">
                {discount.code || 'None'}
              </div>
              <div className="text-sm text-theme-secondary">Promo Code</div>
            </div>
            <div className="p-3 bg-theme-secondary/10 rounded-lg text-center">
              <div className="text-lg font-bold text-theme-primary">
                {APPLIES_TO_OPTIONS.find(o => o.value === discount.applies_to)?.label || 'All'}
              </div>
              <div className="text-sm text-theme-secondary">Applies To</div>
            </div>
            <div className="p-3 bg-theme-secondary/10 rounded-lg text-center">
              <div className="text-lg font-bold text-theme-primary">
                {formatDate(discount.expires_at)}
              </div>
              <div className="text-sm text-theme-secondary">Expires</div>
            </div>
          </div>
          {discount.banner_message && (
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="text-sm text-yellow-400/80 mb-1">Banner Message</div>
              <div className="text-theme-primary">{discount.banner_message}</div>
            </div>
          )}
        </div>
      )}

      {/* Edit Form */}
      <div className="card-themed rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4 text-theme-primary">Edit Discount</h3>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Enabled Toggle */}
          <div className="flex items-center justify-between p-4 bg-theme-secondary/5 rounded-lg">
            <div>
              <label className="font-medium text-theme-primary">Enable Discount</label>
              <p className="text-sm text-theme-secondary">Turn the sitewide discount on or off</p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-blue-600' : 'bg-gray-400'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Percent */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">
                Discount Percentage *
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  min="0"
                  max="100"
                  className="w-full input pr-8"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-secondary">%</span>
              </div>
            </div>

            {/* Promo Code */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">
                Promo Code (optional)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g., LAUNCH50"
                className="w-full input uppercase"
              />
            </div>

            {/* Applies To */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">
                Applies To
              </label>
              <select
                value={appliesTo}
                onChange={(e) => setAppliesTo(e.target.value as any)}
                className="w-full input"
              >
                {APPLIES_TO_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">
                Start Date (optional)
              </label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full input"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-1">
                End Date (optional)
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full input"
              />
            </div>
          </div>

          {/* Banner Message */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-1">
              Banner Message (optional)
            </label>
            <textarea
              value={bannerMessage}
              onChange={(e) => setBannerMessage(e.target.value)}
              placeholder="e.g., Launch Special - 50% off all plans!"
              rows={2}
              className="w-full input"
            />
            <p className="text-xs text-theme-tertiary mt-1">
              This message will be displayed to users when the discount is active
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex gap-4 pt-4 border-t border-theme-border">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              )}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => discount && populateForm(discount)}
              className="px-6 py-2 btn-secondary"
            >
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DiscountManager;
