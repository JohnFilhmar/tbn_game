const KEY = 'tbn.session';

/** The token of this page, for a browser that keeps no session storage. */
let inMemory: string | null = null;

/** The session token kept for this tab, or null. A reload keeps it; closing the tab ends it. */
export function loadToken(): string | null {
  try {
    return window.sessionStorage.getItem(KEY) ?? inMemory;
  } catch {
    return inMemory;
  }
}

/** Keeps the token for this tab. Where storage is off, it lasts until the page reloads. */
export function saveToken(token: string): void {
  inMemory = token;
  try {
    window.sessionStorage.setItem(KEY, token);
  } catch {
    // The copy in memory serves this page.
  }
}

/** Forgets the token. */
export function clearToken(): void {
  inMemory = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing kept, nothing to forget.
  }
}
