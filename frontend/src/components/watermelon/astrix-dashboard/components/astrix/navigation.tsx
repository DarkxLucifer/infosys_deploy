import {
  createContext,
  useContext,
  useMemo,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Bridges the dashboard's internal navigation to react-router so the
 * sidebar, topbar and inline links work with the real app routes.
 */
type DashboardNavigation = {
  pathname: string;
  navigate: (pathname: string) => void;
};

const DashboardNavigationContext = createContext<DashboardNavigation | null>(
  null,
);

export function DashboardNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const location = useLocation();
  const routerNavigate = useNavigate();

  const value = useMemo(
    () => ({
      pathname: location.pathname,
      navigate: routerNavigate,
    }),
    [location.pathname, routerNavigate],
  );

  return (
    <DashboardNavigationContext.Provider value={value}>
      {children}
    </DashboardNavigationContext.Provider>
  );
}

export function useDashboardNavigation() {
  const context = useContext(DashboardNavigationContext);

  if (!context) {
    throw new Error(
      "useDashboardNavigation must be used within DashboardNavigationProvider",
    );
  }

  return context;
}

export function DashboardLink({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { navigate } = useDashboardNavigation();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigate(href);
  }

  return <a href={href} onClick={handleClick} {...props} />;
}
