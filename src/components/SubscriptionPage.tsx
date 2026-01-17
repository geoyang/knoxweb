import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const SubscriptionPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
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

    loadSubscriptionData();
  };

  const loadSubscriptionData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        navigate('/login');
        return;
      }

      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      };

      const [plansRes, statusRes, limitsRes, discountRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/functions/v1/subscription-api?action=plans`, { headers }),
        fetch(`${SUPABASE_URL}/functions/v1/subscription-api?action=status`, { headers }),
        fetch(`${SUPABASE_URL}/functions/v1/subscription-api?action=limits`, { headers }),
        fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout-api?action=get_discount`, { headers }),
      ]);

      const [plansData, statusData, limitsData, discountData] = await Promise.all([
        plansRes.json(),
        statusRes.json(),
        limitsRes.json(),
        discountRes.json(),
      ]);

      if (plansData.success) setPlans(plansData.plans || []);
      if (statusData.success) {
        setSubscription(statusData.subscription);
        setCurrentPlan(statusData.plan);
      }
      if (limitsData.success) {
        setUsage(limitsData.usage);
        setLimits(limitsData.limits);
      }
      if (discountData.success && discountData.discount) {
        setSystemDiscount(discountData.discount);
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
        setError(result.error || 'Failed to start checkout');
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

  const isTrialing = subscription?.status === 'trialing';
  const isSubscribed = subscription?.status === 'active';
  const isExpired = subscription?.status === 'expired';
  const isPerpetual = isTrialing && !subscription?.trial_end;
  const hasPromoApplied = subscription?.has_promo || false;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            {userName ? `Loading account for ${userName}...` : 'Loading account...'}
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
            onClick={() => window.location.href = 'kizu://subscription-complete'}
            className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
          >
            Return to App
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

        {/* Current Plan Banner */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Your Plan</p>
              <h2 className="text-3xl font-bold text-indigo-600">{currentPlan?.display_name || 'Free'}</h2>
            </div>
            <div className={`px-4 py-2 rounded-full text-white font-semibold ${
              isSubscribed ? 'bg-green-500' :
              isTrialing ? (isPerpetual ? 'bg-green-500' : 'bg-orange-500') :
              isExpired ? 'bg-red-500' : 'bg-gray-500'
            }`}>
              {isSubscribed ? 'Active' :
               isTrialing ? (isPerpetual ? '∞ Unlimited' : `${subscription?.trial_end ? Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0}d left`) :
               isExpired ? 'Expired' : 'Free'}
            </div>
          </div>
          {isTrialing && !isPerpetual && subscription?.trial_end && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Trial ends {new Date(subscription.trial_end).toLocaleDateString()}
            </p>
          )}
          {isSubscribed && subscription?.current_period_end && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Subscription renews {new Date(subscription.current_period_end).toLocaleDateString()}
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
                  <span className={usage.photos >= limits.max_photos ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                    {usage.photos.toLocaleString()} / {limits.max_photos.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${usage.photos >= limits.max_photos ? 'bg-red-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min(100, (usage.photos / limits.max_photos) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Storage */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Storage</span>
                  <span className={usage.storage_bytes >= limits.max_storage_bytes ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                    {formatStorage(usage.storage_bytes)} / {formatStorage(limits.max_storage_bytes)}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${usage.storage_bytes >= limits.max_storage_bytes ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (usage.storage_bytes / limits.max_storage_bytes) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Video */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Video Minutes</span>
                  <span className={usage.video_minutes >= limits.max_video_minutes ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                    {usage.video_minutes} / {limits.max_video_minutes}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${usage.video_minutes >= limits.max_video_minutes ? 'bg-red-500' : 'bg-purple-500'}`}
                    style={{ width: `${limits.max_video_minutes > 0 ? Math.min(100, (usage.video_minutes / limits.max_video_minutes) * 100) : 0}%` }}
                  />
                </div>
              </div>

              {/* Editors */}
              {limits.max_editors > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Editors</span>
                    <span className={(usage.editors || 0) >= limits.max_editors ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                      {usage.editors || 0} / {limits.max_editors}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(usage.editors || 0) >= limits.max_editors ? 'bg-red-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(100, ((usage.editors || 0) / limits.max_editors) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Contributors */}
              {limits.max_contributors > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Contributors</span>
                    <span className={(usage.contributors || 0) >= limits.max_contributors ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                      {usage.contributors || 0} / {limits.max_contributors}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(usage.contributors || 0) >= limits.max_contributors ? 'bg-red-500' : 'bg-teal-500'}`}
                      style={{ width: `${Math.min(100, ((usage.contributors || 0) / limits.max_contributors) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Read-only users */}
              {limits.max_read_only > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Read-Only Users</span>
                    <span className={(usage.read_only_users || 0) >= limits.max_read_only ? 'text-red-500 font-semibold' : 'text-gray-800 dark:text-white'}>
                      {usage.read_only_users || 0} / {limits.max_read_only === -1 ? '∞' : limits.max_read_only}
                    </span>
                  </div>
                  {limits.max_read_only !== -1 && (
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${(usage.read_only_users || 0) >= limits.max_read_only ? 'bg-red-500' : 'bg-cyan-500'}`}
                        style={{ width: `${Math.min(100, ((usage.read_only_users || 0) / limits.max_read_only) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-center gap-4 mb-6">
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

        {!isSubscribed && (
          <div className="mb-6">
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

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              if (isCurrent && isTrialing) return 'Subscribe Now';
              if (isCurrent) return 'Current Plan';
              if (isDowngrade) return 'Downgrade';
              return 'Upgrade';
            };

            const getButtonClass = () => {
              if (isCurrent && !isTrialing) return 'bg-gray-400 cursor-not-allowed';
              if (isDowngrade) return 'bg-orange-500 hover:bg-orange-600';
              return 'bg-indigo-600 hover:bg-indigo-700';
            };

            return (
              <div
                key={plan.id}
                className={`bg-white dark:bg-gray-800 rounded-xl p-6 border-2 transition ${
                  isCurrent ? 'border-indigo-500' : 'border-gray-200 dark:border-gray-700'
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
                      {isPerpetual ? '∞' : isTrialing ? 'TRIAL' : 'CURRENT'}
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

                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                  <div className="text-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <p className="font-semibold text-gray-800 dark:text-white">{formatStorage(plan.storage_bytes)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Storage</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <p className="font-semibold text-gray-800 dark:text-white">{plan.max_photos.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Photos</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <p className="font-semibold text-gray-800 dark:text-white">{plan.max_video_minutes || 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Video mins</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <p className="font-semibold text-gray-800 dark:text-white">{plan.max_editors}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Editors</p>
                  </div>
                </div>

                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={isCheckingOut || plan.name === 'free' || (isCurrent && !isTrialing)}
                  className={`w-full py-3 text-white rounded-lg font-medium disabled:opacity-50 transition ${getButtonClass()}`}
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
      </main>
    </div>
  );
};

export default SubscriptionPage;
