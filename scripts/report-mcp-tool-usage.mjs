import { spawnSync } from 'node:child_process';
const days = Number(process.argv[2] || 7);
if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('days must be between 1 and 30');
const result = spawnSync('gcloud', ['logging', 'read',
  'resource.type="cloud_run_revision" AND jsonPayload.event="mcp_tool_execution"',
  '--project=charly-brown', `--freshness=${days}d`, '--limit=10000',
  '--format=json(resource.labels.service_name,jsonPayload.server,jsonPayload.tool,jsonPayload.durationMs,jsonPayload.success,jsonPayload.processRssBytes)'],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if (result.status !== 0) throw new Error('Cloud Logging query failed; inspect gcloud authentication and permissions.');
const rows = JSON.parse(result.stdout), groups = new Map();
for (const row of rows) {
  const payload = row.jsonPayload || {}, service = row.resource?.labels?.service_name || 'unknown';
  const key = JSON.stringify([service, payload.server, payload.tool]);
  const group = groups.get(key) || { service, server: payload.server, tool: payload.tool, durations: [], errors: 0, maxProcessRssBytes: 0 };
  if (Number.isFinite(payload.durationMs)) group.durations.push(payload.durationMs);
  if (payload.success === false) group.errors++;
  group.maxProcessRssBytes = Math.max(group.maxProcessRssBytes, Number(payload.processRssBytes) || 0);
  groups.set(key, group);
}
const report = [...groups.values()].map(({durations, ...group}) => {
  durations.sort((a,b) => a-b);
  return {...group, executions: durations.length,
    totalElapsedSeconds: durations.reduce((sum,v)=>sum+v,0)/1000,
    meanMs: durations.length ? Math.round(durations.reduce((sum,v)=>sum+v,0)/durations.length) : 0,
    p95Ms: durations[Math.max(0, Math.ceil(durations.length*.95)-1)] || 0};
}).sort((a,b)=>b.totalElapsedSeconds-a.totalElapsedSeconds);
console.log(JSON.stringify({ days, returnedLogs: rows.length, possiblyTruncated: rows.length === 10000,
  note: 'Elapsed tool durations overlap under concurrency; they are not billable CPU seconds. RSS is process-wide. Only executions after instrumentation deployment are included.', tools: report }, null, 2));
