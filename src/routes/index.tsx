import {Navigate, type RouteObject} from 'react-router-dom';
import {AppShell} from '@/app/AppShell';
import LegacyConsolePage from '@/features/legacy/pages/LegacyConsolePage';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      {index: true, element: <Navigate to="/knowledge" replace />},
      {path: 'knowledge', element: <LegacyConsolePage />},
      {path: 'skills', element: <LegacyConsolePage />},
      {path: 'permissions', element: <LegacyConsolePage />},
    ],
  },
  {path: '*', element: <Navigate to="/knowledge" replace />},
];
