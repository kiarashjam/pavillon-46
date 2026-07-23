import { Route, Routes } from 'react-router-dom'
import { LanguageProvider } from './contexts/LanguageContext'
import { AuthProvider } from './contexts/AuthContext'
import { AdminAuthProvider } from './contexts/AdminAuthContext'
import ActivityTracker from './components/ActivityTracker'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './components/dashboard/DashboardLayout'
import Home from './pages/Home'
import Waitlist from './pages/Waitlist'
import ThankYou from './pages/ThankYou'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import LegalOrPrivacy from './pages/LegalOrPrivacy'
import AdminLayout from './components/admin/AdminLayout'
import AdminLogin from './pages/admin/AdminLogin'
import AdminSetPassword from './pages/admin/AdminSetPassword'
import AdminOverview from './pages/admin/AdminOverview'
import AdminMembersSection from './pages/admin/AdminMembersSection'
import AdminReferralsSection from './pages/admin/AdminReferralsSection'
import AdminActivitySection from './pages/admin/AdminActivitySection'
import Overview from './pages/dashboard/Overview'
import Referral from './pages/dashboard/Referral'
import MyReferrals from './pages/dashboard/MyReferrals'
import Profile from './pages/dashboard/Profile'

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AdminAuthProvider>
          <ActivityTracker />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/waitlist" element={<Waitlist />} />
            <Route path="/thank-you" element={<ThankYou />} />
            <Route path="/login" element={<Login />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/legal" element={<LegalOrPrivacy section="legal" />} />
            <Route path="/privacy" element={<LegalOrPrivacy section="privacy" />} />

            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/set-password" element={<AdminSetPassword />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminOverview />} />
              <Route path="members" element={<AdminMembersSection />} />
              <Route path="referrals" element={<AdminReferralsSection />} />
              <Route path="activity" element={<AdminActivitySection />} />
            </Route>

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="referral" element={<Referral />} />
              <Route path="referrals" element={<MyReferrals />} />
              <Route path="profile" element={<Profile />} />
            </Route>
          </Routes>
        </AdminAuthProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}
