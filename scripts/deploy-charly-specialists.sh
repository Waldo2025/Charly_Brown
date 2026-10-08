#!/usr/bin/env bash
set -euo pipefail
# Run from the repository root. This only deploys the four specialists and queue;
# the public gateway/worker flag is enabled separately after integration checks.
project="${CHARLY_PROJECT_ID:-charly-brown}"
region="${CHARLY_REGION:-us-central1}"
image="$region-docker.pkg.dev/$project/charly-specialists/runtime:$(git rev-parse --short HEAD)"
gateway="charly-functions-ai@$project.iam.gserviceaccount.com"
bucket="${CHARLY_RESOURCE_BUCKET:-$project-mcp-resources}"
if ! gcloud artifacts repositories describe charly-specialists --project="$project" --location="$region" >/dev/null 2>&1; then
  gcloud artifacts repositories create charly-specialists --project="$project" --location="$region" --repository-format=docker
fi
if [[ "${CHARLY_SKIP_BUILD:-false}" != "true" ]]; then
  gcloud builds submit . --project="$project" --ignore-file=cloud-run/charly-specialist/.gcloudignore --config=cloud-run/charly-specialist/cloudbuild.yaml --substitutions="_IMAGE=$image"
fi
for specialist in ${CHARLY_SPECIALISTS:-annex cutout worksheet video-script}; do
  service="charly-mcp-$specialist"
  account="$service@$project.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$account" --project="$project" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$service" --project="$project"
  fi
  gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:$account" --role=roles/aiplatform.user --condition=None >/dev/null
  gcloud storage buckets add-iam-policy-binding "gs://$bucket" --member="serviceAccount:$account" --role=roles/storage.objectUser --condition="expression=resource.name.startsWith('projects/_/buckets/$bucket/objects/charly-resources/'),title=charly-resource-assets" >/dev/null
  gcloud run deploy "$service" --project="$project" --region="$region" --image="$image" --service-account="$account" --no-allow-unauthenticated --min=0 --min-instances=0 --cpu-throttling --memory=1Gi --cpu=1 --concurrency=2 --max-instances=4 --timeout=300 --set-env-vars="CHARLY_SPECIALIST=$specialist,FIREBASE_STORAGE_BUCKET=$bucket"
  gcloud run services add-iam-policy-binding "$service" --project="$project" --region="$region" --member="serviceAccount:$gateway" --role=roles/run.invoker >/dev/null
  gcloud run services describe "$service" --project="$project" --region="$region" --format='value(status.url)'
done
if ! gcloud tasks queues describe charly-production --project="$project" --location="$region" >/dev/null 2>&1; then
  gcloud tasks queues create charly-production --project="$project" --location="$region" --max-concurrent-dispatches=8 --max-dispatches-per-second=4 --max-attempts=10
fi
