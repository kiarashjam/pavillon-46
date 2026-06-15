import { Route, Routes } from 'react-router-dom'
import { LanguageProvider } from './contexts/LanguageContext'
import { AuthProvider } from './contexts/AuthContext'
import ActivityTracker from './components/ActivityTracker'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './components/dashboard/DashboardLayout'
import Home from './pages/Home'
import Waitlist from './pages/Waitlist'
import ThankYou from './pages/ThankYou'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import LegalOrPrivacy from './pages/LegalOrPrivacy'
import AdminActivity from './pages/AdminActivity'
import AdminMembers from './pages/AdminMembers'
import Overview from './pages/dashboard/Overview'
import Referral from './pages/dashboard/Referral'
import MyReferrals from './pages/dashboard/MyReferrals'
import Profile from './pages/dashboard/Profile'

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ActivityTracker />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/waitlist" element={<Waitlist />} />
          <Route path="/thank-you" element={<ThankYou />} />
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/legal" element={<LegalOrPrivacy section="legal" />} />
          <Route path="/privacy" element={<LegalOrPrivacy section="privacy" />} />
          <Route path="/admin/activity" element={<AdminActivity />} />
          <Route path="/admin/members" element={<AdminMembers />} />

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
      </AuthProvider>
    </LanguageProvider>
  )
}
