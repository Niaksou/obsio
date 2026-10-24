import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout.js';
import { RequireOrganisation } from './components/RequireOrganisation.js';
import { RequireSession } from './components/RequireSession.js';
import { AcceptInvitation } from './pages/AcceptInvitation.js';
import { ForgotPassword } from './pages/ForgotPassword.js';
import { Home } from './pages/Home.js';
import { ResetPassword } from './pages/ResetPassword.js';
import { SignIn } from './pages/SignIn.js';
import { SignUp } from './pages/SignUp.js';
import { SitePage } from './pages/SitePage.js';
import { SitesPage } from './pages/SitesPage.js';

// Konva et pdf.js ne sont chargés qu'à l'ouverture d'un étage.
const FloorPage = lazy(() =>
  import('./pages/FloorPage.js').then((module) => ({ default: module.FloorPage })),
);

const session = (page: ReactNode) => (
  <RequireSession>
    <RequireOrganisation>{page}</RequireOrganisation>
  </RequireSession>
);

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: session(<SitesPage />) },
      { path: '/sites/:siteId', element: session(<SitePage />) },
      { path: '/organisation', element: session(<Home />) },
      { path: '/connexion', element: <SignIn /> },
      { path: '/inscription', element: <SignUp /> },
      { path: '/mot-de-passe-oublie', element: <ForgotPassword /> },
      { path: '/reinitialiser-mot-de-passe', element: <ResetPassword /> },
      { path: '/invitations/:id', element: <AcceptInvitation /> },
    ],
  },
  {
    // Le plan occupe toute la fenêtre, sous l'en-tête.
    element: <Layout fullBleed />,
    children: [
      {
        path: '/etages/:floorId',
        element: session(
          <Suspense fallback={<p className="loading page-message">Chargement…</p>}>
            <FloorPage />
          </Suspense>,
        ),
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
