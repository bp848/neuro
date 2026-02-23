import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MasteringFlow } from './components/MasteringFlow';
import { AnalysisView } from './components/AnalysisView';
import { AgentConsensus } from './components/AgentConsensus';
import { AudioComparisonPlayer } from './components/AudioComparisonPlayer';
import { AlgorithmView } from './components/AlgorithmView';
import { MasteringState } from './types';
import { Loader2, CheckCircle2, RefreshCw, CreditCard } from 'lucide-react';
import { supabase } from './services/supabaseClient';

const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

export default function App() {
  const [page, setPage] = useState<'master' | 'algorithm'>('master');
  const [state, setState] = useState<MasteringState>({
    step: 'idle',
    progress: 0,
    fileName: null,
    analysis: null,
    consensus: null,
    finalParams: null,
    outputUrl: null,
    originalBuffer: null,
    masteredBuffer: null,
  });

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());

  useEffect(() => {
    if (!activeJobId) return;

    const channel = supabase
      .channel(`job-${activeJobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mastering_jobs', filter: `id=eq.${activeJobId}` },
        async (payload) => {
          const job = payload.new;
          console.log('Realtime Update:', job.status, job);

          const publicUrl = job.output_url;

          setState((prev) => ({
            ...prev,
            step: job.status,
            analysis: job.metrics,
            consensus: job.consensus_opinions,
            finalParams: job.final_params,
            outputUrl: publicUrl,
            progress: job.status === 'analyzing' ? 40 : job.status === 'processing' ? 70 : job.status === 'completed' ? 100 : prev.progress
          }));

          if (job.status === 'completed' && publicUrl) {
            try {
              const res = await fetch(publicUrl);
              const buf = await res.arrayBuffer();
              const decoded = await audioContext.decodeAudioData(buf);
              setState(prev => ({ ...prev, masteredBuffer: decoded }));
              channel.unsubscribe();
            } catch (e) {
              console.error("Audio Load Error:", e);
            }
          }
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [activeJobId, audioContext]);

  const handleUpload = async (file: File, email: string) => {
    setState(prev => ({ ...prev, step: 'uploading', progress: 5, fileName: file.name }));
    try {
      // 1. Get Signed URL
      const urlRes = await fetch(`${SUPABASE_FUNCTIONS_URL}/get-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, userEmail: email }),
      });
      const data = await urlRes.json();
      if (!urlRes.ok) throw new Error(data.error || 'Failed to get upload URL');
      const { jobId, uploadUrl } = data;
      setActiveJobId(jobId);

      // 2. Local Decode (Parallel)
      file.arrayBuffer().then(b => audioContext.decodeAudioData(b)).then(buf => {
        setState(prev => ({ ...prev, originalBuffer: buf }));
      });

      // 3. Upload
      const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploadRes.ok) throw new Error('Upload failed');
      setState(prev => ({ ...prev, progress: 30 }));

      // 4. Process
      fetch(`${SUPABASE_FUNCTIONS_URL}/process-mastering`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      }).catch(e => console.error(e));

      setState(prev => ({ ...prev, step: 'analyzing', progress: 35 }));
    } catch (error: any) {
      console.error(error);
      setState(prev => ({ ...prev, step: 'failed', progress: 0, error: error.message }));
    }
  };

  const reset = () => {
    setActiveJobId(null);
    setState({
      step: 'idle',
      progress: 0,
      fileName: null,
      analysis: null,
      consensus: null,
      finalParams: null,
      outputUrl: null,
      originalBuffer: null,
      masteredBuffer: null,
      error: null
    });
  };

  if (page === 'algorithm') return <AlgorithmView onNav={setPage} />;

  return (
    <div className="h-screen flex flex-col surface-0 text-white selection:bg-[#444] dot-grid">
      <Header page={page} onNav={setPage} />

      <main className="flex-1 overflow-hidden flex flex-col">
        {state.step === 'idle' && (
          <div className="flex-1 flex items-center justify-center p-6">
            <MasteringFlow onUpload={handleUpload} />
          </div>
        )}

        {(state.step === 'uploading' || state.step === 'analyzing' || state.step === 'processing') && (
          <div className="flex-1 flex items-center justify-center animate-in">
            <div className="w-96 space-y-8 text-center">
              <div className="relative inline-block">
                <div className="absolute inset-0 blur-2xl bg-white/5 rounded-full" />
                <Loader2 className="w-12 h-12 text-white animate-spin-slow relative mx-auto" strokeWidth={1} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-medium tracking-tight uppercase tracking-widest italic font-black">
                  {state.step === 'uploading' ? 'Ingesting Source...' :
                    state.step === 'analyzing' ? 'Spectral Scan...' :
                      'Matrix Rendering...'}
                </h2>
                <div className="text-[10px] text-[#666] font-mono tracking-[0.5em] animate-pulse">
                  Processing Hybrid Chain
                </div>
              </div>
              <div className="h-[1px] w-full bg-[#111] overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-700 ease-out"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {state.step === 'completed' && (
          <div className="flex-1 flex flex-col overflow-hidden animate-in">
            <div className="h-12 border-b border-white/5 px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span className="text-[10px] font-mono text-[#666] uppercase tracking-[0.2em]">{state.fileName}</span>
              </div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-3 py-1 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-sm hover:opacity-90">
                  <CreditCard className="w-3 h-3" /> Purchase (High-Res)
                </button>
                <button onClick={reset} className="p-1 hover:bg-white/5 rounded transition-colors text-[#666]">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              {state.originalBuffer && state.masteredBuffer && (
                <AudioComparisonPlayer
                  original={state.originalBuffer}
                  mastered={state.masteredBuffer}
                />
              )}
              <div className="grid grid-cols-2 gap-8">
                <AnalysisView metrics={state.analysis || []} />
                <AgentConsensus opinions={state.consensus || []} finalParams={state.finalParams!} />
              </div>
            </div>
          </div>
        )}

        {state.step === 'failed' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-red-500 font-mono text-xs uppercase tracking-widest">Protocol Failure</div>
              <p className="text-[#666] text-[10px] max-w-md mx-auto uppercase tracking-widest">{state.error || "System Timeout"}</p>
              <button onClick={reset} className="px-6 py-2 border border-white/10 hover:bg-white/5 text-[10px] font-bold tracking-widest uppercase rounded-sm transition-all">
                Back to Console
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="h-8 border-t border-white/5 bg-black px-6 flex items-center justify-between opacity-50 z-50">
        <div className="flex items-center gap-4 text-[9px] font-mono text-[#444] uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-green-500" />
            Consensus: Stable
          </div>
          <div className="h-3 w-px bg-white/5" />
          V6 Core Active
        </div>
        <div className="text-[9px] font-mono text-[#222] uppercase tracking-[0.5em]">
          © 2025 NEURO-MASTER
        </div>
      </footer>
    </div>
  );
}
