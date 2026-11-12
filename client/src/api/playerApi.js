import api from './axios.js';

export const playerApi = {
  // My completed match history: ?mode=&result=&page=&limit=
  async myMatches({ mode = '', result = '', page = 1, limit = 10 } = {}) {
    const data = (
      await api.get('/players/me/matches', { params: { mode, result, page, limit } })
    ).data.data;
    return data; // { matches, page, limit, total, totalPages }
  },
  // Public profile (no email): rating, tier, record, favorites, recent.
  async profile(username) {
    const data = (await api.get(`/players/${encodeURIComponent(username)}`)).data.data;
    return data.profile;
  },
  // Update my username / avatar. Returns the updated user.
  async updateMe({ username, avatar }) {
    const data = (await api.patch('/players/me', { username, avatar })).data.data;
    return data.user;
  },
  // Username prefix search (max 10, no emails).
  async search(q) {
    const data = (await api.get('/players/search', { params: { q } })).data.data;
    return data.players;
  },
};
