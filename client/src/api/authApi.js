import api from './axios.js';

const unwrap = (res) => res.data.data;

export const authApi = {
  async register(username, email, password) {
    const data = unwrap(await api.post('/auth/register', { username, email, password }));
    return data.user;
  },
  async login(email, password) {
    const data = unwrap(await api.post('/auth/login', { email, password }));
    return data.user;
  },
  async logout() {
    await api.post('/auth/logout');
  },
  async me() {
    const data = unwrap(await api.get('/auth/me'));
    return data.user;
  },
  async changePassword(currentPassword, newPassword) {
    unwrap(await api.patch('/auth/password', { currentPassword, newPassword }));
  },
};
