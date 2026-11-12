import api from './axios.js';

export const matchApi = {
  // Participants only; answers revealed only when the match is completed.
  async get(matchId) {
    const data = (await api.get(`/matches/${matchId}`)).data.data;
    return data.match;
  },
  // Phase 2: any participant of a COMPLETED match can open a rematch room.
  // Returns { room, code }; other participants get a match:rematch-offered event.
  async rematch(matchId) {
    const data = (await api.post(`/matches/${matchId}/rematch`)).data.data;
    return data;
  },
};
