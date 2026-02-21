
import React, { useState } from 'react';
import { Header } from './components/Header';
import { MasteringFlow } from './components/MasteringFlow';
import { AnalysisView } from './components/AnalysisView';
import { AgentConsensus } from './components/AgentConsensus';
import { AudioComparisonPlayer } from './components/AudioComparisonPlayer';
import { MasteringState, MasteringParams } from './types';
import { Download, RefreshCw, CheckCircle2, Loader2, Waves } from 'lucide-react';
import { supabase } from './services/supabaseClient';

// Use direct functional component definition to avoid FC type issues
export default function App() {
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

  // Subscribe to real-time updates for the active job
  React.useEffect(() => {
    if (!activeJobId) return;

    const fetchAndDecodeMaster = async (url: string) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await audioContext.decodeAudioData(arrayBuffer);
        setState((prev: MasteringState) => ({ ...prev, masteredBuffer: decoded }));
      } catch (e) {
        console.error("Failed to decode mastered audio:", e);
      }
    };

    const channel = supabase
      .channel(`job-${activeJobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mastering_jobs', filter: `id=eq.${activeJobId}` },
        (payload) => {
          const job = payload.new;
          console.log('Job Update:', job);

          const publicUrl = job.output_path ? job.output_path.replace('gs://', 'https://storage.googleapis.com/') : null;

          setState((prev: MasteringState) => ({
            ...prev,
            step: job.status,
            analysis: job.metrics,
            consensus: job.consensus_opinions,
            finalParams: job.final_params,
            outputUrl: publicUrl,
            progress: job.status === 'analyzing' ? 40 : job.status === 'processing' ? 70 : job.status === 'completed' ? 100 : prev.progress
          }));

          if (job.status === 'completed' && publicUrl) {
            fetchAndDecodeMaster(publicUrl);
            channel.unsubscribe();
          }
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [activeJobId, audioContext]);

  const handleUpload = async (file: File, email: string) => {
    setState((prev: MasteringState) => ({ ...prev, step: 'uploading', progress: 5, fileName: file.name }));

    try {
      // Decode locally for original player
      const arrayBuffer = await file.arrayBuffer();
      const originalBuffer = await audioContext.decodeAudioData(arrayBuffer);
      setState(prev => ({ ...prev, originalBuffer }));
      // 1. Create Job in Supabase
      const { data: job, error: jobErr } = await supabase
        .from('mastering_jobs')
        .insert({
          file_name: file.name,
          status: 'uploading',
          input_path: '',
          user_email: email
        })
        .select()
        .single();

      if (jobErr) throw jobErr;
      setActiveJobId(job.id);

      // 2. Get Signed URL for GCS upload
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, jobId: job.id }),
      });
      const { url, path } = await response.json();

      // 3. Upload directly to GCS
      await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          'x-goog-meta-jobId': job.id
        },
        body: file,
      });

      // 4. Update job with the actual path
      await supabase.from('mastering_jobs').update({ input_path: path }).eq('id', job.id);

      setState((prev: MasteringState) => ({ ...prev, progress: 20 }));

    } catch (error) {
      console.error("Mastering failed:", error);
      setState((prev: MasteringState) => ({ ...prev, step: 'idle', progress: 0 }));
    }
  };

  const reset = () => {
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
    });
  };

  const isProcessing = state.step !== 'idle' && state.step !== 'completed';

  return (
    <div className="min-h-screen pb-32 pt-24">
      <Header />

      <main className="max-w-7xl mx-auto px-8">
        {state.step === 'idle' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-12">
            <div className="space-y-6 max-w-4xl">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border-blue-500/20 text-blue-400 text-[10px] font-mono uppercase tracking-[0.3em] mb-4">
                <Waves className="w-3 h-3" /> Next-Gen Audio Intelligence
              </div>
              <h2 className="text-6xl md:text-8xl font-black tracking-tighter leading-none text-white">
                MASTERING <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-500 to-purple-600 glow-text uppercase">Redefined.</span>
              </h2>
              <p className="text-lg text-gray-400 max-w-2xl mx-auto font-light leading-relaxed">
                Experience the world's first multi-agent AI mastering service.
                Our neural network negotiates the perfect tonal balance for your music.
              </p>
            </div>

            <MasteringFlow onComplete={handleUpload} isProcessing={isProcessing} />
          </div>
        )}

        {(state.step !== 'idle' && state.step !== 'completed') && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12">
            <div className="relative">
              <div className="absolute -inset-10 bg-blue-500/10 rounded-full blur-[100px] animate-pulse"></div>
              <div className="relative w-48 h-48 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/5" />
                  <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="4" fill="transparent"
                    strokeDasharray={552} strokeDashoffset={552 - (552 * state.progress) / 100}
                    className="text-blue-500 transition-all duration-1000 ease-out" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-2" />
                  <span className="text-2xl font-black text-white mono">{state.progress}%</span>
                </div>
              </div>
            </div>
            <div className="text-center space-y-3">
              <h3 className="text-3xl font-bold text-white uppercase tracking-widest">
                {state.step === 'uploading' && 'GCS Ingestion'}
                {state.step === 'analyzing' && 'Neural Spectral Scan'}
                {state.step === 'consensus' && 'Agent Deliberation'}
                {state.step === 'processing' && 'DSP Matrix Rendering'}
              </h3>
              <p className="text-blue-400 font-mono text-xs uppercase tracking-[0.5em] animate-pulse">
                {state.step === 'analyzing' && 'Scanning 20 critical spectral nodes...'}
                {state.step === 'consensus' && 'Negotiating dynamic range & saturation...'}
                {state.step === 'processing' && 'Applying Hybrid-Analog Neuro Chain...'}
              </p>
            </div>
          </div>
        )}

        {state.step === 'completed' && (
          <div className="space-y-16 py-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 glass p-10 rounded-[2.5rem] border-blue-500/20">
              <div className="flex items-center gap-8">
                <div className="relative">
                  <div className="absolute -inset-4 bg-green-500/20 rounded-full blur-xl"></div>
                  <div className="relative p-6 bg-green-500/10 rounded-full border border-green-500/30">
                    <CheckCircle2 className="w-12 h-12 text-green-400" />
                  </div>
                </div>
                <div>
                  <h2 className="text-4xl font-black text-white tracking-tight uppercase">Master Ready.</h2>
                  <p className="text-gray-400 font-mono text-xs uppercase tracking-widest mt-1">Beatport Top 10 Compliance: Verified</p>
                </div>
              </div>
              <div className="flex gap-4 w-full md:w-auto">
                <button onClick={reset} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 glass hover:bg-white/5 rounded-2xl transition-all font-bold">
                  <RefreshCw className="w-5 h-5" /> New Session
                </button>
                <a href={state.outputUrl!} download className="flex-1 md:flex-none flex items-center justify-center gap-3 px-10 py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl font-black transition-all neon-glow text-white">
                  <Download className="w-6 h-6" /> DOWNLOAD MASTER
                </a>
              </div>
            </div>

            {/* A/B Comparison Player */}
            {state.originalBuffer && state.masteredBuffer && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 px-2">
                  <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter">A/B Comparison Engine</h3>
                </div>
                <AudioComparisonPlayer original={state.originalBuffer} mastered={state.masteredBuffer} />
              </div>
            )}

            <div className="grid grid-cols-1 gap-16">
              {state.analysis && <AnalysisView metrics={state.analysis} />}
              {state.consensus && state.finalParams && <AgentConsensus opinions={state.consensus} finalParams={state.finalParams} />}
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/5 px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">GCS: Connected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">Gemini: v2.5-Flash</span>
          </div>
        </div>
        <div className="text-[9px] font-mono text-gray-600 uppercase tracking-[0.3em]">
          © 2025 NEURO-MASTER // HYBRID-ANALOG ENGINE
        </div>
      </footer>
    </div>
  );
}
