import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout.js';
import { RequireSession } from './components/RequireSession.js';
import { AcceptInvitation } from './pages/AcceptInvitation.js';
import { ForgotPassword } from './pages/ForgotPassword.js';
import { Home } from './pages/Home.js';
import { ResetPassword } from './pages/ResetPassword.js';
import { SignIn } from './pages/SignIn.js';
import { SignUp } from './pages/SignUp.js';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        path: '/',
        element: (
          <RequireSession>
            <Home />
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
]);

export function App() {
  return <RouterProvider router={router} />;
}
