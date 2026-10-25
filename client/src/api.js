const API = import.meta.env.VITE_API_URL || '/api/v1';
async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'Something went wrong. Please try again.');
  return data;
}
export const createMystery = (body) => request('/mysteries', { method: 'POST', body: JSON.stringify(body) });
export const getMystery = (id) => request(`/mysteries/${id}`);
export const saveNotes = (id, notes) => request(`/sessions/${id}/notes`, { method: 'PUT', body: JSON.stringify({ notes }) });
export const accuse = (id, suspectId) => request(`/sessions/${id}/accusation`, { method: 'POST', body: JSON.stringify({ suspectId }) });
