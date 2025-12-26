import { useState } from 'react';
import {
  runPushNotificationTests,
  quickConfigCheck,
  sendTestNotification,
  TestSuiteResult,
} from '../../services/testFirebasePush';

export default function PushNotificationTest() {
  const [results, setResults] = useState<TestSuiteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [quickCheck, setQuickCheck] = useState<{ configured: boolean; issues: string[] } | null>(null);

  const handleQuickCheck = () => {
    const check = quickConfigCheck();
    setQuickCheck(check);
  };

  const handleRunTests = async () => {
    setLoading(true);
    setResults(null);
    try {
      const testResults = await runPushNotificationTests();
      setResults(testResults);
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = () => {
    sendTestNotification();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Firebase Push Notification Test</h1>

      <div className="space-y-4 mb-8">
        <div className="flex gap-4">
          <button
            onClick={handleQuickCheck}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Quick Config Check
          </button>
          <button
            onClick={handleRunTests}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Running Tests...' : 'Run Full Test Suite'}
          </button>
          <button
            onClick={handleSendTest}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Send Test Notification
          </button>
        </div>
      </div>

      {quickCheck && (
        <div className={`p-4 rounded mb-6 ${quickCheck.configured ? 'bg-green-100' : 'bg-red-100'}`}>
          <h3 className="font-semibold mb-2">
            {quickCheck.configured ? '✅ Config looks good!' : '❌ Configuration Issues Found'}
          </h3>
          {quickCheck.issues.length > 0 && (
            <ul className="list-disc list-inside text-sm">
              {quickCheck.issues.map((issue, i) => (
                <li key={i} className="text-red-700">{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-gray-100 rounded">
            <span className="font-semibold">Test Summary</span>
            <span className={results.summary.failed === 0 ? 'text-green-600' : 'text-red-600'}>
              {results.summary.passed}/{results.summary.total} passed
            </span>
          </div>

          <div className="space-y-2">
            {results.results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded border ${
                  result.passed ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="mr-2">{result.passed ? '✅' : '❌'}</span>
                    <span className="font-medium">{result.name}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-1 ml-6">{result.message}</p>
                {result.details && !result.passed && (
                  <pre className="text-xs bg-gray-100 p-2 mt-2 rounded overflow-auto ml-6">
                    {JSON.stringify(result.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>

          <div className="text-xs text-gray-500 mt-4">
            Tested at: {results.timestamp}
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <h3 className="font-semibold text-yellow-800 mb-2">Setup Instructions</h3>
        <ol className="list-decimal list-inside text-sm text-yellow-700 space-y-1">
          <li>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="underline">Firebase Console</a></li>
          <li>Create a project or select existing one</li>
          <li>Go to Project Settings → General → Your apps → Add Web App</li>
          <li>Copy the config values to your .env file (VITE_FIREBASE_*)</li>
          <li>Go to Project Settings → Cloud Messaging → Web Push certificates</li>
          <li>Generate key pair and copy to VITE_FIREBASE_VAPID_KEY</li>
          <li>Restart dev server after updating .env</li>
        </ol>
      </div>
    </div>
  );
}
