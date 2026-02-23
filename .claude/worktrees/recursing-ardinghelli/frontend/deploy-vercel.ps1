# Neuro-Master Deployment Script (Production)
# Usage: $env:RESEND_API_KEY="..."; ./deploy-vercel.ps1

$JSON_KEY = Get-Content ../sa-key.json -Raw -Encoding utf8 | Out-String
$JSON_KEY = $JSON_KEY.Trim()

# Deploy to Vercel with critical environment variables
npx vercel deploy --prod --yes `
  -e VITE_SUPABASE_URL="$env:VITE_SUPABASE_URL" `
  -e VITE_SUPABASE_ANON_KEY="$env:VITE_SUPABASE_ANON_KEY" `
  -e GOOGLE_CLOUD_PROJECT="$env:GOOGLE_CLOUD_PROJECT" `
  -e INPUT_BUCKET="$env:INPUT_BUCKET" `
  -e OUTPUT_BUCKET="$env:OUTPUT_BUCKET" `
  -e RESEND_API_KEY="$env:RESEND_API_KEY" `
  -e EMAIL_FROM="$env:EMAIL_FROM" `
  -e NEXT_PUBLIC_APP_URL="$env:NEXT_PUBLIC_APP_URL" `
  -e GOOGLE_APPLICATION_CREDENTIALS_JSON="$JSON_KEY"

Write-Host "Deployment initiated. Check Vercel dashboard for status." -ForegroundColor Green
