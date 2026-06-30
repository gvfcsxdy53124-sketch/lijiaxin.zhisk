import type {ReactNode} from 'react';
import {BrowserRouter} from 'react-router-dom';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({children}: AppProvidersProps) {
  return <BrowserRouter basename={import.meta.env.BASE_URL}>{children}</BrowserRouter>;
}
