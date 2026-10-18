const API = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '')

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const detail = data?.error || data?.detail || data?.url?.[0] || data?.name?.[0] || data?.non_field_errors?.[0]
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${response.status})`)
  }
  return data
}

export const api = {
  health: () => request('/health/'),
  scrape: (payload) => request('/scrape/', { method: 'POST', body: JSON.stringify(payload) }),
  jobs: () => request('/jobs/'),
  createJob: (payload) => request('/jobs/', { method: 'POST', body: JSON.stringify(payload) }),
  deleteJob: (id) => request(`/jobs/${id}/`, { method: 'DELETE' }),
  runJob: (id) => request(`/jobs/${id}/run/`, { method: 'POST', body: '{}' }),
  runs: () => request('/runs/'),
  exportUrl: (id, format) => `${API}/runs/${id}/export/?format=${format}`,
}
