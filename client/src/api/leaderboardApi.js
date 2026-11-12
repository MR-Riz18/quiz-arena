import api from './axios.js';

export const leaderboardApi = {
  async byRating({ page = 1, limit = 20, search = '' } = {}) {
    const data = (
      await api.get('/leaderboards/rating', { params: { page, limit, search } })
    ).data.data;
    return data; // { rows, me, page, limit, total, totalPages }
  },
  async byWins({ page = 1, limit = 20, search = '' } = {}) {
    const data = (
      await api.get('/leaderboards/wins', { params: { page, limit, search } })
    ).data.data;
    return data;
  },
  async byAccuracy({ page = 1, limit = 20, search = '' } = {}) {
    const data = (
      await api.get('/leaderboards/accuracy', { params: { page, limit, search } })
    ).data.data;
    return data;
  },
};
