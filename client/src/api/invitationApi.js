import api from './axios.js';

const unwrap = (res) => res.data.data;

export const invitationApi = {
  // Invite any player to one of my waiting rooms.
  async send(recipientUsername, roomCode) {
    const data = unwrap(await api.post('/invitations', { recipientUsername, roomCode }));
    return data.invitation;
  },
  // My pending incoming invitations.
  async list() {
    const data = unwrap(await api.get('/invitations'));
    return data.invitations;
  },
  // Accept -> joins the room, returns { code }.
  async accept(invitationId) {
    const data = unwrap(await api.post(`/invitations/${invitationId}/accept`));
    return data; // { code }
  },
  async decline(invitationId) {
    await api.post(`/invitations/${invitationId}/decline`);
  },
};
