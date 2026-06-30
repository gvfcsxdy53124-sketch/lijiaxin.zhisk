import {Navigate, useLocation, type RouteObject} from 'react-router-dom';
import type {ReactNode} from 'react';
import {AppShell} from '@/app/AppShell';
import {isAuthenticated} from '@/features/auth/authStorage';
import {LoginPage} from '@/features/auth/pages/LoginPage';
import LegacyConsolePage from '@/features/legacy/pages/LegacyConsolePage';

function RequireAuth({children}: {children: ReactNode}) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{from: location}} />;
  }

  return children;
}

const protectedLegacyPage = (
  <RequireAuth>
    <LegacyConsolePage />
  </RequireAuth>
);

export const appRoutes: RouteObject[] = [
  {path: '/login', element: <LoginPage />},
  {
    path: '/',
    element: <AppShell />,
    children: [
      {index: true, element: <Navigate to="/knowledge" replace />},
      {path: 'knowledge', element: protectedLegacyPage},
      {path: 'skills', element: <Navigate to="/skills/templates" replace />},
      {path: 'skills/templates', element: protectedLegacyPage},
      {path: 'skills/config', element: <Navigate to="/skills/templates" replace />},
      {path: 'skills/executions', element: protectedLegacyPage},
      {path: 'skills/evaluation', element: <Navigate to="/skills/templates" replace />},
      {path: 'permissions', element: protectedLegacyPage},
    ],
  },
  {path: '*', element: <Navigate to="/knowledge" replace />},
];
