# Knox Web - Passwordless Authentication Setup

Knox Web now uses **passwordless authentication** with magic links instead of passwords.

## How It Works

1. **Enter your email** on the login page
2. **Receive a magic link** in your email
3. **Click the link** to sign in automatically
4. **Redirected to admin dashboard**

## Setting Up Your First Admin User

### Option 1: Use Any Valid Email (Recommended)

1. Go to your Knox web app at `http://localhost:3000/login`
2. Enter any valid email address you have access to
3. Click "Send Magic Link"
4. Check your email and click the magic link
5. You'll be automatically signed in and redirected to the admin dashboard

### Option 2: Create User via Supabase Dashboard (Alternative)

1. Go to your Supabase project dashboard
2. Navigate to **Authentication > Users**
3. Click **"Invite a user"**
4. Enter your email address
5. They will receive an invite link which works the same as a magic link

### Option 3: Enable Sign-ups (If needed)

If magic links aren't working, check your Supabase settings:

1. Go to **Authentication > Settings**
2. Ensure **"Enable email confirmations"** = `true`
3. Ensure **"Allow new users to sign up"** = `true`
4. Make sure you have email templates configured

## Email Configuration

Make sure your Supabase project has email sending configured:

1. **Authentication > Settings > SMTP Settings**
2. Configure your email provider (or use Supabase's built-in email)
3. Test that emails are being delivered

## Redirect URLs

The app is configured to redirect magic links to:
- Development: `http://localhost:3000/auth/callback`
- Production: `https://your-domain.com/auth/callback`

Make sure this URL is added to your Supabase **Authentication > URL Configuration**.

## Troubleshooting

If you still get 400 errors:

1. Check the browser console for detailed error messages
2. Verify the debug component shows "✅ Supabase connection working"
3. Make sure email confirmations are disabled or the user is confirmed
4. Check that the Supabase project allows email/password authentication