
import React from 'react';
import { Cpu, Activity, ShieldCheck, Globe } from 'lucide-react';

interface HeaderProps {
  page: 'master' | 'algorithm';
  onNav: (page: 'master' | 'algorithm') => void;
}

export const Header: React.FC<HeaderProps> = ({ page, onNav }) => {
  return (
    <header className="h-14 border-b border-white/5 px-6 flex items-center justify-between glass z-50">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center">
            <Cpu className="w-4 h-4 text-black" />
          </div>
          <span className="text-sm font-bold tracking-tighter uppercase">Neuro-Master</span>
        </div>

        <nav className="flex items-center gap-6">
          <button
            onClick={() => onNav('master')}
            className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${page === 'master' ? 'text-white' : 'text-[#444] hover:text-[#888]'}`}
          >
            Master
          </button>
          <button
            onClick={() => onNav('algorithm')}
            className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${page === 'algorithm' ? 'text-white' : 'text-[#444] hover:text-[#888]'}`}
          >
            Algorithm
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Activity className="w-3 h-3 text-green-500" />
          <span className="text-[10px] font-mono text-[#444] uppercase tracking-widest">Engine: v6.0</span>
        </div>
        <div className="w-px h-3 bg-white/5" />
        <div className="text-[10px] font-mono text-[#444] uppercase tracking-widest">
          Auth: {page.toUpperCase()}
        </div>
      </div>
    </header>
  );
};
