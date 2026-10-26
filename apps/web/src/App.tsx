import { Suspense } from 'react';
import { Link, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { FullPageSpinner, RequireAuth } from './components/RequireAuth';
import { ServerWakeBanner } from './components/ServerWakeBanner';
import { lazyPage } from './lib/lazyPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';

// Páginas da app carregadas à parte: quem só vê a página de entrada ou o login descarrega menos.
const AccountPage = lazyPage(() => import('./pages/AccountPage'), 'AccountPage');
const CalendarPage = lazyPage(() => import('./pages/CalendarPage'), 'CalendarPage');
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'), 'DashboardPage');
const DisciplineDetailPage = lazyPage(() => import('./pages/DisciplineDetailPage'), 'DisciplineDetailPage');
const AssistantPage = lazyPage(() => import('./pages/AssistantPage'), 'AssistantPage');
const DisciplinesPage = lazyPage(() => import('./pages/DisciplinesPage'), 'DisciplinesPage');
const DocumentDetailPage = lazyPage(() => import('./pages/DocumentDetailPage'), 'DocumentDetailPage');
const DocumentsPage = lazyPage(() => import('./pages/DocumentsPage'), 'DocumentsPage');
const ImportPage = lazyPage(() => import('./pages/ImportPage'), 'ImportPage');
const IntegrationsPage = lazyPage(() => import('./pages/IntegrationsPage'), 'IntegrationsPage');
const OnboardingPage = lazyPage(() => import('./pages/OnboardingPage'), 'OnboardingPage');
const PlanPage = lazyPage(() => import('./pages/PlanPage'), 'PlanPage');
const PreferencesPage = lazyPage(() => import('./pages/PreferencesPage'), 'PreferencesPage');
const StudySessionsPage = lazyPage(() => import('./pages/StudySessionsPage'), 'StudySessionsPage');
const TasksPage = lazyPage(() => import('./pages/TasksPage'), 'TasksPage');

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
    <>
      <ServerWakeBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registo" element={<RegisterPage />} />
        <Route path="/privacidade" element={<PrivacyPage />} />
        <Route path="/termos" element={<TermsPage />} />
        <Route element={<RequireAuth />}>
          <Route
            path="boas-vindas"
            element={
              <Suspense fallback={<FullPageSpinner />}>
                <OnboardingPage />
              </Suspense>
            }
          />
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="calendario" element={<CalendarPage />} />
            <Route path="importar" element={<ImportPage />} />
            <Route path="plano" element={<PlanPage />} />
            <Route path="preferencias" element={<PreferencesPage />} />
            <Route path="integracoes" element={<IntegrationsPage />} />
            <Route path="tarefas" element={<TasksPage />} />
            <Route path="disciplinas" element={<DisciplinesPage />} />
            <Route path="disciplinas/:id" element={<DisciplineDetailPage />} />
            <Route path="sessoes" element={<StudySessionsPage />} />
            <Route path="documentos" element={<DocumentsPage />} />
            <Route path="documentos/:id" element={<DocumentDetailPage />} />
            <Route path="assistente" element={<AssistantPage />} />
            <Route path="conta" element={<AccountPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
