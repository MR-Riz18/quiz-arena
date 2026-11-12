import api from './axios.js';

const unwrap = (res) => res.data.data;
const params = (o) => ({ params: Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null)) });

export const adminApi = {
  // ---- Dashboard ----
  async stats() {
    return unwrap(await api.get('/admin/stats'));
  },

  // ---- Users ----
  async users({ search = '', page = 1, limit = 20 } = {}) {
    return unwrap(await api.get('/admin/users', params({ search, page, limit })));
  },
  async updateUser(id, patch) {
    const data = unwrap(await api.patch(`/admin/users/${id}`, patch));
    return data.user;
  },

  // ---- Matches ----
  async matches({ status = '', mode = '', page = 1, limit = 20 } = {}) {
    return unwrap(await api.get('/admin/matches', params({ status, mode, page, limit })));
  },

  // ---- Audit log ----
  async auditLogs({ action = '', page = 1, limit = 20 } = {}) {
    return unwrap(await api.get('/admin/audit-logs', params({ action, page, limit })));
  },

  // ---- Questions ----
  async questions({ category = '', difficulty = '', search = '', active = '', page = 1, limit = 20 } = {}) {
    return unwrap(await api.get('/admin/questions', params({ category, difficulty, search, active, page, limit })));
  },
  async createQuestion(payload) {
    const data = unwrap(await api.post('/admin/questions', payload));
    return data.question;
  },
  async updateQuestion(id, payload) {
    const data = unwrap(await api.put(`/admin/questions/${id}`, payload));
    return data.question;
  },
  async deleteQuestion(id) {
    await api.delete(`/admin/questions/${id}`);
  },

  // ---- Categories ----
  async createCategory(payload) {
    const data = unwrap(await api.post('/admin/categories', payload));
    return data.category;
  },
  async updateCategory(id, payload) {
    const data = unwrap(await api.put(`/admin/categories/${id}`, payload));
    return data.category;
  },
  async deleteCategory(id) {
    await api.delete(`/admin/categories/${id}`);
  },

  // ---- Config ----
  async getConfig() {
    const data = unwrap(await api.get('/admin/config'));
    return data.config;
  },
  async updateConfig(patch) {
    const data = unwrap(await api.patch('/admin/config', patch));
    return data.updated;
  },
};
