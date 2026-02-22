import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';

type Status = 'loading' | 'confirm' | 'already_off' | 'success' | 'error';

export const Unsubscribe: React.FC = () => {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid');
  const sig = searchParams.get('sig');

  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const apiBase = `${getSupabaseUrl()}/functions/v1/email-unsubscribe`;

  console.log('[Unsubscribe] Component mounted, uid:', uid, 'sig:', sig?.slice(0, 8) + '...');
  console.log('[Unsubscribe] API base:', apiBase);

  useEffect(() => {
    if (!uid || !sig) {
      console.warn('[Unsubscribe] Missing uid or sig params');
      setError('Invalid unsubscribe link.');
      setStatus('error');
      return;
    }

    const url = `${apiBase}?uid=${uid}&sig=${sig}`;
    console.log('[Unsubscribe] Fetching status from:', url);

    fetch(url, {
      headers: { apikey: getSupabaseAnonKey() },
    })
      .then((res) => {
        console.log('[Unsubscribe] Response status:', res.status);
        return res.json();
      })
      .then((data) => {
        console.log('[Unsubscribe] Response data:', data);
        if (data.error) {
          setError(data.error);
          setStatus('error');
        } else if (data.already_unsubscribed) {
          setEmail(data.email);
          setStatus('already_off');
        } else {
          setEmail(data.email);
          setStatus('confirm');
        }
      })
      .catch((err) => {
        console.error('[Unsubscribe] Fetch error:', err);
        setError('Something went wrong. Please try again.');
        setStatus('error');
      });
  }, [uid, sig, apiBase]);

  const handleUnsubscribe = async () => {
    console.log('[Unsubscribe] User confirmed unsubscribe');
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}?uid=${uid}&sig=${sig}`, {
        method: 'POST',
        headers: { apikey: getSupabaseAnonKey() },
      });
      console.log('[Unsubscribe] POST response status:', res.status);
      const data = await res.json();
      console.log('[Unsubscribe] POST response data:', data);
      if (data.error) {
        setError(data.error);
        setStatus('error');
      } else {
        setStatus('success');
      }
    } catch (err) {
      console.error('[Unsubscribe] POST error:', err);
      setError('Something went wrong. Please try again.');
      setStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {status === 'loading' && (
          <>
            <h1 style={styles.title}>Kizu</h1>
            <p style={styles.text}>Loading...</p>
          </>
        )}

        {status === 'confirm' && (
          <>
            <h1 style={styles.title}>Kizu</h1>
            <p style={styles.text}>
              Turn off notification emails for <strong>{email}</strong>?
            </p>
            <p style={styles.muted}>
              You'll still receive important account emails (verification codes, security alerts).
            </p>
            <div style={styles.actions}>
              <button
                onClick={handleUnsubscribe}
                disabled={submitting}
                style={{ ...styles.btn, ...styles.btnPrimary }}
              >
                {submitting ? 'Unsubscribing...' : 'Unsubscribe'}
              </button>
              <a href="/admin/settings" style={{ ...styles.btn, ...styles.btnSecondary }}>
                Cancel
              </a>
            </div>
          </>
        )}

        {status === 'already_off' && (
          <>
            <h1 style={styles.title}>Kizu</h1>
            <p style={styles.text}>
              Email notifications are already turned off for <strong>{email}</strong>.
            </p>
            <a href="/admin/settings" style={{ ...styles.btn, ...styles.btnSecondary }}>
              Notification Settings
            </a>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 style={{ ...styles.title, color: '#16a34a' }}>Unsubscribed</h1>
            <p style={styles.text}>
              You will no longer receive notification emails from Kizu.
            </p>
            <p style={styles.muted}>
              You can re-enable them anytime from your notification settings.
            </p>
            <a href="/admin/settings" style={{ ...styles.btn, ...styles.btnSecondary }}>
              Notification Settings
            </a>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 style={styles.title}>Kizu</h1>
            <p style={styles.text}>{error}</p>
          </>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    margin: 0,
    padding: 0,
    background: '#f5f5f5',
    minHeight: '100vh',
  },
  card: {
    maxWidth: 440,
    margin: '80px auto',
    background: 'white',
    borderRadius: 12,
    padding: 40,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  title: {
    color: '#1e3c72',
    fontSize: 24,
    marginBottom: 8,
  },
  text: {
    color: '#555',
    lineHeight: 1.6,
    fontSize: 16,
  },
  muted: {
    color: '#888',
    fontSize: 14,
    lineHeight: 1.5,
  },
  actions: {
    marginTop: 24,
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
  },
  btn: {
    display: 'inline-block',
    padding: '12px 32px',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
    border: 'none',
  },
  btnPrimary: {
    background: '#dc2626',
    color: 'white',
  },
  btnSecondary: {
    background: '#e5e7eb',
    color: '#333',
  },
};
