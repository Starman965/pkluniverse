import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import {
  AdminPage,
  AvailabilityPage,
  NewsPage,
  PairingsPage,
  RosterPage,
  SchedulePage,
  SettingsPage,
  StandingsPage,
  TeamDashboardPage,
} from './pages/TeamPages';

export default function App() {
  return (
    <Routes>
      <Route element={<LandingPage />} path="/" />
      <Route element={<AuthPage />} path="/auth" />
      <Route element={<OnboardingPage />} path="/onboarding" />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
        path="/c/:clubSlug/t/:teamSlug"
      >
        <Route element={<TeamDashboardPage />} index />
        <Route element={<RosterPage />} path="roster" />
        <Route element={<SchedulePage />} path="schedule" />
        <Route element={<StandingsPage />} path="standings" />
        <Route element={<PairingsPage />} path="pairings" />
        <Route element={<AvailabilityPage />} path="availability" />
        <Route element={<NewsPage />} path="news" />
        <Route element={<SettingsPage />} path="settings" />
        <Route element={<AdminPage />} path="admin" />
      </Route>

      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
