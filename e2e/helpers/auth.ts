import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing env vars. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
    );
  }

  _adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

function getSupabaseUrl(): string {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('VITE_SUPABASE_URL not set');
  return url;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

const TEST_PASSWORD = 'E2eTest!Kizu2026';

export async function createTestUser(): Promise<TestUser> {
  const timestamp = Date.now();
  const email = `e2e-test-${timestamp}@kizu-test.com`;

  const adminClient = getAdminClient();

  const { data: userData, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Test User' },
    });

  if (createError || !userData.user) {
    throw new Error(`Failed to create test user: ${createError?.message}`);
  }

  const userId = userData.user.id;

  // Insert profile row
  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert({
      id: userId,
      full_name: 'E2E Test User',
      email,
    });

  if (profileError) {
    console.warn('Profile insert warning:', profileError.message);
  }

  // Sign in to get real tokens
  const { data: signInData, error: signInError } =
    await adminClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  return {
    id: userId,
    email,
    password: TEST_PASSWORD,
    accessToken: signInData.session.access_token,
    refreshToken: signInData.session.refresh_token,
  };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await getAdminClient().auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`Failed to delete test user ${userId}: ${error.message}`);
  }
}

export function buildStorageKey(): string {
  const supabaseUrl = getSupabaseUrl();
  const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] ?? 'localhost';
  return `sb-${projectRef}-auth-token`;
}

export function buildSessionPayload(user: TestUser) {
  return JSON.stringify({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: user.id,
      email: user.email,
      user_metadata: { full_name: 'E2E Test User' },
    },
  });
}
