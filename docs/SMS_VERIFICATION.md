# SMS Verification — Web Dashboard

Documentation for the SMS phone verification feature in the Kizu web dashboard. Users can verify a phone number in Account Settings and choose to receive login codes via SMS.

---

## Overview

Phone verification allows users to:
1. Add and verify a phone number from Account Settings
2. Choose between **Email** or **SMS** for login code delivery
3. Log in and see a contextual message based on how their code was delivered

The server decides the delivery channel — the web app simply reads `delivery_channel` from the response.

---

## Components

### `PhoneVerificationFlow.tsx` (new)

**Location:** `src/components/PhoneVerificationFlow.tsx`

Self-contained two-step verification flow:

1. **Phone input step** — User enters a 10-digit US phone number, formatted as `(555) 123-4567`
2. **Code entry step** — User enters the 4-character code received via SMS, auto-submits on 4th character

Props:

| Prop | Type | Description |
|------|------|-------------|
| `onVerified` | `(phone: string) => void` | Called with E.164 phone on success |
| `onCancel` | `() => void` | Called when user cancels |
| `initialPhone` | `string?` | Pre-fill phone input |

Features:
- 60-second cooldown between resend requests
- Attempt tracking with remaining count shown on error
- Auto-focus on code input after sending
- Uses `supabase.functions.invoke()` to call edge functions

---

### `AccountPage.tsx` (modified)

**Location:** `src/components/AccountPage.tsx`

New **Phone Verification** section between Subscription and Actions:

| State | UI |
|-------|-----|
| No phone | "Add Phone Number" button that opens `PhoneVerificationFlow` |
| Phone verified | Green checkmark with masked phone, Email/SMS toggle for login code delivery |
| Verifying | Inline `PhoneVerificationFlow` component |

The Email/SMS toggle calls `PUT /profiles-api` with `{ preferred_verification_method: 'email' | 'sms' }`.

---

### `Login.tsx` (modified)

**Location:** `src/components/Login.tsx`

- New `deliveryChannel` state tracks whether the code was sent via `'email'` or `'sms'`
- Code-sent message updates:
  - SMS: "Enter the 4-digit code sent to your phone via SMS"
  - Email: "Enter the 4-digit code sent to {email}" (unchanged)
- State resets on form reset

---

### `AuthContext.tsx` (modified)

**Location:** `src/context/AuthContext.tsx`

- `signInWithCode()` now returns `deliveryChannel` from the edge function response
- Type updated: `Promise<{ error: any; code?: string; deliveryChannel?: string }>`

---

## API Calls

All calls go through Supabase edge functions:

| Action | Function | Method | Body |
|--------|----------|--------|------|
| Send phone code | `send-phone-verification` | POST | `{ phone: "5551234567" }` |
| Verify phone code | `verify-phone` | POST | `{ code: "ABCD" }` |
| Get profile (phone info) | `profiles-api` | GET | — |
| Update delivery preference | `profiles-api` | PUT | `{ preferred_verification_method: "sms" }` |
| Login (sends code) | `send-verification-code` | POST | `{ email, type: "4-digit" }` |

The `send-verification-code` response now includes `delivery_channel: "email" | "sms"`.

---

## Edge Function Details

See `Kizu-Mobile/docs/SMS_VERIFICATION.md` for full backend documentation including:
- Database schema changes
- SMS provider configuration (Twilio)
- Security features (rate limiting, attempt limits, fallback)
- Shared utilities (`smsClient.ts`, `phoneUtils.ts`)
- Cost projections and provider swap plan
