import api from './axios.js';

const unwrap = (res) => res.data.data;

export const roomApi = {
  // body: { name, visibility?, config? }
  async create(payload) {
    const data = unwrap(await api.post('/rooms', payload));
    return data; // { room, code }
  },
  async list(page = 1, limit = 12) {
    return unwrap(await api.get('/rooms', { params: { page, limit } }));
  },
  async get(code) {
    const data = unwrap(await api.get(`/rooms/${code}`));
    return data.room;
  },
  async join(code) {
    const data = unwrap(await api.post(`/rooms/${code}/join`));
    return data.room;
  },
  async leave(code) {
    const data = unwrap(await api.post(`/rooms/${code}/leave`));
    return data.room;
  },
};
