import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

if (!process.argv.includes("--execute")) {
  console.error("Use --execute para crear las métricas y políticas de alerta en charly-brown.");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromFunctions = createRequire(path.join(root, "functions/package.json"));
const { GoogleAuth } = requireFromFunctions("google-auth-library");
const projectId = "charly-brown";
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const client = await auth.getClient();

const logMetrics = [
  {
    name: "podcaster_heartbeat_expired",
    description: "Podcaster jobs whose Firestore heartbeat or update timestamp expired.",
    filter: 'resource.type="cloud_run_revision" AND (jsonPayload.event="podcaster_job_heartbeat_expired" OR textPayload:"podcaster_job_heartbeat_expired")'
  },
  {
    name: "vertex_quota_errors",
    description: "Vertex AI quota failures observed by Google Cloud runtimes.",
    filter: 'resource.type="cloud_run_revision" AND (textPayload:"RESOURCE_EXHAUSTED" OR jsonPayload.message:"RESOURCE_EXHAUSTED" OR httpRequest.status=429)'
  }
];

for (const metric of logMetrics) {
  try {
    await client.request({
      url: `https://logging.googleapis.com/v2/projects/${projectId}/metrics`,
      method: "POST",
      data: {
        ...metric,
        metricDescriptor: { metricKind: "DELTA", valueType: "INT64", unit: "1" }
      }
    });
    console.log(`[alerts] métrica creada: ${metric.name}`);
  } catch (error) {
    if (Number(error?.response?.status) !== 409) throw error;
    await client.request({
      url: `https://logging.googleapis.com/v2/projects/${projectId}/metrics/${metric.name}`,
      method: "PUT",
      data: {
        ...metric,
        metricDescriptor: { metricKind: "DELTA", valueType: "INT64", unit: "1" }
      }
    });
    console.log(`[alerts] métrica actualizada: ${metric.name}`);
  }
}

const condition = ({ displayName, filter, thresholdValue, alignmentPeriod = "300s", duration = "0s" }) => ({
  displayName,
  conditionThreshold: {
    filter,
    comparison: "COMPARISON_GT",
    thresholdValue,
    duration,
    aggregations: [{ alignmentPeriod, perSeriesAligner: "ALIGN_SUM" }],
    trigger: { count: 1 }
  }
});

const policies = [
  {
    displayName: "Podcaster Google Cloud - HTTP 5xx",
    documentation: { content: "Cinco o más respuestas 5xx en una ventana de cinco minutos.", mimeType: "text/markdown" },
    conditions: [condition({ displayName: "Cloud Run 5xx", filter: 'metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision" AND metric.label."response_code_class"="5xx"', thresholdValue: 4 })]
  },
  {
    displayName: "Podcaster Google Cloud - cola acumulada",
    documentation: { content: "Una cola de Cloud Tasks conserva más de 20 tareas durante diez minutos.", mimeType: "text/markdown" },
    conditions: [condition({ displayName: "Cloud Tasks depth", filter: 'metric.type="cloudtasks.googleapis.com/queue/depth" AND resource.type="cloud_tasks_queue"', thresholdValue: 20, duration: "600s" })]
  },
  {
    displayName: "Podcaster Google Cloud - montaje fallido",
    documentation: { content: "Al menos una ejecución de Cloud Run Job terminó con error.", mimeType: "text/markdown" },
    conditions: [condition({ displayName: "Cloud Run Job failed", filter: 'metric.type="run.googleapis.com/job/completed_execution_count" AND resource.type="cloud_run_job" AND metric.label.result="failed"', thresholdValue: 0 })]
  },
  {
    displayName: "Podcaster Google Cloud - heartbeat vencido",
    documentation: { content: "El monitor programado detectó un trabajo running sin heartbeat vigente.", mimeType: "text/markdown" },
    conditions: [condition({ displayName: "Stale Firestore job", filter: 'metric.type="logging.googleapis.com/user/podcaster_heartbeat_expired" AND resource.type="cloud_run_revision"', thresholdValue: 0 })]
  },
  {
    displayName: "Podcaster Google Cloud - cuota Vertex",
    documentation: { content: "Un runtime registró RESOURCE_EXHAUSTED o HTTP 429 al usar Vertex AI.", mimeType: "text/markdown" },
    conditions: [condition({ displayName: "Vertex quota error", filter: 'metric.type="logging.googleapis.com/user/vertex_quota_errors" AND resource.type="cloud_run_revision"', thresholdValue: 0 })]
  }
];

const list = await client.request({ url: `https://monitoring.googleapis.com/v3/projects/${projectId}/alertPolicies`, params: { pageSize: 1000 } });
const existing = new Set((list.data.alertPolicies || []).map((item) => item.displayName));
for (const policy of policies) {
  if (existing.has(policy.displayName)) {
    console.log(`[alerts] política existente: ${policy.displayName}`);
    continue;
  }
  await client.request({
    url: `https://monitoring.googleapis.com/v3/projects/${projectId}/alertPolicies`,
    method: "POST",
    data: { ...policy, combiner: "OR", enabled: true, alertStrategy: { autoClose: "1800s" } }
  });
  console.log(`[alerts] política creada: ${policy.displayName}`);
}
