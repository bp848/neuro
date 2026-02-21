
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Zap, Music, Volume2, RotateCcw } from 'lucide-react';

interface Props {
  original: AudioBuffer;
  mastered: AudioBuffer;
}

export const AudioComparisonPlayer: React.FC<Props> = ({ original, mastered }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMastered, setIsMastered] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainOriginalRef = useRef<GainNode | null>(null);
  const gainMasteredRef = useRef<GainNode | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const animationRef = useRef<number>(0);

  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyzerRef.current = audioCtxRef.current.createAnalyser();
      analyzerRef.current.fftSize = 256;
      
      gainOriginalRef.current = audioCtxRef.current.createGain();
      gainMasteredRef.current = audioCtxRef.current.createGain();
      
      gainOriginalRef.current.connect(analyzerRef.current);
      gainMasteredRef.current.connect(analyzerRef.current);
      analyzerRef.current.connect(audioCtxRef.current.destination);
    }
  }, []);

  const startPlayback = (offset: number) => {
    if (!audioCtxRef.current) return;
    
    // Stop existing
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
    }

    const ctx = audioCtxRef.current;
    const source = ctx.createBufferSource();
    
    // We use the mastered buffer as the primary source, but we'll switch gains
    // For A/B to be perfect, we actually need to play two sources in sync or 
    // swap the buffer. Swapping buffer is easier for sync.
    source.buffer = isMastered ? mastered : original;
    source.connect(isMastered ? gainMasteredRef.current! : gainOriginalRef.current!);
    
    // Set gains
    gainMasteredRef.current!.gain.value = isMastered ? 1 : 0;
    gainOriginalRef.current!.gain.value = isMastered ? 0 : 1;

    source.start(0, offset);
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime - offset;
    setIsPlaying(true);
  };

  const togglePlay = () => {
    initAudio();
    if (isPlaying) {
      offsetRef.current = audioCtxRef.current!.currentTime - startTimeRef.current;
      sourceRef.current?.stop();
      setIsPlaying(false);
    } else {
      startPlayback(offsetRef.current % original.duration);
    }
  };

  const toggleMode = () => {
    const wasPlaying = isPlaying;
    const currentOffset = isPlaying 
      ? (audioCtxRef.current!.currentTime - startTimeRef.current) 
      : offsetRef.current;
    
    setIsMastered(!isMastered);
    
    if (wasPlaying) {
      startPlayback(currentOffset % original.duration);
    } else {
      offsetRef.current = currentOffset;
    }
  };

  // Visualizer Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      if (isPlaying && audioCtxRef.current) {
        const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
        const p = (elapsed % original.duration) / original.duration;
        setProgress(p * 100);
        setCurrentTime(elapsed % original.duration);
      }

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (analyzerRef.current) {
        const bufferLength = analyzerRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyzerRef.current.getByteFrequencyData(dataArray);

        const centerX = width / 2;
        const centerY = height / 2;
        const radius = 80 + (dataArray[0] / 255) * 20;

        // Draw Neuro-Ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = isMastered ? 'rgba(0, 242, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Frequency Synapses
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * 60;
          const angle = (i / bufferLength) * Math.PI * 2;
          const x1 = centerX + Math.cos(angle) * radius;
          const y1 = centerY + Math.sin(angle) * radius;
          const x2 = centerX + Math.cos(angle) * (radius + barHeight);
          const y2 = centerY + Math.sin(angle) * (radius + barHeight);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = isMastered 
            ? `hsla(${180 + (i/bufferLength)*60}, 100%, 50%, ${dataArray[i]/255})`
            : `rgba(255, 255, 255, ${dataArray[i]/512})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, isMastered, original.duration]);

  return (
    <div className="relative glass rounded-[3rem] p-12 border-white/10 overflow-hidden group">
      {/* Background Glow */}
      <div className={`absolute inset-0 transition-opacity duration-1000 blur-[120px] opacity-20 ${isMastered ? 'bg-blue-500' : 'bg-gray-500'}`}></div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Visualizer Core */}
        <div className="relative mb-12">
          <canvas ref={canvasRef} width={400} height={400} className="w-64 h-64 md:w-80 md:h-80" />
          <div className="absolute inset-0 flex items-center justify-center">
            <button 
              onClick={togglePlay}
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 transform hover:scale-110 ${
                isMastered ? 'bg-blue-600 shadow-[0_0_40px_rgba(0,242,255,0.4)]' : 'bg-white/10 border border-white/20'
              }`}
            >
              {isPlaying ? <Pause className="w-10 h-10 text-white fill-current" /> : <Play className="w-10 h-10 text-white fill-current ml-2" />}
            </button>
          </div>
        </div>

        {/* A/B Toggle HUD */}
        <div className="flex items-center gap-8 mb-10">
          <button 
            onClick={() => isMastered && toggleMode()}
            className={`px-8 py-3 rounded-2xl font-black transition-all duration-300 border ${
              !isMastered ? 'bg-white/10 border-white/40 text-white' : 'bg-transparent border-white/5 text-gray-600 hover:text-gray-400'
            }`}
          >
            ORIGINAL
          </button>
          
          <div className="flex flex-col items-center gap-1">
            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.3em]">Neuro-Drive</div>
            <button 
              onClick={toggleMode}
              className={`relative w-20 h-10 rounded-full transition-colors duration-500 ${isMastered ? 'bg-blue-600/30' : 'bg-white/5'}`}
            >
              <div className={`absolute top-1 left-1 w-8 h-8 rounded-full transition-all duration-500 flex items-center justify-center ${
                isMastered ? 'translate-x-10 bg-blue-400 shadow-[0_0_15px_rgba(0,242,255,0.8)]' : 'translate-x-0 bg-gray-600'
              }`}>
                <Zap className={`w-4 h-4 ${isMastered ? 'text-white' : 'text-gray-400'}`} />
              </div>
            </button>
          </div>

          <button 
            onClick={() => !isMastered && toggleMode()}
            className={`px-8 py-3 rounded-2xl font-black transition-all duration-300 border ${
              isMastered ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 glow-text' : 'bg-transparent border-white/5 text-gray-600 hover:text-gray-400'
            }`}
          >
            MASTERED
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-2xl space-y-4">
          <div className="flex justify-between font-mono text-[10px] text-gray-500 uppercase tracking-widest">
            <span>{new Date(currentTime * 1000).toISOString().substr(14, 5)}</span>
            <span className="text-blue-400">{isMastered ? 'NEURO-ENGINE ACTIVE' : 'BYPASS MODE'}</span>
            <span>{new Date(original.duration * 1000).toISOString().substr(14, 5)}</span>
          </div>
          <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden cursor-pointer group/progress">
            <div 
              className={`absolute inset-y-0 left-0 transition-all duration-100 ${isMastered ? 'bg-blue-500 shadow-[0_0_10px_rgba(0,242,255,0.5)]' : 'bg-white/40'}`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};
