import {execFileSync} from 'node:child_process';
const project='charly-brown',token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
const argument=process.argv.find(a=>a.startsWith('--end='));
const end=argument?new Date(argument.slice(6)):new Date(),start=new Date(end.getTime()-7*86400000);
if(!Number.isFinite(end.getTime()))throw Error('invalid end date');
async function metric(type,groupFields){
  const params=new URLSearchParams({filter:`metric.type="run.googleapis.com/${type}" AND resource.type="cloud_run_revision"`,'interval.startTime':start.toISOString(),'interval.endTime':end.toISOString(),'aggregation.alignmentPeriod':'604800s','aggregation.perSeriesAligner':'ALIGN_SUM','aggregation.crossSeriesReducer':'REDUCE_SUM',pageSize:'1000'});
  for(const field of groupFields)params.append('aggregation.groupByFields',field);
  const result=[];let pageToken;
  do{if(pageToken)params.set('pageToken',pageToken);const response=await fetch(`https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${params}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const data=await response.json();if(!response.ok)throw Error('Monitoring failed '+response.status);result.push(...data.timeSeries||[]);pageToken=data.nextPageToken;}while(pageToken);
  return result.map(series=>({service:series.resource.labels.service_name,labels:series.metric.labels,total:(series.points||[]).reduce((sum,p)=>sum+Number(p.value.doubleValue??p.value.int64Value??0),0)}));
}
const [billable,requests]=await Promise.all([metric('container/billable_instance_time',['resource.labels.service_name']),metric('request_count',['resource.labels.service_name','metric.labels.response_code_class'])]);
console.log(JSON.stringify({project,start:start.toISOString(),end:end.toISOString(),billableInstanceSeconds:billable,requests,note:'Tiempo facturable y solicitudes por servicio. No es uso exacto de CPU ni importe de factura. Comparar volumen y tipo de trabajo antes de atribuir ahorro; revisar Sally por facturación por instancia.'},null,2));
