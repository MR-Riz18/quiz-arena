import api from './axios.js';

export const matchmakingApi = {
  // REST mirrors of the socket matchmaking events (socket is the primary
  // transport in the UI; these exist for fallback and tests).
  async join(mode = 'competitive', category = 'mixed') {
    const data = (await api.post('/matchmaking/join', { mode, category })).data.data;
    return data; // { matched, position }
  },
  async cancel() {
    const data = (await api.post('/matchmaking/cancel')).data.data;
    return data; // { removed }
  },
  async status() {
    const data = (await api.get('/matchmaking/status')).data.data;
    return data; // { inQueue, position, ... }
  },
};
