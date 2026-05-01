import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { clearOnboardingIntent, readOnboardingIntent } from './lib/onboardingIntent';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import ClubDirectoryPage from './pages/ClubDirectoryPage';
import CreateTeamPage from './pages/CreateTeamPage';
import JoinTeamPage from './pages/JoinTeamPage';
import { ContactPage, PrivacyPolicyPage, TermsPage } from './pages/LegalPages';
import OnboardingPage from './pages/OnboardingPage';
import TeamChooserPage from './pages/TeamChooserPage';
import TeamDirectoryPage from './pages/TeamDirectoryPage';
import {
  AvailabilityPage,
  ChallengesPage,
  ClubAffiliationAdminPage,
  ClubCentralPage,
  ClubEventsStandalonePage,
  ClubTeamsPage,
  GameRostersPage,
  HelpFeedbackPage,
  NewsPage,
  NewsroomPage,
  ProfilePage,
  RosterMgmtPage,
  RosterPage,
  SchedulePage,
  ScheduleScoresPage,
  SettingsPage,
  StandingsPage,
  TeamMembersPage,
} from './pages/TeamPages';

function PendingOnboardingIntentRedirect() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !isAuthenticated) {
      return;
    }

    const intent = readOnboardingIntent();
    const hasCreateIntent = intent?.mode === 'create' && Boolean(intent.teamName?.trim());
    const hasJoinIntent = intent?.mode === 'join' && (intent.joinCode ?? '').trim().length === 7;
    const targetPath = hasCreateIntent ? '/create' : hasJoinIntent ? '/join' : '';

    if (intent?.mode && !targetPath) {
      clearOnboardingIntent();
      return;
    }

    if (targetPath && location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [isAuthenticated, loading, location.pathname, navigate]);

  return null;
}

export default function App() {
  return (
    <>
      <PendingOnboardingIntentRedirect />
      <Routes>
        <Route element={<LandingPage />} path="/" />
        <Route element={<AuthPage />} path="/auth" />
        <Route element={<CreateTeamPage />} path="/create" />
        <Route element={<JoinTeamPage />} path="/join" />
        <Route element={<OnboardingPage />} path="/onboarding" />
        <Route element={<ContactPage />} path="/contact" />
        <Route element={<PrivacyPolicyPage />} path="/privacy" />
        <Route element={<TermsPage />} path="/terms" />
        <Route
          element={
            <ProtectedRoute>
              <TeamChooserPage />
            </ProtectedRoute>
          }
          path="/teams"
        />
        <Route
          element={
            <ProtectedRoute>
              <TeamDirectoryPage />
            </ProtectedRoute>
          }
          path="/team-directory"
        />
        <Route
          element={
            <ProtectedRoute>
              <ClubDirectoryPage />
            </ProtectedRoute>
          }
          path="/club-directory"
        />
        <Route
          element={<ClubAffiliationAdminPage />}
          path="/admin"
        />
        <Route
          element={<ClubAffiliationAdminPage />}
          path="/club-admin"
        />
        <Route
          element={
            <ProtectedRoute>
              <ClubEventsStandalonePage />
            </ProtectedRoute>
          }
          path="/clubs/:clubSlug/events"
        />

        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
          path="/c/:clubSlug/t/:teamSlug"
        >
          <Route element={<Navigate replace to="news" />} index />
          <Route element={<TeamMembersPage />} path="team" />
          <Route element={<ClubTeamsPage />} path="club-teams" />
          <Route element={<ClubCentralPage />} path="club-central" />
          <Route element={<ProfilePage />} path="profile" />
          <Route element={<RosterPage />} path="roster" />
          <Route element={<RosterPage />} path="player-mgmt" />
          <Route element={<SchedulePage />} path="schedule" />
          <Route element={<ChallengesPage />} path="challenges" />
          <Route element={<ScheduleScoresPage />} path="schedule-scores" />
          <Route element={<StandingsPage />} path="standings" />
          <Route element={<StandingsPage />} path="team-standing" />
          <Route element={<GameRostersPage />} path="pairings" />
          <Route element={<GameRostersPage />} path="game-rosters" />
          <Route element={<RosterMgmtPage />} path="roster-mgmt" />
          <Route element={<AvailabilityPage />} path="availability" />
          <Route element={<HelpFeedbackPage />} path="help" />
          <Route element={<NewsPage />} path="news" />
          <Route element={<NewsroomPage />} path="newsroom" />
          <Route element={<SettingsPage />} path="settings" />
        </Route>

        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </>
  );
}
