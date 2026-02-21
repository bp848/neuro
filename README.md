# Neuro-Master: AI-Driven Audio Mastering (Production-Ready)

Neuro-Master is a state-of-the-art AI audio mastering service that leverages a multi-agent neural consensus and a hybrid-analog DSP engine to deliver professional-grade masters aligned with the "Beatport Top 10" sonic standard.

## 🚀 Key Features

- **Multi-Agent Neural Consensus**: Spectral analysis handled by sequential AI agents (Audience, A&R, and Engineer) to negotiate the perfect parameters.
- **Hybrid-Analog DSP Engine**: High-fidelity Python-based processing with iterative self-correction for target LUFS and Peak integrity.
- **Real-time Synchronization**: Powered by Supabase for instant progress updates and job status tracking.
- **Production Email Delivery**: Automated job completion notifications via Resend.
- **Microservices Architecture**: Scalable, event-driven pipeline deployed on Google Cloud Platform.

## 🏗️ Architecture

1.  **Frontend**: React (Vite) + Tailwind CSS + Lucide Icons.
2.  **Analysis Trigger (Node.js)**: Google Cloud Run service that orchestrates the multi-agent Gemini analysis.
3.  **DSP Engine (Python)**: Google Cloud Run service for high-performance audio processing (Numpy/Scipy).
4.  **Database & Real-time**: Supabase Postgres + Real-time subscriptions.
5.  **Storage**: Google Cloud Storage (GCS) with event triggers.
6.  **Email**: Resend API via Vercel Serverless Functions.

## 🛠️ Prerequisites

- **Google Cloud SDK**: Authenticated and configured with a project.
- **Node.js 20+** & **Python 3.10+**.
- **Supabase Account**: With a `mastering_jobs` table.
- **Resend API Key**: For email notifications.

## 🚦 Getting Started

### 1. Environment Variables

Create `.env` files in `frontend/`, `backend/audio-analysis-trigger/`, and `backend/dsp-mastering-engine/`.

**Frontend (`frontend/.env`):**
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Backend (Cloud Run Secrets):**
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLOUD_PROJECT`
- `INPUT_BUCKET`
- `OUTPUT_BUCKET`

### 2. Local Development

From the root directory:
```bash
npm install
npm run dev
```

This will concurrently start the frontend and the analysis trigger service.

## 📝 License

© 2025 NEURO-MASTER. All rights reserved. Professional use only.
