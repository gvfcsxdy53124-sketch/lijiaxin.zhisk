import {useRoutes} from 'react-router-dom';
import {appRoutes} from './index';

export function AppRouter() {
  return useRoutes(appRoutes);
}
