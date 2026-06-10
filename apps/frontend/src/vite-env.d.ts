/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the backend API. Empty in development (Vite proxy handles
   * /api and /socket.io); set to the backend origin in production (Vercel)
   * so the WebSocket can connect directly.
   */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
