import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router-dom';

/**
 * Global route-transition indicator. Route chunks resolve inside the router
 * (route.lazy), so useNavigation() reports 'loading' for exactly the window in
 * which the previous page is still on screen — the window that used to look
 * like a dead first click. The 150ms delay keeps cached-chunk navigations
 * (near-instant) from flashing the bar.
 */
export function NavigationProgress() {
  const navigation = useNavigation();
  const loading = navigation.state !== 'idle';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!loading) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 150);
    return () => window.clearTimeout(timer);
  }, [loading]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-primary/15"
      role="progressbar"
      aria-label="Loading page"
    >
      <div className="h-full w-1/3 rounded-full bg-primary animate-nav-progress motion-reduce:animate-none" />
    </div>
  );
}
