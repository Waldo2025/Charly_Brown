const BASE = '/api/science-activities/production';
export const ACTIVE_PRODUCTION_STATUSES = new Set(['planning', 'running', 'queued', 'validating']);
export function createScienceProductionClient(request) {
  const call = async (path = '', body) => {
    const response = await request(`${BASE}${path}`, body === undefined ? {} : { method: 'POST', body });
    return response;
  };
  const path = (id) => `/${encodeURIComponent(id)}`;
  return {
    list: () => call(),
    get: (id) => call(path(id)),
    plan: (config, activity) => call('/plan', { config, activity }),
    revise: (id, revision, changes) => call(`${path(id)}/revise`, { revision, changes }),
    approve: (id, revision) => call(`${path(id)}/approve`, { revision }),
    start: (id, revision) => call(`${path(id)}/start`, { revision }),
    regenerate: (id, request) => call(`${path(id)}/regenerate_asset`, request),
    cancel: (id) => call(`${path(id)}/cancel`, {}),
    retry: (id, taskId) => call(`${path(id)}/retry`, { taskId })
  };
}
