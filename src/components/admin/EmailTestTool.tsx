import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseUrl, getSupabaseAnonKey } from '../../lib/environments';

interface SendResult {
  to: string;
  timestamp: string;
  success: boolean;
  message: string;
}

export default function EmailTestTool() {
  const { session } = useAuth();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('Kizu Email Delivery Test');
  const [html, setHtml] = useState(
    `<h2>Kizu Email Delivery Test</h2><p>This is a test email sent at <strong>${new Date().toISOString()}</strong>.</p><p>If you received this, email delivery is working correctly.</p>`
  );
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<SendResult[]>([]);

  const handleSend = async () => {
    if (!to.trim()) return;
    setSending(true);

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/send-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
            'apikey': getSupabaseAnonKey(),
          },
          body: JSON.stringify({ to: to.trim(), subject, html }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setHistory(prev => [{
          to: to.trim(),
          timestamp: new Date().toLocaleTimeString(),
          success: true,
          message: `Sent successfully (ID: ${data.id || 'unknown'})`,
        }, ...prev]);
      } else {
        setHistory(prev => [{
          to: to.trim(),
          timestamp: new Date().toLocaleTimeString(),
          success: false,
          message: data.error || `HTTP ${response.status}`,
        }, ...prev]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setHistory(prev => [{
        to: to.trim(),
        timestamp: new Date().toLocaleTimeString(),
        success: false,
        message,
      }, ...prev]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Email Delivery Test</h1>

      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1">Recipient</label>
          <input
            type="email"
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="test@example.com"
            className="w-full px-3 py-2 border border-default rounded-md bg-surface text-theme-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-default rounded-md bg-surface text-theme-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1">Body (HTML)</label>
          <textarea
            value={html}
            onChange={e => setHtml(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 border border-default rounded-md bg-surface text-theme-primary font-mono text-sm"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={sending || !to.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send Test Email'}
        </button>
      </div>

      {history.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Results</h2>
          <div className="space-y-2">
            {history.map((result, i) => (
              <div
                key={i}
                className={`p-3 rounded border ${
                  result.success
                    ? 'border-green-300 bg-green-50 dark:bg-green-900/20'
                    : 'border-red-300 bg-red-50 dark:bg-red-900/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {result.success ? '✅' : '❌'} {result.to}
                  </span>
                  <span className="text-xs text-theme-muted">{result.timestamp}</span>
                </div>
                <p className="text-sm mt-1 text-theme-secondary">{result.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
