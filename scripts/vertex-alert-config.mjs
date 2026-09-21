export const vertexMetric = {
  name: 'vertex_quota_errors',
  description: 'Vertex resource exhaustion: terminal structured failures and explicit Vertex legacy errors, excluding unrelated HTTP 429s.',
  filter: 'resource.type="cloud_run_revision" AND (jsonPayload.event="vertex_resource_exhausted" OR ((textPayload:"Vertex" OR jsonPayload.message:"Vertex") AND (textPayload:"RESOURCE_EXHAUSTED" OR jsonPayload.message:"RESOURCE_EXHAUSTED")))'
};

export const vertexPolicy = {
  displayName: 'Google Cloud - fallos reiterados de Vertex',
  severity: 'WARNING',
  documentation: {
    content: 'Al menos 3 solicitudes fallidas por agotamiento de recursos de Vertex en 5 minutos por servicio. Puede ser cuota o capacidad temporal; revisar providerMessage y quotaViolations en los registros vertex_resource_exhausted. Un fallo aislado no activa esta alerta.',
    mimeType: 'text/markdown'
  },
  conditions: [{
    displayName: 'Vertex: 3 fallos en 5 minutos',
    conditionThreshold: {
      filter: 'metric.type="logging.googleapis.com/user/vertex_quota_errors" AND resource.type="cloud_run_revision"',
      comparison: 'COMPARISON_GT', thresholdValue: 2, duration: '0s',
      aggregations: [{ alignmentPeriod: '300s', perSeriesAligner: 'ALIGN_SUM',
        crossSeriesReducer: 'REDUCE_SUM', groupByFields: ['resource.label.project_id', 'resource.label.service_name', 'resource.label.location'] }],
      trigger: { count: 1 }
    }
  }]
};
