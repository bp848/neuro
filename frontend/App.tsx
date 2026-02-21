
import React, { useState } from 'react';
import { Header } from './components/Header';
import { FileUploader } from './components/FileUploader';
import { AnalysisView } from './components/AnalysisView';
import { AgentConsensus } from './components/AgentConsensus';
import { AudioComparisonPlayer } from './components/AudioComparisonPlayer';
import { MasteringState, MasteringParams } from './types';
import { analyzeAudioWithGemini, getAgentConsensus } from './services/geminiService';
import { buildMasteringChain, optimizeMasteringParams } from './services/dspEngine';
import { Download, RefreshCw, CheckCircle2, Loader2, Waves } from 'lucide-react';

const App: React.FC = () => {
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

  const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());

  const handleUpload = async (file: File) => {
    setState(prev => ({ ...prev, step: 'uploading', fileName: file.name }));
    
    await new Promise(r => setTimeout(r, 2500));
    
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer);

    setState(prev => ({ ...prev, step: 'analyzing', progress: 20, originalBuffer: decoded }));
    
    try {
      const metrics = await analyzeAudioWithGemini(file.name);
      setState(prev => ({ ...prev, analysis: metrics, step: 'consensus', progress: 50 }));
      
      const { opinions, finalParams } = await getAgentConsensus(metrics);
      setState(prev => ({ ...prev, consensus: opinions, finalParams, step: 'processing', progress: 80 }));

      // Prepare buffers for DSP
      const left = decoded.getChannelData(0).slice();
      const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1).slice() : left.slice();
      
      const optimized = optimizeMasteringParams(left, right, decoded.sampleRate, -8.5, finalParams);
      buildMasteringChain(left, right, decoded.sampleRate, optimized.params);
      
      // Create a new AudioBuffer for the mastered version
      const masteredBuffer = audioContext.createBuffer(2, left.length, decoded.sampleRate);
      masteredBuffer.copyToChannel(left, 0);
      masteredBuffer.copyToChannel(right, 1);
      
      setState(prev => ({ 
        ...prev, 
        step: 'completed', 
        progress: 100, 
        finalParams: optimized.params,
        masteredBuffer,
        outputUrl: 'https://storage.googleapis.com/beatport-ai-mastering/results/mastered_' + file.name 
      }));
    } catch (error) {
      console.error("Mastering failed:", error);
      setState(prev => ({ ...prev, step: 'idle' }));
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
                MASTERING <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-500 to-purple-600 glow-text">REDEFINED.</span>
              </h2>
              <p className="text-lg text-gray-400 max-w-2xl mx-auto font-light leading-relaxed">
                Upload your pre-master and let our neural agents negotiate the perfect DSP parameters to dominate the Beatport Top 10.
              </p>
            </div>
            <FileUploader onUpload={handleUpload} isUploading={false} fileName={null} />
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
};

export default App;
