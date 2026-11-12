import api from './axios.js';

const unwrap = (res) => res.data.data;

export const friendApi = {
  // Send a friend request by exact username.
  async request(username) {
    const data = unwrap(await api.post('/friends/request', { username }));
    return data.request; // { id, status }
  },
  // Incoming pending requests.
  async requests() {
    const data = unwrap(await api.get('/friends/requests'));
    return data.requests;
  },
  async accept(requestId) {
    const data = unwrap(await api.post(`/friends/requests/${requestId}/accept`));
    return data.friend;
  },
  async decline(requestId) {
    await api.post(`/friends/requests/${requestId}/decline`);
  },
  // Remove an accepted friend.
  async remove(friendId) {
    await api.delete(`/friends/${friendId}`);
  },
  // Accepted friends with online status.
  async list() {
    const data = unwrap(await api.get('/friends'));
    return data.friends;
  },
};
