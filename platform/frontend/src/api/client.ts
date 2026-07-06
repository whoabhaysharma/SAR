const BASE = '/api'

function token() {
  return localStorage.getItem('token')
}

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = token()
  if (t) headers['Authorization'] = `Bearer ${t}`

  const res = await fetch(BASE + path, { ...options, headers })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export const api = {
  setup: (body: { email: string; password: string; name: string }) =>
    request('/setup', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  me: () => request('/auth/me'),

  orgs: {
    list: () => request('/orgs'),
    create: (body: { name: string; slug: string }) =>
      request('/orgs', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, any>) =>
      request(`/orgs/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/orgs/${id}`, { method: 'DELETE' }),
  },

  users: {
    byOrg: (orgId: string) => request(`/users/org/${orgId}`),
    create: (orgId: string, body: { email: string; password: string; name: string; role: string }) =>
      request(`/users/org/${orgId}`, { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, any>) =>
      request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
  },

  campaigns: {
    list: () => request('/campaigns'),
    create: (body: { name: string; vastTagUrl: string; org?: string }) =>
      request('/campaigns', { method: 'POST', body: JSON.stringify(body) }),
    get: (id: string) => request(`/campaigns/${id}`),
    update: (id: string, body: Record<string, any>) =>
      request(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/campaigns/${id}`, { method: 'DELETE' }),
  },

  analytics: {
    campaign: (tag: string) => request(`/analytics/campaign/${tag}`),
    summary: () => request('/analytics/summary'),
    recent: (limit = 100) => request(`/analytics/recent?limit=${limit}`),
  },
}
