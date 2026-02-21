
import React from 'react';
import { Cpu, Activity, ShieldCheck, Globe } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5 px-8 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="absolute -inset-1 bg-blue-500 rounded-lg blur opacity-25 animate-pulse"></div>
          <div className="relative p-2 bg-black rounded-lg border border-blue-500/50">
            <Cpu className="w-6 h-6 text-blue-400" />
          </div>
        </div>
        <div>
          <h1 className="text-lg font-extrabold tracking-[0.2em] text-white flex items-center gap-2">
            NEURO<span className="text-blue-400">MASTER</span>
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 font-mono">v2.5</span>
          </h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Hybrid-Analog DSP // GCS Integrated</p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-8">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-green-500" />
          <span className="text-[10px] font-mono text-gray-400 uppercase">Engine: Online</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          <span className="text-[10px] font-mono text-gray-400 uppercase">Auth: Verified</span>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-purple-500" />
          <span className="text-[10px] font-mono text-gray-400 uppercase">Region: Global-Edge</span>
        </div>
      </div>
    </header>
  );
};
