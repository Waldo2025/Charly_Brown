const crypto = require("node:crypto");
const { CloudTasksClient } = require("@google-cloud/tasks");
const { PROJECT_ID, REGION } = require("./common.js");

const QUEUES = Object.freeze({
  montage: "podcaster-montage",
  veo: "podcaster-veo"
});

function deterministicTaskId(kind, jobId) {
  const cleanKind = String(kind || "job").toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 24) || "job";
  const digest = crypto.createHash("sha256").update(String(jobId || "")).digest("hex").slice(0, 32);
  if (!String(jobId || "").trim()) throw new Error("cloud_task_job_id_required");
  return `${cleanKind}-${digest}`;
}

function buildHttpTaskRequest({
  projectId = PROJECT_ID,
  location = REGION,
  queue,
  kind,
  jobId,
  targetUrl,
  serviceAccountEmail,
  payload = {},
  scheduleDelaySeconds = 0,
  dispatchDeadlineSeconds = 60
} = {}) {
  if (!queue || !Object.values(QUEUES).includes(queue)) throw new Error("cloud_task_queue_invalid");
  if (!/^https:\/\//i.test(String(targetUrl || ""))) throw new Error("cloud_task_target_url_invalid");
  if (!String(serviceAccountEmail || "").includes("@")) throw new Error("cloud_task_service_account_invalid");
  const client = new CloudTasksClient();
  const parent = client.queuePath(projectId, location, queue);
  const name = client.taskPath(projectId, location, queue, deterministicTaskId(kind, jobId));
  const body = Buffer.from(JSON.stringify({ jobId: String(jobId).trim(), ...payload }));
  const request = {
    parent,
    task: {
      name,
      httpRequest: {
        httpMethod: "POST",
        url: String(targetUrl),
        headers: { "Content-Type": "application/json" },
        body,
        oidcToken: {
          serviceAccountEmail: String(serviceAccountEmail),
          audience: String(targetUrl)
        }
      }
    }
  };
  const delay = Math.max(0, Math.min(3600, Number(scheduleDelaySeconds) || 0));
  if (delay > 0) {
    request.task.scheduleTime = { seconds: Math.floor(Date.now() / 1000) + Math.ceil(delay) };
  }
  request.task.dispatchDeadline = { seconds: Math.max(15, Math.min(1800, Math.round(Number(dispatchDeadlineSeconds) || 60))) };
  return request;
}

async function enqueueHttpTask(options = {}, { client = new CloudTasksClient() } = {}) {
  const request = buildHttpTaskRequest(options);
  try {
    const [task] = await client.createTask(request);
    return { created: true, name: String(task?.name || request.task.name) };
  } catch (error) {
    if (Number(error?.code) === 6 || String(error?.code || "") === "ALREADY_EXISTS") {
      return { created: false, duplicate: true, name: request.task.name };
    }
    throw error;
  }
}

module.exports = {
  QUEUES,
  deterministicTaskId,
  buildHttpTaskRequest,
  enqueueHttpTask
};
