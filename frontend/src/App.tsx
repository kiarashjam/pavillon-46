import { lazy, Suspense } from 'react'
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
import AdminForgotPassword from './pages/admin/AdminForgotPassword'
import AdminResetPassword from './pages/admin/AdminResetPassword'
import AdminOverview from './pages/admin/AdminOverview'
import AdminPeople from './pages/admin/AdminPeople'
import AdminActivitySection from './pages/admin/AdminActivitySection'
import AdminNewslettersSection from './pages/admin/AdminNewslettersSection'
import AdminNewsletterEditor from './pages/admin/AdminNewsletterEditor'
import Overview from './pages/dashboard/Overview'
import Referral from './pages/dashboard/Referral'
import MyReferrals from './pages/dashboard/MyReferrals'
import Profile from './pages/dashboard/Profile'
import Newsletters from './pages/dashboard/Newsletters'

// Loaded on demand: most visitors never open the booking page or the admin
// Meetings section, so their code stays out of the main bundle.
const Booking = lazy(() => import('./pages/Booking'))
const AdminMeetingsSection = lazy(() => import('./pages/admin/AdminMeetingsSection'))

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
            <Route path="/rendez-vous" element={<Suspense fallback={null}><Booking lang="fr" /></Suspense>} />
            <Route path="/en/meeting" element={<Suspense fallback={null}><Booking lang="en" /></Suspense>} />

            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/set-password" element={<AdminSetPassword />} />
            <Route path="/admin/forgot-password" element={<AdminForgotPassword />} />
            <Route path="/admin/reset-password" element={<AdminResetPassword />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminOverview />} />
              <Route path="people" element={<AdminPeople />} />
              <Route path="members" element={<AdminPeople initialTab="members" />} />
              <Route path="referrals" element={<AdminPeople initialTab="submitters" />} />
              <Route path="activity" element={<AdminActivitySection />} />
              <Route path="newsletters" element={<AdminNewslettersSection />} />
              <Route path="newsletters/:id" element={<AdminNewsletterEditor />} />
              <Route path="meetings" element={<Suspense fallback={null}><AdminMeetingsSection /></Suspense>} />
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
              <Route path="newsletters" element={<Newsletters />} />
              <Route path="profile" element={<Profile />} />
            </Route>
          </Routes>
        </AdminAuthProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}
