import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const DebugSupabase: React.FC = () => {
  const [status, setStatus] = useState<string>('Testing...');
  const [details, setDetails] = useState<any>({});

  useEffect(() => {
    const testConnection = async () => {
      try {
        // Test 1: Check environment variables
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
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

        // Test 2: Basic Supabase connection with simpler query
        setStatus('🔍 Testing database connection...');
        console.log('Testing database connection...');
        
        try {
          // Test with albums table instead of profiles - profiles may have RLS restrictions
          setStatus('🔍 Testing with albums table...');
          console.log('Testing database connection with albums table...');
          
          const { data: albumData, error: albumError } = await Promise.race([
            supabase
              .from('albums')
              .select('id')
              .limit(1),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Albums query timeout')), 8000)
            )
          ]) as any;

          if (albumError) {
            console.error('Albums table error:', albumError);
            
            // Try circles table as fallback
            setStatus('🔍 Retrying with circles table...');
            const { data: circleData, error: circleError } = await Promise.race([
              supabase
                .from('circles')
                .select('id')
                .limit(1),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Circles query timeout')), 8000)
              )
            ]) as any;
            
            if (circleError) {
              console.error('Circles table error:', circleError);
              setStatus('❌ Database connection failed');
              setDetails({ 
                albumError: albumError.message,
                circleError: circleError.message,
                suggestion: 'Both albums and circles tables failed'
              });
              return;
            }
            
            console.log('Database connection successful with circles:', circleData);
            
          } else {
            console.log('Database connection successful with albums:', albumData);
          }
          
        } catch (dbErr) {
          console.error('Database connection timeout or error:', dbErr);
          setStatus('❌ Database timeout');
          setDetails({ 
            error: dbErr instanceof Error ? dbErr.message : 'Database connection timeout',
            timeout: '8 seconds',
            suggestion: 'Database connection timeout - check network or Supabase status'
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
          session: authData.session ? 'Active' : 'None',
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