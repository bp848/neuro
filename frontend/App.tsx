
import React, { useState } from 'react';
import { Header } from './components/Header';
import { MasteringFlow } from './components/MasteringFlow';
import { AnalysisView } from './components/AnalysisView';
import { AgentConsensus } from './components/AgentConsensus';
import { AudioComparisonPlayer } from './components/AudioComparisonPlayer';
import { AlgorithmPage } from './components/AlgorithmPage';
import { MasteringState } from './types';
import { Download, CheckCircle2, AlertCircle, Mail, Clock, Loader2 } from 'lucide-react';
import { supabase } from './services/supabaseClient';

const idleState: MasteringState = {
  step: 'idle', progress: 0, fileName: null, analysis: null,
  consensus: null, finalParams: null, outputUrl: null,
  originalBuffer: null, masteredBuffer: null, userEmail: null, error: null,
};

export default function App() {
  const [page, setPage] = useState<'upload' | 'algorithm'>('upload');
  const [state, setState] = useState<MasteringState>({ ...idleState });
  const [submittedJob, setSubmittedJob] = useState<{ id: string; fileName: string } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());

  React.useEffect(() => {
    if (!activeJobId) return;

    const fetchAndDecodeMaster = async (url: string) => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const decoded = await audioContext.decodeAudioData(buf);
        setState(prev => ({ ...prev, masteredBuffer: decoded }));
      } catch (e) { console.error('Decode failed:', e); }
    };

    const checkInitialStatus = async () => {
      const { data: job } = await supabase
        .from('mastering_jobs').select('*').eq('id', activeJobId).single();
      if (!job) return;
      if (job.status === 'failed') {
        setState(prev => ({ ...prev, step: 'idle', error: job.error_message }));
        return;
      }
      const publicUrl = job.output_url ?? null;
      setState(prev => ({
        ...prev, step: job.status as any, analysis: job.metrics,
        consensus: job.consensus_opinions, finalParams: job.final_params,
        outputUrl: publicUrl, userEmail: job.user_email,
        progress: job.status === 'completed' ? 100 : 20,
      }));
    };
    checkInitialStatus();

    const channel = supabase.channel(`job-${activeJobId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mastering_jobs', filter: `id=eq.${activeJobId}` },
        (payload) => {
          const job = payload.new;
          const publicUrl = job.output_url ?? null;
          if (job.status === 'failed') {
            setState(prev => ({ ...prev, step: 'idle', progress: 0, error: job.error_message || 'Processing failed.' }));
            setActiveJobId(null); channel.unsubscribe(); return;
          }
          setState(prev => ({
            ...prev, step: job.status, analysis: job.metrics,
            consensus: job.consensus_opinions, finalParams: job.final_params,
            outputUrl: publicUrl, userEmail: job.user_email, error: null,
            progress: job.status === 'completed' ? 100 : 20,
          }));
          if (job.status === 'completed' && publicUrl) {
            fetchAndDecodeMaster(publicUrl); channel.unsubscribe();
          }
        }
      ).subscribe();

    return () => { channel.unsubscribe(); };
  }, [activeJobId, audioContext]);

  const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

  const handleUpload = async (file: File, email: string) => {
    setState(prev => ({ ...prev, step: 'uploading', progress: 5, fileName: file.name, userEmail: email }));
    try {
      // ── 1. Get signed upload URL + create job (via Edge Function, no Vercel service role needed) ──
      const urlRes = await fetch(`${SUPABASE_FUNCTIONS_URL}/get-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, userEmail: email }),
      });
      const urlData = await urlRes.json().catch(() => null);
      if (!urlRes.ok) throw new Error(urlData?.error || `get-upload-url error (${urlRes.status})`);
      const { jobId, uploadUrl } = urlData as { jobId: string; uploadUrl: string; storagePath: string };

      setActiveJobId(jobId);

      // Decode for A/B player (non-blocking)
      file.arrayBuffer()
        .then(buf => audioContext.decodeAudioData(buf))
        .then(decoded => setState(prev => ({ ...prev, originalBuffer: decoded })))
        .catch(e => console.error('Decode:', e));

      // ── 2. Upload file to Supabase Storage ──────────────────────────────────
      setState(prev => ({ ...prev, progress: 30 }));
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error(`Storage upload failed: ${uploadRes.status}`);

      setState(prev => ({ ...prev, progress: 60 }));

      // ── 3. Kick off mastering (fire-and-forget, Edge Function handles completion + email) ──
      fetch(`${SUPABASE_FUNCTIONS_URL}/process-mastering`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      }).catch(e => console.error('process-mastering:', e));

      setSubmittedJob({ id: jobId, fileName: file.name });
      setState(prev => ({ ...prev, step: 'analyzing', progress: 70 }));
    } catch (error: any) {
      console.error(error);
      setState(prev => ({ ...prev, step: 'idle', progress: 0, error: error.message }));
    }
  };


  const reset = () => { setSubmittedJob(null); setActiveJobId(null); setState({ ...idleState }); };

  // ── Uploading ──────────────────────────────────────────────────────────────
  if (state.step === 'uploading') {
    return (
      <div className="h-screen flex flex-col surface-0 dot-grid">
        <Header page={page} onNav={setPage} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-80 space-y-5 animate-in">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-[#666] animate-spin-slow flex-none" strokeWidth={1.5} />
              <div className="min-w-0">
                <p className="label">Uploading</p>
                <p className="text-sm text-white truncate">{state.fileName}</p>
              </div>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${state.progress}%` }} />
            </div>
            <p className="mono text-[#444]">{state.progress}% complete</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Analyzing / Processing ─────────────────────────────────────────────────
  if (['analyzing', 'consensus', 'processing'].includes(state.step)) {
    return (
      <div className="h-screen flex flex-col surface-0 dot-grid">
        <Header page={page} onNav={setPage} />
        <div className="flex-1 flex items-center justify-center">
          <div className="surface-1 rounded-xl p-8 w-96 space-y-6 animate-in">
            <div className="flex items-start gap-3">
              <span className="status-dot status-busy mt-1.5 flex-none" />
              <div>
                <p className="text-sm font-semibold text-white mb-0.5">Mastering in progress</p>
                <p className="text-[#666] text-xs leading-relaxed">
                  You can close this tab. We'll send the result to your email when it's done.
                </p>
              </div>
            </div>
            <div className="divider" />
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 mono text-[#555]"><Mail className="w-3 h-3" /> Deliver to</span>
                <span className="mono text-[#aaa] truncate max-w-[180px]">{state.userEmail}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 mono text-[#555]"><Clock className="w-3 h-3" /> ETA</span>
                <span className="mono text-[#aaa]">~2 min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="mono text-[#444]">Job ID</span>
                <span className="mono text-[#444] truncate max-w-[200px]">{activeJobId}</span>
              </div>
            </div>
            <div className="divider" />
            <p className="mono text-[#444]">
              No email after 15 min?{' '}
              <button onClick={reset} className="text-[#888] underline hover:text-white transition-colors">Try again</button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Completed ──────────────────────────────────────────────────────────────
  if (state.step === 'completed') {
    return (
      <div className="h-screen flex flex-col surface-0">
        {/* Toolbar */}
        <div className="flex-none h-11 surface-1 border-b border-[#1f1f1f] flex items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#22c55e]" strokeWidth={1.5} />
            <span className="text-sm font-medium text-white">{state.fileName}</span>
            <span className="tag tag-green">Complete</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="btn-secondary text-xs">
              New session
            </button>
            <a href={state.outputUrl!} download className="btn-primary text-xs flex items-center gap-1.5">
              <Download className="w-3 h-3" /> Download WAV
            </a>
          </div>
        </div>

        {/* Scrollable results */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {state.originalBuffer && state.masteredBuffer && (
              <AudioComparisonPlayer original={state.originalBuffer} mastered={state.masteredBuffer} />
            )}
            {state.analysis && <AnalysisView metrics={state.analysis} />}
            {state.consensus && state.finalParams && (
              <AgentConsensus opinions={state.consensus} finalParams={state.finalParams} />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Idle / Upload form ─────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col surface-0 dot-grid">
      <Header page={page} onNav={setPage} />

      {page === 'algorithm' ? (
        <AlgorithmPage />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-sm space-y-6 animate-in">

            {/* Title */}
            <div>
              <p className="label mb-2">AI Audio Mastering</p>
              <h1 className="text-2xl font-semibold text-white tracking-tight leading-snug">
                Beatport Top 10 — standard.<br />
                <span className="text-[#555]">Upload. We master. You download.</span>
              </h1>
            </div>

            {/* Submitted notice */}
            {submittedJob && (
              <div className="surface-1 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#22c55e] mt-0.5 flex-none" strokeWidth={1.5} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{submittedJob.fileName}</p>
                  <p className="mono text-[#555] mt-0.5">Queued — check email in ~2 min</p>
                  <p className="mono text-[#333] mt-1">{submittedJob.id}</p>
                </div>
              </div>
            )}

            {/* Error */}
            {state.error && (
              <div className="surface-1 rounded-lg p-4 flex items-start gap-3 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-[#f87171] mt-0.5 flex-none" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f87171]">{state.error}</p>
                </div>
                <button onClick={() => setState(p => ({ ...p, error: null }))} className="text-[#444] hover:text-[#999] text-base leading-none">×</button>
              </div>
            )}

            {/* Upload form */}
            <MasteringFlow onComplete={handleUpload} isProcessing={false} />
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex-none h-7 surface-1 border-t border-[#1f1f1f] flex items-center justify-between px-5">
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-1.5 mono text-[#444]">
            <span className="status-dot status-online" /> GCS
          </span>
          <span className="flex items-center gap-1.5 mono text-[#444]">
            <span className="status-dot" style={{ background: '#818cf8' }} /> Gemini 2.5-Flash
          </span>
          <span className="flex items-center gap-1.5 mono text-[#444]">
            <span className="status-dot" style={{ background: '#22c55e' }} /> Supabase
          </span>
        </div>
        <span className="mono text-[#333]">NEURO-MASTER · Hybrid-Analog DSP Engine</span>
      </div>
    </div>
  );
}
