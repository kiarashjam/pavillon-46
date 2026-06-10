/** Production build sets VITE_API_BASE_URL; local dev leaves it empty and uses the Vite /api proxy. */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
