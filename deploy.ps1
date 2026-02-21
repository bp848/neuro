# AI Mastering Service Deployment Script (GCP)
# This script deploys the entire serverless pipeline.

$GCLOUD = "C:\Users\ishij\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$GSUTIL = "C:\Users\ishij\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gsutil.cmd"

$PROJECT_ID = "aidriven-mastering-fyqu"
$REGION = "asia-northeast1"
$INPUT_BUCKET = "aidriven-mastering-input"
$OUTPUT_BUCKET = "aidriven-mastering-output"
$TOPIC_UPLOAD = "audio-upload-topic"
$TOPIC_DSP = "dsp-params-topic"

Write-Host "--- Starting Deployment for Project: $PROJECT_ID ---" -ForegroundColor Cyan

# 1. Enable APIs
Write-Host "Enabling necessary APIs..."
& $GCLOUD services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com pubsub.googleapis.com storage.googleapis.com --project $PROJECT_ID

# 2. Create GCS Buckets
Write-Host "Creating GCS buckets..."
if (!(& $GSUTIL ls -p $PROJECT_ID | Select-String "gs://$INPUT_BUCKET/")) {
    & $GSUTIL mb -p $PROJECT_ID -l $REGION gs://$INPUT_BUCKET
}
if (!(& $GSUTIL ls -p $PROJECT_ID | Select-String "gs://$OUTPUT_BUCKET/")) {
    & $GSUTIL mb -p $PROJECT_ID -l $REGION gs://$OUTPUT_BUCKET
}

# 3. Create Artifact Registry
Write-Host "Creating Artifact Registry..."
if (!(& $GCLOUD artifacts repositories list --location=$REGION --project=$PROJECT_ID | Select-String "neuro-master-repo")) {
    & $GCLOUD artifacts repositories create neuro-master-repo --repository-format=docker --location=$REGION --project=$PROJECT_ID
}

# 4. Create Pub/Sub Topics
Write-Host "Creating Pub/Sub topics..."
if (!(& $GCLOUD pubsub topics list --project $PROJECT_ID | Select-String "topics/$TOPIC_UPLOAD")) {
    & $GCLOUD pubsub topics create $TOPIC_UPLOAD --project $PROJECT_ID
}
if (!(& $GCLOUD pubsub topics list --project $PROJECT_ID | Select-String "topics/$TOPIC_DSP")) {
    & $GCLOUD pubsub topics create $TOPIC_DSP --project $PROJECT_ID
}

# 5. Build and Deploy DSP Mastering Engine (Python)
Write-Host "Deploying DSP Mastering Engine..."
cd backend/dsp-mastering-engine
& $GCLOUD builds submit --tag $REGION-docker.pkg.dev/$PROJECT_ID/neuro-master-repo/dsp-engine --project $PROJECT_ID
& $GCLOUD run deploy dsp-mastering-engine `
  --image $REGION-docker.pkg.dev/$PROJECT_ID/neuro-master-repo/dsp-engine `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION" `
  --project $PROJECT_ID
$DSP_URL = (& $GCLOUD run services describe dsp-mastering-engine --platform managed --region $REGION --format 'value(status.url)' --project $PROJECT_ID)
cd ../..

# 6. Set up Pub/Sub Push for DSP Engine
Write-Host "Configuring Pub/Sub push to DSP Engine..."
if (!(& $GCLOUD pubsub subscriptions list --project $PROJECT_ID | Select-String "subscriptions/dsp-engine-sub")) {
    & $GCLOUD pubsub subscriptions create dsp-engine-sub `
      --topic $TOPIC_DSP `
      --push-endpoint="$DSP_URL" `
      --project $PROJECT_ID
}

# 7. Build and Deploy Audio Analysis Trigger (Node.js)
Write-Host "Deploying Audio Analysis Trigger..."
cd backend/audio-analysis-trigger
& $GCLOUD builds submit --tag $REGION-docker.pkg.dev/$PROJECT_ID/neuro-master-repo/analysis-trigger --project $PROJECT_ID
& $GCLOUD run deploy audio-analysis-trigger `
  --image $REGION-docker.pkg.dev/$PROJECT_ID/neuro-master-repo/analysis-trigger `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,DSP_PARAMS_TOPIC=$TOPIC_DSP,OUTPUT_BUCKET=$OUTPUT_BUCKET" `
  --project $PROJECT_ID
cd ../..

# 8. Configure GCS Trigger for Analysis
Write-Host "Setting up GCS notification trigger..."
$PROJECT_NUMBER = (& $GCLOUD projects describe $PROJECT_ID --format="value(projectNumber)")
$GCS_SERVICE_ACCOUNT = "service-$PROJECT_NUMBER@gs-project-accounts.iam.gserviceaccount.com"
Write-Host "Granting Pub/Sub publishing rights to GCS service account..."
& $GCLOUD pubsub topics add-iam-policy-binding $TOPIC_UPLOAD --member="serviceAccount:$GCS_SERVICE_ACCOUNT" --role="roles/pubsub.publisher" --project $PROJECT_ID

if (!(& $GSUTIL notification list gs://$INPUT_BUCKET | Select-String $TOPIC_UPLOAD)) {
    & $GSUTIL notification create -t $TOPIC_UPLOAD -f json gs://$INPUT_BUCKET
}

Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "Input Bucket: gs://$INPUT_BUCKET"
Write-Host "Output Bucket: gs://$OUTPUT_BUCKET"
