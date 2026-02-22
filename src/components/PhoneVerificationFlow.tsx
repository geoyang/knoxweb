import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { CountryCodePicker } from './ui/CountryCodePicker';
import { DEFAULT_COUNTRY, CountryData } from '../data/countries';
import { formatPhoneForInput, extractDigits } from '../utils/phoneFormatting';

interface Props {
  onVerified: (phone: string) => void;
  onCancel: () => void;
  initialPhone?: string;
}

type Step = 'phone' | 'code';

export const PhoneVerificationFlow: React.FC<Props> = ({ onVerified, onCancel, initialPhone }) => {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState(initialPhone || '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState<CountryData>(DEFAULT_COUNTRY);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'code' && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [step]);

  const handleSendCode = async () => {
    const digits = extractDigits(phone, selectedCountry.dialCode);
    const minDigits = selectedCountry.dialCode === '+1' ? 10 : 7;
    if (digits.length < minDigits) {
      setError('Please enter a valid phone number.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('send-phone-verification', {
        body: { phone: `${selectedCountry.dialCode}${digits}` },
      });

      if (fnError || !data?.success) {
        throw new Error(data?.error || 'Failed to send verification code');
      }

      setMaskedPhone(data.phone_masked || `***${digits.slice(-4)}`);
      setStep('code');
      setCode('');

      setCooldown(60);
      const interval = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to send SMS code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (codeToVerify: string) => {
    if (codeToVerify.length !== 4) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-phone', {
        body: { code: codeToVerify },
      });

      if (fnError || !data?.success) {
        const msg = data?.error || 'Verification failed';
        if (data?.attemptsRemaining !== undefined) {
          setError(`${msg}. ${data.attemptsRemaining} attempts remaining.`);
        } else {
          setError(msg);
        }
        setCode('');
        return;
      }

      onVerified(data.phone);
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {step === 'phone' ? (
        <>
          <div className="text-center mb-4">
            <div className="text-3xl mb-2">📱</div>
            <h3 className="text-lg font-semibold text-gray-900">Verify Phone Number</h3>
            <p className="text-sm text-gray-500 mt-1">
              We'll send a verification code via SMS
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <div className="flex gap-2">
              <CountryCodePicker
                selectedCountry={selectedCountry}
                onSelect={(c) => { setSelectedCountry(c); setPhone(''); }}
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneForInput(e.target.value, selectedCountry.dialCode, phone))}
                placeholder={selectedCountry.dialCode === '+1' ? '(555) 123-4567' : 'phone number'}
                maxLength={selectedCountry.dialCode === '+1' ? 14 : 15}
                className="input text-center text-lg flex-1"
                autoFocus
              />
            </div>
          </div>

          {error && <div className="alert-error text-sm">{error}</div>}

          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 btn-secondary py-2">
              Cancel
            </button>
            <button
              onClick={handleSendCode}
              disabled={loading || extractDigits(phone, selectedCountry.dialCode).length < (selectedCountry.dialCode === '+1' ? 10 : 7)}
              className="flex-1 btn-primary py-2"
            >
              {loading ? 'Sending...' : 'Send Code'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="text-center mb-4">
            <div className="text-3xl mb-2">🔢</div>
            <h3 className="text-lg font-semibold text-gray-900">Enter Verification Code</h3>
            <p className="text-sm text-gray-500 mt-1">
              Code sent to {maskedPhone}
            </p>
          </div>

          <div>
            <input
              ref={codeInputRef}
              type="text"
              value={code}
              onChange={(e) => {
                const upper = e.target.value.toUpperCase().slice(0, 4);
                setCode(upper);
                if (upper.length === 4) {
                  handleVerifyCode(upper);
                }
              }}
              maxLength={4}
              placeholder="----"
              className="input text-center text-2xl font-bold tracking-widest py-3"
              autoComplete="one-time-code"
            />
          </div>

          {error && <div className="alert-error text-sm">{error}</div>}

          {loading && (
            <div className="flex justify-center">
              <span className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            </div>
          )}

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleSendCode}
              disabled={cooldown > 0 || loading}
              className="text-sm text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
            </button>
            <button
              onClick={() => { setStep('phone'); setCode(''); setError(null); }}
              className="text-sm text-gray-500 hover:underline"
            >
              Change phone number
            </button>
          </div>
        </>
      )}
    </div>
  );
};
