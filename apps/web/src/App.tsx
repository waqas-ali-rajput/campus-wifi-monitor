import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireRole } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { LoginPage } from './features/auth/LoginPage';
import { SpeedTestPage } from './features/speedtest/SpeedTestPage';
import { CampusWifiTestPage } from './features/speedtest/CampusWifiTestPage';
import { CampusStatusPage } from './features/status/CampusStatusPage';
import { TestHistoryPage } from './features/history/TestHistoryPage';
import { NewComplaintPage } from './features/complaints/NewComplaintPage';
import { ComplaintListPage } from './features/complaints/ComplaintListPage';
import { ComplaintDetailPage } from './features/complaints/ComplaintDetailPage';
import { OutagesPage } from './features/outages/OutagesPage';
import { ItDashboardPage } from './features/dashboard/ItDashboardPage';
import { LocationDetailPage } from './features/locations/LocationDetailPage';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';
import { ReportsPage } from './features/analytics/ReportsPage';
import { LocationsAdminPage } from './features/admin/LocationsAdminPage';
import { UsersPage } from './features/admin/UsersPage';
import { ThresholdsPage } from './features/admin/ThresholdsPage';
import { ActivityLogPage } from './features/admin/ActivityLogPage';
import { ServerInfoPage } from './features/admin/ServerInfoPage';
import { NotificationsPage } from './features/notifications/NotificationsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<SpeedTestPage />} />
        <Route path="campus-test" element={<CampusWifiTestPage />} />
        <Route path="status" element={<CampusStatusPage />} />
        <Route path="history" element={<TestHistoryPage />} />
        <Route path="complaints" element={<ComplaintListPage mode="mine" />} />
        <Route path="complaints/new" element={<NewComplaintPage />} />
        <Route path="complaints/:id" element={<ComplaintDetailPage />} />
        <Route path="outages" element={<OutagesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="it" element={<RequireRole perm="dashboard.view"><ItDashboardPage /></RequireRole>} />
        <Route path="it/complaints" element={<RequireRole perm="complaints.viewAll"><ComplaintListPage mode="queue" /></RequireRole>} />
        <Route path="it/locations/:id" element={<RequireRole perm="dashboard.view"><LocationDetailPage /></RequireRole>} />
        <Route path="analytics" element={<RequireRole perm="analytics.view"><AnalyticsPage /></RequireRole>} />
        <Route path="reports" element={<RequireRole perm="analytics.compare"><ReportsPage /></RequireRole>} />
        <Route path="manage/locations" element={<RequireRole perm="locations.manage"><LocationsAdminPage /></RequireRole>} />
        <Route path="admin/users" element={<RequireRole perm="users.manage"><UsersPage /></RequireRole>} />
        <Route path="admin/thresholds" element={<RequireRole perm="settings.read"><ThresholdsPage /></RequireRole>} />
        <Route path="admin/activity" element={<RequireRole perm="activity.view"><ActivityLogPage /></RequireRole>} />
        <Route path="admin/server" element={<RequireRole perm="server.info"><ServerInfoPage /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
