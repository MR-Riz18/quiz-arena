import axios from 'axios';

// All auth is via the httpOnly `token` cookie, so every request carries credentials.
// In production the backend lives on its own host (Render); VITE_API_URL
// points the built frontend at it. Unset in dev — Vite proxies /api.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  withCredentials: true,
  timeout: 15000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    const data = err.response?.data;
    const message = data?.message || err.message || 'Something went wrong';

    // Session expired / not logged in: bounce to login, except for the auth
    // endpoints themselves (login page + boot check handle those).
    const isAuthCall =
      url.includes('/auth/me') || url.includes('/auth/login') || url.includes('/auth/register');
    if (status === 401 && !isAuthCall) {
      const path = window.location.pathname;
      if (!path.startsWith('/login') && !path.startsWith('/register')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject({ message, status, data });
  }
);

export default api;
