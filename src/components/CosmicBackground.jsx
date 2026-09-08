import { useEffect } from 'react';

export default function CosmicBackground() {
  useEffect(() => {
    let cancelled = false;
    let cleanup;
    const moduleUrl = '/cosmic-scene.js';
    import(/* @vite-ignore */ moduleUrl).then(({ mountCosmicScene }) => {
      if (!cancelled) cleanup = mountCosmicScene();
    }).catch(() => {
      // The existing dark surfaces remain a readable fallback if this optional layer fails.
    });
    return () => { cancelled = true; cleanup?.(); };
  }, []);
  return null;
}
