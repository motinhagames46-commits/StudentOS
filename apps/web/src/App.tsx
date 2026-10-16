import { Link, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { AccountPage } from './pages/AccountPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { DisciplineDetailPage } from './pages/DisciplineDetailPage';
import { DisciplinesPage } from './pages/DisciplinesPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { StudySessionsPage } from './pages/StudySessionsPage';
import { TasksPage } from './pages/TasksPage';

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold text-stone-900">Página não encontrada</h1>
      <Link to="/" className="mt-4 inline-block text-sm text-accent hover:underline">
        Voltar ao painel
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registo" element={<RegisterPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tarefas" element={<TasksPage />} />
          <Route path="disciplinas" element={<DisciplinesPage />} />
          <Route path="disciplinas/:id" element={<DisciplineDetailPage />} />
          <Route path="sessoes" element={<StudySessionsPage />} />
          <Route path="conta" element={<AccountPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
