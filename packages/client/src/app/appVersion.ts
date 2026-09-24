export const INSTALLED_APP_QUERY = '(display-mode: standalone), (display-mode: fullscreen)';

// Une page d'erreur ne cite aucun bundle: seul l'index d'une autre version réclame un rechargement.
export function isOutdated(runningScript: string, servedIndex: string): boolean {
  return (
    servedIndex.includes('<script type="module"') && !servedIndex.includes(`src="${runningScript}"`)
  );
}
