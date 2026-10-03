/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The server's address for builds that do not run on the server's own origin. */
  readonly VITE_API_URL?: string;
}
