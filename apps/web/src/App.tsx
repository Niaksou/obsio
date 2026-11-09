import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout.js';
import { RequireOrganisation } from './components/RequireOrganisation.js';
import { RequireSession } from './components/RequireSession.js';
import { AcceptInvitation } from './pages/AcceptInvitation.js';
import { AccountPage } from './pages/AccountPage.js';
import { ContractorsPage } from './pages/ContractorsPage.js';
import { ForgotPassword } from './pages/ForgotPassword.js';
import { Home } from './pages/Home.js';
import { InspectionsPage } from './pages/InspectionsPage.js';
import { ReservePage } from './pages/ReservePage.js';
import { ReservesPage } from './pages/ReservesPage.js';
import { ResetPassword } from './pages/ResetPassword.js';
import { SignIn } from './pages/SignIn.js';
import { SignUp } from './pages/SignUp.js';
import { SitePage } from './pages/SitePage.js';
import { SitesPage } from './pages/SitesPage.js';

// Konva et pdf.js ne sont chargés qu'à l'ouverture d'un étage.
const FloorPage = lazy(() =>
  import('./pages/FloorPage.js').then((module) => ({ default: module.FloorPage })),
);

// three.js n'est chargé qu'à l'ouverture de la vue 3D.
const BuildingPage3D = lazy(() =>
  import('./pages/BuildingPage3D.js').then((module) => ({ default: module.BuildingPage3D })),
);

const ImportPage = lazy(() =>
  import('./pages/ImportPage.js').then((module) => ({ default: module.ImportPage })),
);

// La vue de l'intervenant est un point d'entrée à part (téléphone, sans compte).
const InterventionPage = lazy(() =>
  import('./pages/InterventionPage.js').then((module) => ({ default: module.InterventionPage })),
);

const lazyPage = (page: ReactNode) => (
  <Suspense fallback={<p className="loading page-message">Chargement…</p>}>{page}</Suspense>
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
      { path: '/sites/:siteId/reserves', element: session(<ReservesPage />) },
      { path: '/reserves/:reserveId', element: session(<ReservePage />) },
      { path: '/verifications', element: session(<InspectionsPage />) },
      { path: '/intervenants', element: session(<ContractorsPage />) },
      { path: '/organisation', element: session(<Home />) },
      // Sans organisation active : chacun gère son compte, même s'il n'est membre de rien.
      {
        path: '/compte',
        element: (
          <RequireSession>
            <AccountPage />
          </RequireSession>
        ),
      },
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
        element: session(lazyPage(<FloorPage />)),
      },
      { path: '/imports/:importId', element: session(lazyPage(<ImportPage />)) },
      { path: '/batiments/:buildingId/3d', element: session(lazyPage(<BuildingPage3D />)) },
    ],
  },
  { path: '/intervention/:token', element: lazyPage(<InterventionPage />) },
]);

export function App() {
  return <RouterProvider router={router} />;
}
