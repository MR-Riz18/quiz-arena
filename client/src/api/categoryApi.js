import api from './axios.js';

export const categoryApi = {
  async list() {
    const data = (await api.get('/categories')).data.data;
    return data.categories || [];
  },
};
