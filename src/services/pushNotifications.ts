import { getToken, onMessage, Messaging } from 'firebase/messaging';
import { getFirebaseMessaging } from '../lib/firebase';

// Your VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

export interface PushNotificationStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  token: string | null;
  error: string | null;
}

/**
 * Check if push notifications are supported in this browser
 */
export function isPushSupported(): boolean {
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/**
 * Get the current notification permission status
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser');
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Register the Firebase messaging service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    console.log('Service Worker registered:', registration.scope);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    throw error;
  }
}

/**
 * Get the FCM token for this device
 */
export async function getFCMToken(messaging: Messaging): Promise<string | null> {
  if (!VAPID_KEY) {
    console.warn('VAPID key not configured. Set VITE_FIREBASE_VAPID_KEY in .env');
    return null;
  }

  try {
    // Ensure service worker is registered
    const registration = await registerServiceWorker();
    if (!registration) return null;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log('FCM Token obtained:', token.substring(0, 20) + '...');
      return token;
    } else {
      console.warn('No FCM token available. Request permission first.');
      return null;
    }
  } catch (error) {
    console.error('Failed to get FCM token:', error);
    throw error;
  }
}

/**
 * Initialize push notifications and get token
 */
export async function initializePushNotifications(): Promise<PushNotificationStatus> {
  const status: PushNotificationStatus = {
    supported: isPushSupported(),
    permission: getNotificationPermission(),
    token: null,
    error: null,
  };

  if (!status.supported) {
    status.error = 'Push notifications are not supported in this browser';
    return status;
  }

  const messaging = getFirebaseMessaging();
  if (!messaging) {
    status.error = 'Firebase Messaging not initialized. Check Firebase configuration.';
    return status;
  }

  // Request permission if not already granted
  if (status.permission !== 'granted') {
    try {
      status.permission = await requestNotificationPermission();
    } catch (error) {
      status.error = `Permission request failed: ${error}`;
      return status;
    }
  }

  if (status.permission !== 'granted') {
    status.error = 'Notification permission denied by user';
    return status;
  }

  // Get FCM token
  try {
    status.token = await getFCMToken(messaging);
  } catch (error) {
    status.error = `Failed to get FCM token: ${error}`;
  }

  return status;
}

/**
 * Listen for foreground messages
 */
export function onForegroundMessage(callback: (payload: unknown) => void): (() => void) | null {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    console.warn('Firebase Messaging not initialized');
    return null;
  }

  return onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);
    callback(payload);
  });
}

/**
 * Send a test notification (for development/testing)
 * Note: In production, notifications should be sent from your backend
 */
export function showLocalNotification(title: string, options?: NotificationOptions): void {
  if (!isPushSupported()) {
    console.warn('Notifications not supported');
    return;
  }

  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted');
    return;
  }

  new Notification(title, {
    icon: '/logo192.png',
    badge: '/logo192.png',
    ...options,
  });
}
