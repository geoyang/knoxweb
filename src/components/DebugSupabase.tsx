import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';

export const DebugSupabase: React.FC = () => {
  const [status, setStatus] = useState<string>('Testing...');
  const [details, setDetails] = useState<any>({});

  useEffect(() => {
    const testConnection = async () => {
      try {
        // Test 1: Check environment variables
        const url = getSupabaseUrl();
        const key = getSupabaseAnonKey();
        
        console.log('=== Supabase Debug Test Starting ===');
        console.log('Environment variables:');
        console.log('VITE_SUPABASE_URL:', url);
        console.log('VITE_SUPABASE_ANON_KEY:', key ? `${key.substring(0, 20)}...` : 'MISSING');
        console.log('Supabase client object:', supabase);
        
        if (!url || !key) {
          setStatus('❌ Missing environment variables');
          setDetails({ url: !!url, key: !!key });
          return;
        }

        // Test 1.5: Network connectivity with proper REST API test
        setStatus('🔍 Testing network connectivity...');
        try {
          const response = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, { 
            method: 'GET',
            headers: {
              'apikey': key,
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(8000)
          });
          console.log('Network test response:', response.status);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          console.log('Network test data:', data);
          
        } catch (netErr) {
          console.warn('Network connectivity issue:', netErr);
          setStatus('❌ Network connectivity failed');
          setDetails({ 
            networkError: netErr instanceof Error ? netErr.message : 'Unknown network error',
            url,
            hasKey: !!key 
          });
          return;
        }

        // Test 2: Test edge function connectivity (no direct database calls)
        setStatus('🔍 Testing API connection...');
        console.log('Testing API connection...');

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          // Test subscription API (public endpoint)
          const response = await fetch(`${url}/functions/v1/subscription-api?action=plans`, {
            method: 'GET',
            headers: {
              'apikey': key,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            console.error('API test failed:', response.status);
            setStatus('❌ API connection failed');
            setDetails({
              status: response.status,
              statusText: response.statusText,
              suggestion: 'Edge function API not responding'
            });
            return;
          }

          const apiData = await response.json();
          console.log('API connection successful:', apiData);

        } catch (apiErr) {
          console.error('API connection timeout or error:', apiErr);
          setStatus('❌ API timeout');
          setDetails({
            error: apiErr instanceof Error ? apiErr.message : 'API connection timeout',
            timeout: '8 seconds',
            suggestion: 'API connection timeout - check network or Supabase status'
          });
          return;
        }

        // Test 3: Check auth endpoint
        setStatus('🔍 Testing auth endpoint...');
        console.log('Testing auth endpoint...');
        
        try {
          const { data: authData, error: authError } = await Promise.race([
            supabase.auth.getSession(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Auth timeout')), 10000)
            )
          ]) as any;
          
          if (authError) {
            console.error('Auth session error:', authError);
            setStatus('❌ Auth endpoint failed');
            setDetails({ error: authError.message });
            return;
          }

          console.log('Auth session test successful:', !!authData.session);
          
        } catch (authErr) {
          console.error('Auth endpoint timeout or error:', authErr);
          setStatus('❌ Auth timeout');
          setDetails({ 
            authError: authErr instanceof Error ? authErr.message : 'Auth timeout',
            suggestion: 'Auth service may be slow or unavailable'
          });
          return;
        }

        setStatus('✅ Supabase connection working');
        setDetails({
          url,
          hasKey: !!key,
          session: 'Checked',
          dbAccess: 'OK'
        });

      } catch (err) {
        console.error('Test failed:', err);
        setStatus('❌ Unexpected error');
        setDetails({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    };

    testConnection();
  }, []);

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h3 className="text-lg font-semibold mb-2">Supabase Connection Test</h3>
      <p className="mb-2">{status}</p>
      <pre className="text-xs bg-white p-2 rounded overflow-auto">
        {JSON.stringify(details, null, 2)}
      </pre>
    </div>
  );
};