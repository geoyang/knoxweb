/**
 * Firebase Push Notification Configuration Test
 *
 * This module provides comprehensive testing for Firebase Cloud Messaging setup.
 * Run these tests to verify your FCM configuration is correct.
 */

import { firebaseConfig, getFirebaseApp, getFirebaseMessaging } from '../lib/firebase';
import {
  isPushSupported,
  getNotificationPermission,
  registerServiceWorker,
  initializePushNotifications,
  showLocalNotification,
  PushNotificationStatus,
} from './pushNotifications';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface TestSuiteResult {
  timestamp: string;
  browser: string;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

/**
 * Test 1: Check if Firebase config environment variables are set
 */
function testFirebaseConfigExists(): TestResult {
  const requiredVars = [
    { key: 'apiKey', envVar: 'VITE_FIREBASE_API_KEY' },
    { key: 'authDomain', envVar: 'VITE_FIREBASE_AUTH_DOMAIN' },
    { key: 'projectId', envVar: 'VITE_FIREBASE_PROJECT_ID' },
    { key: 'storageBucket', envVar: 'VITE_FIREBASE_STORAGE_BUCKET' },
    { key: 'messagingSenderId', envVar: 'VITE_FIREBASE_MESSAGING_SENDER_ID' },
    { key: 'appId', envVar: 'VITE_FIREBASE_APP_ID' },
  ];

  const missing: string[] = [];
  const present: string[] = [];

  for (const { key, envVar } of requiredVars) {
    const value = firebaseConfig[key as keyof typeof firebaseConfig];
    if (!value || value === '') {
      missing.push(envVar);
    } else {
      present.push(envVar);
    }
  }

  if (missing.length === 0) {
    return {
      name: 'Firebase Config Variables',
      passed: true,
      message: 'All Firebase config variables are set',
      details: { present },
    };
  }

  return {
    name: 'Firebase Config Variables',
    passed: false,
    message: `Missing Firebase config: ${missing.join(', ')}`,
    details: { missing, present },
  };
}

/**
 * Test 2: Check VAPID key for web push
 */
function testVapidKeyExists(): TestResult {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

  if (vapidKey && vapidKey.length > 0) {
    return {
      name: 'VAPID Key',
      passed: true,
      message: 'VAPID key is configured',
      details: { keyLength: vapidKey.length },
    };
  }

  return {
    name: 'VAPID Key',
    passed: false,
    message: 'VITE_FIREBASE_VAPID_KEY is not set. Get it from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates',
  };
}

/**
 * Test 3: Check browser support for push notifications
 */
function testBrowserSupport(): TestResult {
  const supported = isPushSupported();
  const features = {
    Notification: 'Notification' in window,
    serviceWorker: 'serviceWorker' in navigator,
    PushManager: 'PushManager' in window,
  };

  if (supported) {
    return {
      name: 'Browser Support',
      passed: true,
      message: 'Browser supports push notifications',
      details: features,
    };
  }

  const missing = Object.entries(features)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  return {
    name: 'Browser Support',
    passed: false,
    message: `Browser missing: ${missing.join(', ')}`,
    details: features,
  };
}

/**
 * Test 4: Check notification permission status
 */
function testNotificationPermission(): TestResult {
  const permission = getNotificationPermission();

  if (permission === 'granted') {
    return {
      name: 'Notification Permission',
      passed: true,
      message: 'Notifications are allowed',
      details: { permission },
    };
  }

  if (permission === 'denied') {
    return {
      name: 'Notification Permission',
      passed: false,
      message: 'Notifications are blocked. User must enable in browser settings.',
      details: { permission },
    };
  }

  return {
    name: 'Notification Permission',
    passed: false,
    message: 'Notification permission not yet requested (default)',
    details: { permission },
  };
}

/**
 * Test 5: Check if Firebase app initializes correctly
 */
function testFirebaseAppInit(): TestResult {
  try {
    const app = getFirebaseApp();
    if (app) {
      return {
        name: 'Firebase App Initialization',
        passed: true,
        message: 'Firebase app initialized successfully',
        details: { name: app.name, options: { projectId: app.options.projectId } },
      };
    }
    return {
      name: 'Firebase App Initialization',
      passed: false,
      message: 'Firebase app not initialized - check config',
    };
  } catch (error) {
    return {
      name: 'Firebase App Initialization',
      passed: false,
      message: `Firebase init error: ${error}`,
      details: { error: String(error) },
    };
  }
}

/**
 * Test 6: Check if Firebase Messaging initializes
 */
function testFirebaseMessagingInit(): TestResult {
  try {
    const messaging = getFirebaseMessaging();
    if (messaging) {
      return {
        name: 'Firebase Messaging Initialization',
        passed: true,
        message: 'Firebase Messaging initialized successfully',
      };
    }
    return {
      name: 'Firebase Messaging Initialization',
      passed: false,
      message: 'Firebase Messaging not initialized - check Firebase app init',
    };
  } catch (error) {
    return {
      name: 'Firebase Messaging Initialization',
      passed: false,
      message: `Messaging init error: ${error}`,
      details: { error: String(error) },
    };
  }
}

/**
 * Test 7: Check service worker registration
 */
async function testServiceWorkerRegistration(): Promise<TestResult> {
  try {
    const registration = await registerServiceWorker();
    if (registration) {
      return {
        name: 'Service Worker Registration',
        passed: true,
        message: 'Service worker registered successfully',
        details: { scope: registration.scope, state: registration.active?.state },
      };
    }
    return {
      name: 'Service Worker Registration',
      passed: false,
      message: 'Service worker registration returned null',
    };
  } catch (error) {
    return {
      name: 'Service Worker Registration',
      passed: false,
      message: `Service worker error: ${error}`,
      details: { error: String(error) },
    };
  }
}

/**
 * Test 8: Full push notification initialization
 */
async function testFullInitialization(): Promise<TestResult> {
  try {
    const status: PushNotificationStatus = await initializePushNotifications();

    if (status.token) {
      return {
        name: 'Full Push Notification Init',
        passed: true,
        message: 'Push notifications fully configured!',
        details: {
          supported: status.supported,
          permission: status.permission,
          tokenPreview: status.token.substring(0, 30) + '...',
        },
      };
    }

    return {
      name: 'Full Push Notification Init',
      passed: false,
      message: status.error || 'Failed to get FCM token',
      details: { ...status },
    };
  } catch (error) {
    return {
      name: 'Full Push Notification Init',
      passed: false,
      message: `Initialization error: ${error}`,
      details: { error: String(error) },
    };
  }
}

/**
 * Run all tests and return results
 */
export async function runPushNotificationTests(): Promise<TestSuiteResult> {
  console.log('🔥 Running Firebase Push Notification Tests...\n');

  const results: TestResult[] = [];

  // Synchronous tests
  results.push(testFirebaseConfigExists());
  results.push(testVapidKeyExists());
  results.push(testBrowserSupport());
  results.push(testNotificationPermission());
  results.push(testFirebaseAppInit());
  results.push(testFirebaseMessagingInit());

  // Async tests
  results.push(await testServiceWorkerRegistration());
  results.push(await testFullInitialization());

  // Print results
  console.log('\n📊 Test Results:\n');
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}: ${result.message}`);
    if (result.details && !result.passed) {
      console.log('   Details:', result.details);
    }
  }

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
  };

  console.log(`\n📈 Summary: ${summary.passed}/${summary.total} tests passed`);

  if (summary.failed > 0) {
    console.log('\n🔧 To fix issues:');
    console.log('1. Add Firebase config to .env (see .env.example)');
    console.log('2. Get VAPID key from Firebase Console > Cloud Messaging');
    console.log('3. Ensure you\'re running on HTTPS (required for service workers)');
  }

  return {
    timestamp: new Date().toISOString(),
    browser: navigator.userAgent,
    results,
    summary,
  };
}

/**
 * Quick test - just checks if basic config is present
 */
export function quickConfigCheck(): { configured: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!firebaseConfig.apiKey) issues.push('Missing VITE_FIREBASE_API_KEY');
  if (!firebaseConfig.projectId) issues.push('Missing VITE_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.messagingSenderId) issues.push('Missing VITE_FIREBASE_MESSAGING_SENDER_ID');
  if (!firebaseConfig.appId) issues.push('Missing VITE_FIREBASE_APP_ID');
  if (!import.meta.env.VITE_FIREBASE_VAPID_KEY) issues.push('Missing VITE_FIREBASE_VAPID_KEY');

  return {
    configured: issues.length === 0,
    issues,
  };
}

/**
 * Send a test notification (local, for testing UI)
 */
export function sendTestNotification(): void {
  showLocalNotification('Kizu Photo Test', {
    body: 'Push notifications are working! 🎉',
    tag: 'test-notification',
  });
}

// Export for console testing
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).testFirebasePush = {
    runTests: runPushNotificationTests,
    quickCheck: quickConfigCheck,
    sendTest: sendTestNotification,
  };
  console.log('🔥 Firebase Push Test loaded. Run: testFirebasePush.runTests()');
}
