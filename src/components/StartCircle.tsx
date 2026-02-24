import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';
import { StartCircleClaimForm } from './StartCircleClaimForm';
import { StartCircleJoinForm } from './StartCircleJoinForm';
import { StartCircleSuccess } from './StartCircleSuccess';

type Step = 'loading' | 'claim' | 'join' | 'success' | 'error';

export const StartCircle: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);
  const [circleName, setCircleName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [newCircleName, setNewCircleName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasPromo, setHasPromo] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSeed();
  }, [token]);

  const loadSeed = async () => {
    if (!token) {
      setError('Invalid link');
      setStep('error');
      return;
    }

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/circle-seed-api?token=${token}`,
        { headers: { 'Authorization': `Bearer ${getSupabaseAnonKey()}` } }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || 'This link is invalid or has expired.');
        setStep('error');
        return;
      }

      if (result.is_claimed) {
        setCircleName(result.circle_name);
        setStep('join');
      } else {
        setStep('claim');
      }
    } catch (err) {
      console.error('Error loading seed:', err);
      setError('Failed to load link');
      setStep('error');
    }
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !newCircleName.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/circle-seed-api?action=claim`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getSupabaseAnonKey()}`,
          },
          body: JSON.stringify({
            seed_token: token,
            full_name: fullName.trim(),
            email: email.trim().toLowerCase(),
            circle_name: newCircleName.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to create circle');
        setSubmitting(false);
        return;
      }

      setCircleName(data.circle_name || newCircleName);
      setHasPromo(data.has_promo || false);
      setPromoMessage(data.promo_message || null);
      setStep('success');
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/circle-seed-api?action=join`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getSupabaseAnonKey()}`,
          },
          body: JSON.stringify({
            seed_token: token,
            full_name: fullName.trim(),
            email: email.trim().toLowerCase(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // If not yet claimed, switch to claim form
        if (data.error === 'not_yet_claimed') {
          setStep('claim');
          setSubmitting(false);
          return;
        }
        setError(data.error || 'Failed to join circle');
        setSubmitting(false);
        return;
      }

      setCircleName(data.circle_name || circleName);
      setHasPromo(data.has_promo || false);
      setPromoMessage(data.promo_message || null);
      setStep('success');
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Unable to Load</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">Please ask the person who shared this link for a new one.</p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center p-4">
        <StartCircleSuccess
          circleName={circleName}
          hasPromo={hasPromo}
          promoMessage={promoMessage}
        />
      </div>
    );
  }

  if (step === 'claim') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center p-4">
        <StartCircleClaimForm
          fullName={fullName}
          email={email}
          circleName={newCircleName}
          submitting={submitting}
          error={error}
          onFullNameChange={setFullName}
          onEmailChange={setEmail}
          onCircleNameChange={setNewCircleName}
          onSubmit={handleClaim}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center p-4">
      <StartCircleJoinForm
        fullName={fullName}
        email={email}
        submitting={submitting}
        error={error}
        circleName={circleName}
        onFullNameChange={setFullName}
        onEmailChange={setEmail}
        onSubmit={handleJoin}
      />
    </div>
  );
};
