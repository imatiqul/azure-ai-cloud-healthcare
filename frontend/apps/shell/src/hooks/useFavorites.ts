/**
 * useFavorites — persistent favourite pages stored in localStorage.
 *
 * Storage key : 'hq:favorites'
 * Shape        : string[]  (array of href strings, e.g. '/triage')
 */

const STORAGE_KEY = 'hq:favorites';

export function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveFavorites(hrefs: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hrefs));
}

export function isFavorite(href: string): boolean {
  return loadFavorites().includes(href);
}

export function toggleFavorite(href: string): boolean {
  const current = loadFavorites();
  const exists  = current.includes(href);
  if (exists) {
    saveFavorites(current.filter(h => h !== href));
    return false; // removed
  } else {
    saveFavorites([...current, href]);
    return true;  // added
  }
}
