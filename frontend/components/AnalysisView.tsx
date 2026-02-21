
import React from 'react';
import { AnalysisMetric } from '../types';
import { Activity, Target, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface Props {
  metrics: AnalysisMetric[];
}

export const AnalysisView: React.FC<Props> = ({ metrics }) => {
  const score = Math.round((metrics.filter(m => m.status === 'optimal').length / metrics.length) * 100);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-3 text-white">
            <Activity className="w-6 h-6 text-blue-400" />
            Spectral Scan Results
          </h3>
          <p className="text-gray-500 text-sm font-mono uppercase tracking-widest mt-1">20-Point Beatport Top 10 Comparison</p>
        </div>
        <div className="glass px-6 py-4 rounded-2xl border-blue-500/20 flex items-center gap-6">
          <div className="text-center">
            <div className="text-[10px] text-gray-500 uppercase font-mono mb-1">Compatibility</div>
            <div className="text-3xl font-black text-blue-400 glow-text">{score}%</div>
          </div>
          <div className="h-10 w-px bg-white/10"></div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500 uppercase font-mono mb-1">Status</div>
            <div className={`text-sm font-bold uppercase ${score > 80 ? 'text-green-400' : 'text-yellow-400'}`}>
              {score > 80 ? 'Optimal' : 'Needs Neuro-Drive'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="glass p-4 rounded-xl border-white/5 hover:border-blue-500/30 transition-all group">
            <div className="flex justify-between items-start mb-3">
              <div className="p-1.5 bg-white/5 rounded-lg group-hover:bg-blue-500/10 transition-colors">
                {m.status === 'optimal' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : 
                 m.status === 'high' ? <AlertTriangle className="w-4 h-4 text-red-500" /> : 
                 <Info className="w-4 h-4 text-yellow-500" />}
              </div>
              <span className="text-[10px] font-mono text-gray-500 uppercase">{m.unit}</span>
            </div>
            <h4 className="text-xs font-bold text-gray-300 mb-1 truncate">{m.name}</h4>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-lg font-black text-white">{m.value}</span>
              <span className="text-[10px] text-gray-600">/ {m.target}</span>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${m.status === 'optimal' ? 'bg-green-500' : m.status === 'high' ? 'bg-red-500' : 'bg-yellow-500'}`}
                style={{ width: `${Math.min(100, (m.value / m.target) * 100)}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
