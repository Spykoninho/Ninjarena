// Un doigt pour seul pointeur, sans survol: un téléphone ou une tablette, jamais un ordinateur.
export const TOUCH_MEDIA_QUERY = '(hover: none) and (pointer: coarse)';

export function usesTouchControls(
  forced: boolean | null,
  matches: (query: string) => boolean,
): boolean {
  return forced ?? matches(TOUCH_MEDIA_QUERY);
}
