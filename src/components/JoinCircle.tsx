import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';
import { JoinCircleForm } from './JoinCircleForm';
import { JoinCircleSuccess } from './JoinCircleSuccess';

type Step = 'loading' | 'form' | 'success' | 'error';

export const JoinCircle: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);
  const [circleName, setCircleName] = useState('');
  const [inviterName, setInviterName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasPromo, setHasPromo] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);

  useEffect(() => {
    loadInvite();
  }, [token]);

  const loadInvite = async () => {
    if (!token) {
      setError('Invalid invitation link');
      setStep('error');
      return;
    }

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/qr-circle-invite-api?token=${token}`,
        { headers: { 'Authorization': `Bearer ${getSupabaseAnonKey()}` } }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || 'This invitation link is invalid or has expired.');
        setStep('error');
        return;
      }

      setCircleName(result.circle_name);
      setInviterName(result.inviter_name);
      setStep('form');
    } catch (err) {
      console.error('Error loading invitation:', err);
      setError('Failed to load invitation');
      setStep('error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/qr-circle-invite-api?action=accept`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getSupabaseAnonKey()}`,
          },
          body: JSON.stringify({
            qr_token: token,
            full_name: fullName.trim(),
            email: email.trim().toLowerCase(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
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
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Unable to Load Invitation</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">Please ask the person who invited you for a new link.</p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center p-4">
        <JoinCircleSuccess
          circleName={circleName}
          hasPromo={hasPromo}
          promoMessage={promoMessage}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-4">
      <JoinCircleForm
        fullName={fullName}
        email={email}
        submitting={submitting}
        error={error}
        circleName={circleName}
        inviterName={inviterName}
        onFullNameChange={setFullName}
        onEmailChange={setEmail}
        onSubmit={handleSubmit}
      />
    </div>
  );
};
