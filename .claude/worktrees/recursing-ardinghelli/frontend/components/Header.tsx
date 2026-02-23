
import React from 'react';
import { Cpu, Activity } from 'lucide-react';

interface HeaderProps {
  page: 'upload' | 'algorithm';
  onNav: (p: 'upload' | 'algorithm') => void;
}

export const Header: React.FC<HeaderProps> = ({ page, onNav }) => {
  return (
    <header className="flex-none h-11 surface-1 border-b border-[#1f1f1f] flex items-center justify-between px-5">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <Cpu className="w-4 h-4 text-white" strokeWidth={1.5} />
        <span className="text-sm font-semibold text-white tracking-tight">NEURO-MASTER</span>
        <span className="tag tag-gray ml-1">v2.5</span>
      </div>

      {/* Nav */}
      <nav className="flex items-center gap-1">
        {([['upload', 'Master'], ['algorithm', 'Algorithm & Pricing']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => onNav(id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${page === id
                ? 'bg-white/8 text-white'
                : 'text-[#666] hover:text-[#aaa] hover:bg-white/4'
              }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="status-dot status-online" />
          <span className="mono text-[#555]">Engine Online</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-[#444]" strokeWidth={1.5} />
          <span className="mono text-[#555]">Gemini 2.5-Flash</span>
        </div>
      </div>
    </header>
  );
};
