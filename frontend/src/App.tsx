import { Route, Routes } from 'react-router-dom'
import { LanguageProvider } from './contexts/LanguageContext'
import ActivityTracker from './components/ActivityTracker'
import Home from './pages/Home'
import Waitlist from './pages/Waitlist'
import ThankYou from './pages/ThankYou'
import Login from './pages/Login'
import LegalOrPrivacy from './pages/LegalOrPrivacy'
import AdminActivity from './pages/AdminActivity'

export default function App() {
  return (
    <LanguageProvider>
      <ActivityTracker />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/waitlist" element={<Waitlist />} />
        <Route path="/thank-you" element={<ThankYou />} />
        <Route path="/login" element={<Login />} />
        <Route path="/legal" element={<LegalOrPrivacy section="legal" />} />
        <Route path="/privacy" element={<LegalOrPrivacy section="privacy" />} />
        <Route path="/admin/activity" element={<AdminActivity />} />
      </Routes>
    </LanguageProvider>
  )
}
