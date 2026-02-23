import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey, getAppScheme } from '../lib/environments';
import { isPlaceholderEmail } from '../utils/phoneDisplayUtils';

interface Plan {
  id: string;
  name: string;
  display_name: string;
  storage_bytes: number;
  max_photos: number;
  max_video_minutes: number;
  max_editors: number;
  max_contributors: number;
  max_read_only_users: number;
  price_monthly_cents: number;
  price_yearly_cents: number;
}

interface Subscription {
  id: string;
  status: 'trialing' | 'active' | 'grace_period' | 'read_only' | 'cancelled' | 'expired' | 'free';
  trial_end: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  has_promo?: boolean;
  payment_provider?: 'apple' | 'stripe' | 'free' | 'promo';
  billing_cycle?: 'monthly' | 'yearly';
}

interface Usage {
  photos: number;
  video_minutes: number;
  storage_bytes: number;
  editors: number;
  contributors: number;
  read_only_users: number;
}

interface Limits {
  max_photos: number;
  max_video_minutes: number;
  max_storage_bytes: number;
  max_editors: number;
  max_contributors: number;
  max_read_only: number;
}

interface PromoResult {
  valid: boolean;
  benefits?: string[];
  error?: string;
  discount_percent?: number;
  trial_days?: number;
  is_perpetual?: boolean;
}

const SUPABASE_URL = getSupabaseUrl();

const handleReturnToApp = (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();

  // If in mobile WebView, post message to close
  if ((window as any).ReactNativeWebView) {
    (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'KIZU_CLOSE' }));
    return;
  }

  // Try the deep link
  window.location.href = `${getAppScheme()}://subscription-complete`;

  // If still here after a short delay, try closing the window (for in-app browsers)
  setTimeout(() => {
    window.close();
    // If window.close() didn't work (not opened by script), show message
    setTimeout(() => {
      if (!document.hidden) {
        alert('Please return to the Kizu app manually.');
      }
    }, 300);
  }, 500);
};

