import { ReactNode, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getBackPath } from '../utils/backNavigation';

type BackRouteHandlerProps = {
  children: (onBack: () => void) => ReactNode;
};
export function BackRouteHandler({ children }: BackRouteHandlerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useCallback(() => {
    const path = getBackPath(location.pathname);
    if (path) navigate(path);
  }, [navigate, location.pathname]);
  return children(goBack);
}
