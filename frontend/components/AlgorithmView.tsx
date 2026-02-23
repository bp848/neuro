import React from 'react';
import { Binary, Workflow } from 'lucide-react';

interface Props {
    onNav: (page: 'master' | 'algorithm') => void;
}

export const AlgorithmView: React.FC<Props> = ({ onNav }) => {
    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-black text-white p-12 space-y-12 animate-in fade-in duration-700 font-sans">
            <div className="max-w-4xl mx-auto w-full space-y-8">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-[10px] font-mono text-blue-500 uppercase tracking-[0.4em]">Algorithm Architecture</span>
                    </div>
                    <h2 className="text-5xl font-black italic tracking-tighter uppercase leading-none">
                        Beatport Top 10 <br />
                        <span className="text-gray-500">Standard Rev. 1.2</span>
                    </h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="surface-1 p-8 rounded-2xl border border-white/5 space-y-6">
                        <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                            <Workflow className="w-5 h-5 text-white" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-sm font-bold uppercase tracking-widest italic">Multi-Agent Consensus</h4>
                            <p className="text-xs text-gray-400 font-light leading-relaxed">
                                Parallel AI agents evaluate spectral balance, crest factor, and perceptual loudness. Parameters are negotiated until a target LUFS of -8.0 is reached with optimal transparency.
                            </p>
                        </div>
                    </div>

                    <div className="surface-1 p-8 rounded-2xl border border-white/5 space-y-6">
                        <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                            <Binary className="w-5 h-5 text-white" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-sm font-bold uppercase tracking-widest italic">Hybrid-Analog DSP</h4>
                            <p className="text-xs text-gray-400 font-light leading-relaxed">
                                Combines surgical digital phase-linear EQ with warm tube-emulated saturation. The chain is dynamically adjusted per-frame to preserve transients while maximizing impact.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="surface-1 p-8 rounded-2xl border border-white/5 space-y-8 font-mono">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <span className="text-[10px] uppercase text-gray-500">Target Variable</span>
                        <span className="text-[10px] uppercase text-gray-500">Optimization Goal</span>
                    </div>
                    {[
                        { name: 'Integrated Loudness', goal: '-8.0 LUFS (±0.2)' },
                        { name: 'True Peak Ceiling', goal: '-1.0 dB' },
                        { name: 'Dynamic Range', goal: 'Optimized via Multi-Band Limiter' },
                        { name: 'Spectral Balance', goal: 'Genre-Adaptive Consensus' }
                    ].map(v => (
                        <div key={v.name} className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">{v.name}</span>
                            <span className="text-white font-bold">{v.goal}</span>
                        </div>
                    ))}
                </div>

                <button
                    onClick={() => onNav('master')}
                    className="px-8 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-white/90 transition-all"
                >
                    Return to Console
                </button>
            </div>
        </div>
    );
};