export const SubscriptionPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState<'authenticating' | 'loading_account'>('authenticating');
  const [userName, setUserName] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [systemDiscount, setSystemDiscount] = useState<{
    percent: number;
    label: string;
    description: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccessMessage('Your subscription has been updated. Return to Kizu to continue.');
      loadSubscriptionData();
    }
  }, [searchParams]);

  const initializeAuth = async () => {
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');

    // Extract user name from token early if possible
    if (accessToken) {
      try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        const earlyName = payload.user_metadata?.full_name || payload.user_metadata?.name || (!isPlaceholderEmail(payload.email) ? payload.email?.split('@')[0] : null) || null;
        if (earlyName) setUserName(earlyName);
      } catch {}
    }

    setLoadingPhase('authenticating');

    if (accessToken && refreshToken) {
      try {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState({}, '', '/subscription');
      } catch (err) {
        setError('Failed to authenticate. Please try again from the app.');
        setLoading(false);
        return;
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/login?redirect=/subscription');
      return;
    }

    // Get user name for loading display
    const userEmail = session.user?.email;
    const userMeta = session.user?.user_metadata;
    const displayName = userMeta?.full_name || userMeta?.name || userEmail?.split('@')[0] || null;
    setUserName(displayName);

    // Switch to loading account phase
    setLoadingPhase('loading_account');

    loadSubscriptionData();
  };

  const loadSubscriptionData = async () => {
    const loadStart = performance.now();
    console.log('[SubscriptionPage] Starting data load');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[SubscriptionPage] Got session in', (performance.now() - loadStart).toFixed(0), 'ms');

      if (!session?.access_token) {
        navigate('/login');
        return;
      }

      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        apikey: getSupabaseAnonKey(),
      };

      // Single API call for all page data
      const fetchStart = performance.now();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/subscription-api?action=page_data`, { headers });
      console.log('[SubscriptionPage] API response in', (performance.now() - fetchStart).toFixed(0), 'ms');

      const data = await response.json();
      console.log('[SubscriptionPage] Total load time:', (performance.now() - loadStart).toFixed(0), 'ms, status:', response.status);

      if (!response.ok) {
        console.error('[SubscriptionPage] API error:', response.status, data);
        setError(data.error || data.msg || `Server error (${response.status})`);
        return;
      }

      if (data.success) {
        setPlans(data.plans || []);
        setSubscription(data.subscription);
        setCurrentPlan(data.plan);
        setUsage(data.usage);
        setLimits(data.limits);
        if (data.discount) {
          setSystemDiscount(data.discount);
        }
      } else {
        setError(data.error || data.msg || 'Failed to load subscription data');
      }
    } catch (err) {
      console.error('Error loading subscription data:', err);
      setError('Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const validatePromoCode = async () => {
    if (!promoCode.trim()) return;

    setPromoValidating(true);
    setPromoResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/subscription-api?action=validate_promo&code=${encodeURIComponent(promoCode.trim())}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      const result = await response.json();

      if (result.valid) {
        setPromoResult({
          valid: true,
          benefits: result.promo.benefits,
          discount_percent: result.promo.discount_percent,
          trial_days: result.promo.trial_days,
          is_perpetual: result.promo.is_perpetual,
        });
      } else {
        setPromoResult({ valid: false, error: result.error || 'Invalid promo code' });
      }
    } catch (err) {
      setPromoResult({ valid: false, error: 'Failed to validate promo code' });
    } finally {
      setPromoValidating(false);
    }
  };

  const applyPromoCode = async () => {
    if (!promoCode.trim()) return;

    setPromoValidating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/subscription-api?action=apply_promo`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code: promoCode.trim() }),
        }
      );

      const result = await response.json();

      if (result.success) {
        setSuccessMessage(result.message);
        setPromoCode('');
        setPromoResult(null);
        setShowPromoInput(false);
        loadSubscriptionData();
      } else {
        setError(result.error || 'Failed to apply promo code');
      }
    } catch (err) {
      setError('Failed to apply promo code');
    } finally {
      setPromoValidating(false);
    }
  };

  const handleSelectPlan = async (plan: Plan) => {
    if (currentPlan?.id === plan.id && subscription?.status !== 'trialing') return;

    if (plan.name === 'free') {
      setError('To downgrade to free, use Manage Billing below or contact support.');
      return;
    }

    setCheckoutLoading(plan.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/stripe-checkout-api?action=create_checkout`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            plan_id: plan.id,
            billing_cycle: billingCycle,
            promo_code: promoResult?.valid ? promoCode.trim() : undefined,
            platform: 'web',
          }),
        }
      );

      const result = await response.json();

      if (result.success && result.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        console.error('[Checkout] Failed:', result);
        const debugInfo = result.debug ? ` (monthly: ${result.debug.stripe_price_id_monthly || 'null'}, yearly: ${result.debug.stripe_price_id_yearly || 'null'})` : '';
        setError((result.error || 'Failed to start checkout') + debugInfo);
      }
    } catch (err) {
      setError('Failed to start checkout');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/stripe-checkout-api?action=create_portal`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      const result = await response.json();

      if (result.success && result.portal_url) {
        window.location.href = result.portal_url;
      } else {
        setError(result.error || 'Failed to open billing portal');
      }
    } catch (err) {
      setError('Failed to open billing portal');
    }
  };

  const formatPrice = (cents: number) => {
    if (cents === 0) return 'Free';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatStorage = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb} GB`;
    return `${bytes / (1024 * 1024)} MB`;
  };

  // Render usage bar with limit marker when exceeded
  const renderUsageBar = (current: number, max: number, normalColor: string) => {
    const isExceeded = current > max && max > 0;
    const percentage = max > 0 ? (current / max) * 100 : 0;

    if (!isExceeded) {
      // Normal case
      return (
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${current >= max ? 'bg-red-500' : normalColor}`}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
      );
    }

    // Exceeded case: show full bar with limit marker
    // Cap visual at 150% so bar doesn't look too extreme
    const cappedPercentage = Math.min(percentage, 150);
    const limitPosition = (100 / cappedPercentage) * 100;

    return (
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-visible relative">
        {/* Fill up to limit in normal color */}
        <div
          className={`h-full rounded-l-full ${normalColor}`}
          style={{ width: `${limitPosition}%`, position: 'absolute', left: 0 }}
        />
        {/* Exceeded portion in red */}
        <div
          className="h-full rounded-r-full bg-red-500"
          style={{ width: `${100 - limitPosition}%`, position: 'absolute', left: `${limitPosition}%` }}
        />
        {/* Limit marker line */}
        <div
          className="absolute top-[-2px] w-0.5 h-3 bg-white dark:bg-gray-300 rounded shadow"
          style={{ left: `${limitPosition}%`, transform: 'translateX(-50%)' }}
        />
      </div>
    );
  };

  const isTrialing = subscription?.status === 'trialing';
  const isSubscribed = subscription?.status === 'active';
  const isExpired = subscription?.status === 'expired';
  const isPerpetual = isTrialing && !subscription?.trial_end;
  const hasPromoApplied = subscription?.has_promo || false;

  // Check if user has active Apple subscription (managed via iOS app)
  const hasAppleSubscription = subscription?.payment_provider === 'apple' &&
    ['active', 'trialing'].includes(subscription?.status || '');

  if (loading) {
    const getLoadingMessage = () => {
      if (loadingPhase === 'authenticating') {
        return userName ? `Authenticating ${userName}...` : 'Authenticating...';
      }
      return userName ? `Looking up account information for ${userName}...` : 'Looking up account information...';
    };

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            {getLoadingMessage()}
          </p>
        </div>
      </div>
    );
  }

  if (error && !subscription) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Error</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Manage Subscription</h1>
          <button
            onClick={handleReturnToApp}
            className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
          >
            Done
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {successMessage && (
          <div className="bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg mb-6">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
            {error}
            <button onClick={() => setError(null)} className="ml-4 underline">Dismiss</button>
          </div>
        )}

        {isExpired && (
          <div className="bg-red-600 text-white p-4 rounded-lg mb-6">
            <h3 className="font-bold text-lg">Subscription Expired</h3>
            <p>Please select a plan to continue using all features.</p>
          </div>
        )}

        {systemDiscount && (
          <div className="bg-emerald-500 text-white p-4 rounded-lg mb-6 flex items-center gap-4">
            <span className="text-3xl">🏷️</span>
            <div className="flex-1">
              <p className="font-bold">{systemDiscount.label}</p>
              <p className="text-sm opacity-90">{systemDiscount.description}</p>
            </div>
            <span className="text-2xl font-bold">{systemDiscount.percent}% OFF</span>
          </div>
        )}

        {/* Apple subscription warning */}
        {hasAppleSubscription && (
          <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-400 p-4 rounded-lg mb-6">
            <div className="flex items-start gap-4">
              <span className="text-2xl">📱</span>
              <div className="flex-1">
                <h3 className="font-bold text-amber-800 dark:text-amber-200">
                  Subscription Active via App Store
                </h3>
                <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                  Your {currentPlan?.display_name || 'subscription'} is managed through Apple.
                  To make changes, open the Kizu app on your iPhone or go to your Apple ID subscription settings.
                </p>
                <a
                  href="https://support.apple.com/en-us/HT202039"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition"
                >
                  How to manage Apple subscriptions
                  <span>↗</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Current Plan Banner */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Your Plan</p>
              <h2 className="text-3xl font-bold text-indigo-600">
                {currentPlan?.display_name || 'Free'}
                {subscription?.billing_cycle && (isSubscribed || isTrialing) && (
                  <span className="text-lg font-medium text-gray-500 dark:text-gray-400 ml-2">
                    ({subscription.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly'})
                  </span>
                )}
              </h2>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className={`px-4 py-2 rounded-full text-white font-semibold ${
                isSubscribed ? 'bg-green-500' :
                isTrialing ? (isPerpetual ? 'bg-green-500' : 'bg-orange-500') :
                isExpired ? 'bg-red-500' : 'bg-gray-500'
              }`}>
                {isSubscribed ? 'Active' :
                 isTrialing ? (isPerpetual ? '∞ Unlimited' : `${subscription?.trial_end ? Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0}d left`) :
                 isExpired ? 'Expired' : 'Free'}
              </div>
              {subscription?.payment_provider && ['apple', 'stripe'].includes(subscription.payment_provider) && (isSubscribed || isTrialing) && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                  subscription.payment_provider === 'apple'
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                }`}>
                  {subscription.payment_provider === 'apple' ? (
                    <>
                      <span className="text-sm">🍎</span>
                      <span>App Store</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm">💳</span>
                      <span>Web</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {isTrialing && !isPerpetual && subscription?.trial_end && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Trial ends {new Date(subscription.trial_end).toLocaleDateString()}
            </p>
          )}
          {isSubscribed && subscription?.current_period_end && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {subscription.has_promo ? 'Expires' : 'Subscription renews'} {new Date(subscription.current_period_end).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Usage Stats */}
        {usage && limits && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Account Usage</h3>
            <div className="space-y-4">
              {/* Photos */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Photos</span>
                  <span className={usage.photos > limits.max_photos ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                    {usage.photos.toLocaleString()} / {limits.max_photos.toLocaleString()}
                    {usage.photos > limits.max_photos && (
                      <span className="text-red-500 ml-1">(+{(usage.photos - limits.max_photos).toLocaleString()})</span>
                    )}
                  </span>
                </div>
                {renderUsageBar(usage.photos, limits.max_photos, 'bg-indigo-500')}
              </div>

              {/* Storage */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Storage</span>
                  <span className={usage.storage_bytes > limits.max_storage_bytes ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                    {formatStorage(usage.storage_bytes)} / {formatStorage(limits.max_storage_bytes)}
                    {usage.storage_bytes > limits.max_storage_bytes && (
                      <span className="text-red-500 ml-1">(+{formatStorage(usage.storage_bytes - limits.max_storage_bytes)})</span>
                    )}
                  </span>
                </div>
                {renderUsageBar(usage.storage_bytes, limits.max_storage_bytes, 'bg-emerald-500')}
              </div>

              {/* Video */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Video Minutes</span>
                  <span className={usage.video_minutes > limits.max_video_minutes ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                    {usage.video_minutes} / {limits.max_video_minutes}
                    {usage.video_minutes > limits.max_video_minutes && (
                      <span className="text-red-500 ml-1">(+{usage.video_minutes - limits.max_video_minutes})</span>
                    )}
                  </span>
                </div>
                {renderUsageBar(usage.video_minutes, limits.max_video_minutes, 'bg-purple-500')}
              </div>

              {/* Editors */}
              {limits.max_editors > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Editors</span>
                    <span className={(usage.editors || 0) > limits.max_editors ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                      {usage.editors || 0} / {limits.max_editors}
                      {(usage.editors || 0) > limits.max_editors && (
                        <span className="text-red-500 ml-1">(+{(usage.editors || 0) - limits.max_editors})</span>
                      )}
                    </span>
                  </div>
                  {renderUsageBar(usage.editors || 0, limits.max_editors, 'bg-blue-500')}
                </div>
              )}

              {/* Contributors */}
              {limits.max_contributors > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Contributors</span>
                    <span className={(usage.contributors || 0) > limits.max_contributors ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                      {usage.contributors || 0} / {limits.max_contributors}
                      {(usage.contributors || 0) > limits.max_contributors && (
                        <span className="text-red-500 ml-1">(+{(usage.contributors || 0) - limits.max_contributors})</span>
                      )}
                    </span>
                  </div>
                  {renderUsageBar(usage.contributors || 0, limits.max_contributors, 'bg-teal-500')}
                </div>
              )}

              {/* Read-only users */}
              {limits.max_read_only > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Read-Only Users</span>
                    <span className={(usage.read_only_users || 0) > limits.max_read_only && limits.max_read_only !== -1 ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                      {usage.read_only_users || 0} / {limits.max_read_only === -1 ? '∞' : limits.max_read_only}
                      {(usage.read_only_users || 0) > limits.max_read_only && limits.max_read_only !== -1 && (
                        <span className="text-red-500 ml-1">(+{(usage.read_only_users || 0) - limits.max_read_only})</span>
                      )}
                    </span>
                  </div>
                  {limits.max_read_only !== -1 && renderUsageBar(usage.read_only_users || 0, limits.max_read_only, 'bg-cyan-500')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sticky Billing Cycle Toggle - only show for non-Apple subscribers */}
        {!hasAppleSubscription && (
          <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 py-4 -mx-4 px-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2 rounded-lg font-medium transition ${
                  billingCycle === 'monthly'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-6 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
                  billingCycle === 'yearly'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                }`}
              >
                Yearly
                <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded">SAVE</span>
              </button>
            </div>
          </div>
        )}

        {/* Show promo code for non-active users or users without existing promo */}
        {(!isSubscribed || !hasPromoApplied) && (
          <div className="mb-6 mt-6">
            <button
              onClick={() => setShowPromoInput(!showPromoInput)}
              className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-2"
            >
              🏷️ {showPromoInput ? 'Hide promo code' : 'Have a promo code?'}
            </button>

            {showPromoInput && (
              <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      setPromoResult(null);
                    }}
                    placeholder="Enter promo code"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                  <button
                    onClick={validatePromoCode}
                    disabled={promoValidating || !promoCode.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {promoValidating ? 'Checking...' : 'Check'}
                  </button>
                </div>

                {promoResult && (
                  <div className={`mt-3 p-3 rounded-lg ${promoResult.valid ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                    {promoResult.valid ? (
                      <>
                        <p className="text-green-700 dark:text-green-400 font-medium">✓ Valid code!</p>
                        {promoResult.benefits?.map((benefit, i) => (
                          <p key={i} className="text-sm text-gray-700 dark:text-gray-300">{benefit}</p>
                        ))}
                        <button
                          onClick={applyPromoCode}
                          className="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                          Apply Now
                        </button>
                      </>
                    ) : (
                      <p className="text-red-700 dark:text-red-400">✗ {promoResult.error}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Plan cards - only show for non-Apple subscribers */}
        {!hasAppleSubscription && (
          <div className="grid md:grid-cols-2 gap-8 mt-6">
            {plans.map((plan) => {
              const isCurrent = currentPlan?.id === plan.id;
              const price = billingCycle === 'yearly' ? plan.price_yearly_cents : plan.price_monthly_cents;
              const currentPrice = currentPlan
                ? (billingCycle === 'yearly' ? currentPlan.price_yearly_cents : currentPlan.price_monthly_cents)
                : 0;
              const isDowngrade = currentPlan && price < currentPrice;
              const isUpgrade = currentPlan && price > currentPrice;
              const discountedPrice = systemDiscount && price > 0
                ? Math.round(price * (1 - systemDiscount.percent / 100))
                : price;
              const isCheckingOut = checkoutLoading === plan.id;

              const getButtonText = () => {
                if (isCheckingOut) return 'Loading...';
                if (isCurrent) return 'Current Plan';
                if (isDowngrade) return 'Downgrade';
                return 'Upgrade';
              };

              const getButtonClass = () => {
                if (isCurrent) return 'bg-gray-400 cursor-not-allowed';
                if (isDowngrade) return 'bg-orange-500 hover:bg-orange-600';
                return 'bg-indigo-600 hover:bg-indigo-700';
              };

              return (
                <div
                  key={plan.id}
                  className={`bg-white dark:bg-gray-800 p-4 flex flex-col rounded-lg overflow-hidden ${
                    isCurrent ? 'border-4 border-indigo-500' : 'border-2 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className={`text-lg font-bold ${isCurrent ? 'text-indigo-600' : 'text-gray-800 dark:text-white'}`}>
                      {plan.display_name}
                    </h3>
                    {isCurrent && (
                      <span className={`text-xs font-bold px-2 py-1 rounded ${
                        isPerpetual ? 'bg-green-500' : isTrialing ? 'bg-orange-500' : 'bg-indigo-500'
                      } text-white`}>
                        {isPerpetual ? '∞' : isTrialing ? 'TRIAL' : (subscription?.current_period_end
                          ? `${subscription.has_promo ? 'Expires' : 'Renews'} ${new Date(subscription.current_period_end).toLocaleDateString()}`
                          : 'ACTIVE')}
                      </span>
                    )}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
                    {systemDiscount && price > 0 && (
                      <span className="text-sm text-gray-400 line-through mr-2">{formatPrice(price)}</span>
                    )}
                    <span className="text-xl font-bold text-indigo-600">{formatPrice(discountedPrice)}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">/{billingCycle === 'yearly' ? 'year' : 'month'}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm mb-4">
                    <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 rounded p-2">
                      <p className="font-semibold text-gray-800 dark:text-white">{formatStorage(plan.storage_bytes)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Storage</p>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 rounded p-2">
                      <p className="font-semibold text-gray-800 dark:text-white">{plan.max_photos.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Photos</p>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 rounded p-2">
                      <p className="font-semibold text-gray-800 dark:text-white">{plan.max_video_minutes || 0}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Video mins</p>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 rounded p-2">
                      <p className="font-semibold text-gray-800 dark:text-white">{plan.max_editors}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Editors</p>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 rounded p-2">
                      <p className="font-semibold text-gray-800 dark:text-white">{plan.max_contributors}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Contributors</p>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 rounded p-2">
                      <p className="font-semibold text-gray-800 dark:text-white">{plan.max_read_only_users === -1 ? '∞' : plan.max_read_only_users}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Read-only</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      console.log('Plan clicked:', plan.name, plan.id);
                      handleSelectPlan(plan);
                    }}
                    disabled={isCheckingOut || plan.name === 'free' || isCurrent}
                    className={`w-full py-3 text-white rounded-lg font-medium disabled:opacity-50 transition relative z-10 ${getButtonClass()}`}
                  >
                    {getButtonText()}
                  </button>

                  {isDowngrade && !isCurrent && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 text-center">
                      You'll keep your current features until {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : 'your billing period ends'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isSubscribed && subscription?.stripe_customer_id && (
          <div className="mt-8">
            <button
              onClick={handleManageSubscription}
              className="w-full py-4 border-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 rounded-lg font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition flex items-center justify-center gap-2"
            >
              💳 Manage Billing & Payment
            </button>
          </div>
        )}

        <div className="mt-8 mb-8 flex justify-center">
          <button
            onClick={handleReturnToApp}
            className="px-8 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition"
          >
            Done
          </button>
        </div>
      </main>
    </div>
  );
};

export default SubscriptionPage;
