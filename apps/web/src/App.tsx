import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { Layout } from './components/Layout.js';
import { RequireOrganisation } from './components/RequireOrganisation.js';
import { RequireManager, RequireSession } from './components/RequireSession.js';
import { AcceptInvitation } from './pages/AcceptInvitation.js';
import { AccountPage } from './pages/AccountPage.js';
import { ForgotPassword } from './pages/ForgotPassword.js';
import { Home } from './pages/Home.js';
import { InspectionsPage } from './pages/InspectionsPage.js';
import { MyReservesPage } from './pages/MyReservesPage.js';
import { ReservePage } from './pages/ReservePage.js';
import { ReservesPage } from './pages/ReservesPage.js';
import { ResetPassword } from './pages/ResetPassword.js';
import { SignIn } from './pages/SignIn.js';
import { SignUp } from './pages/SignUp.js';
import { SitePage } from './pages/SitePage.js';
import { SitesPage } from './pages/SitesPage.js';
import { TourProvider } from './tours/TourProvider.js';
import { Loading } from './components/Loading.js';

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
const VerifyDocumentPage = lazy(() =>
  import('./pages/VerifyDocumentPage.js').then((module) => ({
    default: module.VerifyDocumentPage,
  })),
);
const InterventionPage = lazy(() =>
  import('./pages/InterventionPage.js').then((module) => ({ default: module.InterventionPage })),
);

// Console de l’équipe Obsio : chargée seulement à l’ouverture de /console.
const consolePages = {
  layout: lazy(() =>
    import('./console/ConsoleLayout.js').then((module) => ({ default: module.ConsoleLayout })),
  ),
  clients: lazy(() =>
    import('./console/ClientsPage.js').then((module) => ({ default: module.ClientsPage })),
  ),
  watch: lazy(() =>
    import('./console/WatchPage.js').then((module) => ({ default: module.WatchPage })),
  ),
  client: lazy(() =>
    import('./console/ClientPage.js').then((module) => ({ default: module.ClientPage })),
  ),
  usage: lazy(() =>
    import('./console/UsagePage.js').then((module) => ({ default: module.UsagePage })),
  ),
  audit: lazy(() =>
    import('./console/AuditPage.js').then((module) => ({ default: module.AuditPage })),
  ),
};

const lazyPage = (page: ReactNode) => (
  <Suspense fallback={<Loading shape="bar" />}>{page}</Suspense>
);

const session = (page: ReactNode) => (
  <RequireSession>
    <RequireOrganisation>{page}</RequireOrganisation>
  </RequireSession>
);

/** Pages réservées aux admins et aux responsables. */
const managers = (page: ReactNode) => session(<RequireManager>{page}</RequireManager>);

const router = createBrowserRouter([
  {
    // Tutoriels interactifs, sur toutes les pages (voir src/tours).
    element: (
      <TourProvider>
        <Outlet />
      </TourProvider>
    ),
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: managers(<SitesPage />) },
          { path: '/sites/:siteId', element: managers(<SitePage />) },
          { path: '/sites/:siteId/reserves', element: managers(<ReservesPage />) },
          { path: '/reserves/:reserveId', element: session(<ReservePage />) },
          { path: '/mes-reserves', element: session(<MyReservesPage />) },
          { path: '/verifications', element: managers(<InspectionsPage />) },
          // Ancienne rubrique : les électriciens externes sont dans Organisation.
          { path: '/intervenants', element: <Navigate to="/organisation" replace /> },
          { path: '/organisation', element: managers(<Home />) },
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
          { path: '/imports/:importId', element: managers(lazyPage(<ImportPage />)) },
          { path: '/batiments/:buildingId/3d', element: managers(lazyPage(<BuildingPage3D />)) },
        ],
      },
      { path: '/intervention/:token', element: lazyPage(<InterventionPage />) },
      // Page publique : vérification d'un dossier de preuves reçu (QR code du PDF).
      { path: '/verifier', element: lazyPage(<VerifyDocumentPage />) },
      {
        path: '/console',
        element: lazyPage(<consolePages.layout />),
        children: [
          { index: true, element: lazyPage(<consolePages.clients />) },
          { path: 'clients/:clientId', element: lazyPage(<consolePages.client />) },
          { path: 'a-surveiller', element: lazyPage(<consolePages.watch />) },
          { path: 'usage', element: lazyPage(<consolePages.usage />) },
          { path: 'journal', element: lazyPage(<consolePages.audit />) },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
