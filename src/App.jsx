import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import ClubDirectoryPage from './pages/ClubDirectoryPage';
import CreateTeamPage from './pages/CreateTeamPage';
import JoinTeamPage from './pages/JoinTeamPage';
import OnboardingPage from './pages/OnboardingPage';
import TeamChooserPage from './pages/TeamChooserPage';
import TeamDirectoryPage from './pages/TeamDirectoryPage';
import {
  AvailabilityPage,
  ChallengesPage,
  ClubAffiliationAdminPage,
  GameRostersPage,
  NewsPage,
  NewsroomPage,
  RosterMgmtPage,
  RosterPage,
  SchedulePage,
  ScheduleScoresPage,
  SettingsPage,
  StandingsPage,
  TeamMembersPage,
} from './pages/TeamPages';

export default function App() {
  return (
    <Routes>
      <Route element={<LandingPage />} path="/" />
      <Route element={<AuthPage />} path="/auth" />
      <Route element={<CreateTeamPage />} path="/create" />
      <Route element={<JoinTeamPage />} path="/join" />
      <Route element={<OnboardingPage />} path="/onboarding" />
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
            <AppShell />
          </ProtectedRoute>
        }
        path="/c/:clubSlug/t/:teamSlug"
      >
        <Route element={<Navigate replace to="news" />} index />
        <Route element={<TeamMembersPage />} path="team" />
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
        <Route element={<NewsPage />} path="news" />
        <Route element={<NewsroomPage />} path="newsroom" />
        <Route element={<SettingsPage />} path="settings" />
      </Route>

      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
