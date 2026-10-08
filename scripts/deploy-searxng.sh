#!/usr/bin/env bash
set -euo pipefail
project=charly-brown
region=us-central1
: "${SEARXNG_BASE_IMAGE:?Provide an official image pinned with @sha256: digest}"
[[ "$SEARXNG_BASE_IMAGE" =~ ^(docker.io/searxng/searxng|ghcr.io/searxng/searxng)@sha256:[a-f0-9]{64}$ ]] || exit 2
account="charly-research-search@$project.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$account" --project="$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create charly-research-search --project="$project"
fi
if ! gcloud secrets describe charly-searxng-secret --project="$project" >/dev/null 2>&1; then
  python3 -c 'import secrets; print(secrets.token_urlsafe(48))' | gcloud secrets create charly-searxng-secret --project="$project" --replication-policy=automatic --data-file=-
fi
gcloud secrets add-iam-policy-binding charly-searxng-secret --project="$project" --member="serviceAccount:$account" --role=roles/secretmanager.secretAccessor >/dev/null
image="us-central1-docker.pkg.dev/$project/charly-specialists/searxng:cost-reduction"
gcloud builds submit cloud-run/searxng --project="$project" --config=cloud-run/searxng/cloudbuild.yaml --substitutions="_BASE_IMAGE=$SEARXNG_BASE_IMAGE,_IMAGE=$image"
# IAM is the access boundary; the limiter does not require a permanent Redis server.
gcloud run deploy charly-research-search --project="$project" --region="$region" --image="$image" --no-allow-unauthenticated --min=0 --min-instances=0 --max=2 --max-instances=2 --cpu=1 --memory=512Mi --concurrency=2 --timeout=30 --cpu-throttling --service-account="$account" --set-secrets=SEARXNG_SECRET=charly-searxng-secret:latest
for account in charly-functions-ai charly-functions-core; do
  gcloud run services add-iam-policy-binding charly-research-search --project="$project" --region="$region" --member="serviceAccount:$account@$project.iam.gserviceaccount.com" --role=roles/run.invoker >/dev/null
done
gcloud run services describe charly-research-search --project="$project" --region="$region" --format='value(status.url)'
