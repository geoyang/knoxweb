import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AlbumViewer, AlbumDetailView } from './components/AlbumViewer';
import { ViewCircle } from './components/ViewCircle';
import { AdminDashboard } from './components/AdminDashboard';
import { Login } from './components/Login';
import { Signup } from './components/Signup';
import { SignupSuccess } from './components/SignupSuccess';
import { AuthCallback } from './components/AuthCallback';
import { VerifyRegistration } from './components/VerifyRegistration';
import { Dashboard } from './components/Dashboard';
import { FrameSetup } from './components/FrameSetup';
import { FrameMode } from './components/FrameMode';
import { ShareRequest } from './components/ShareRequest';
import { SubscriptionPage } from './components/SubscriptionPage';
import { AccountPage } from './components/AccountPage';

function App() {
  return (
    <div className="App">
      <Routes>
        {/* Public route for album viewing without authentication */}
        <Route path="/album/:inviteId" element={<AlbumViewer />} />
        <Route path="/album/:inviteId/:albumId" element={<AlbumDetailView />} />

        {/* Circle invitation acceptance route */}
        <Route path="/view-circle/:inviteId" element={<ViewCircle />} />

        {/* Picture Frame Setup route */}
        <Route path="/frame-setup/:token" element={<FrameSetup />} />

        {/* Picture Frame Display Mode */}
        <Route path="/frame" element={<FrameMode />} />

        {/* Share request route */}
        <Route path="/share" element={<ShareRequest />} />

        {/* Subscription management route */}
        <Route path="/subscription" element={<SubscriptionPage />} />

        {/* Account settings and deletion route */}
        <Route path="/account" element={<AccountPage />} />

        {/* Registration verification route */}
        <Route path="/verify" element={<VerifyRegistration />} />

        {/* User dashboard (for circle members) */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Authentication routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/signup-success" element={<SignupSuccess />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Admin routes (require authentication) */}
        <Route path="/admin/*" element={<AdminDashboard />} />

        {/* Default route */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  );
}

export default App;
