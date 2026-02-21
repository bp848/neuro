
import React from 'react';
import { AgentOpinion, MasteringParams } from '../types';
import { Users, Terminal, Settings, Shield, BrainCircuit } from 'lucide-react';

interface Props {
  opinions: AgentOpinion[];
  finalParams: MasteringParams;
}

export const AgentConsensus: React.FC<Props> = ({ opinions, finalParams }) => {
  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-500/10 rounded-2xl border border-purple-500/30">
            <BrainCircuit className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white">Neuro-Consensus Board</h3>
            <p className="text-sm text-gray-500 font-mono uppercase tracking-widest">Tri-Perspective Parameter Negotiation</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 glass rounded-full border-green-500/20">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-[10px] font-mono text-green-400 uppercase tracking-tighter">Agreement Reached</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {opinions.map((agent, i) => (
          <div key={i} className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-b from-blue-500/20 to-purple-500/20 rounded-3xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
            <div className="relative glass rounded-3xl p-6 h-full flex flex-col">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black border ${
                  agent.role === 'Audience' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                  agent.role === 'A&R' ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' :
                  'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}>
                  {agent.role === 'Audience' ? <Users className="w-6 h-6" /> :
                   agent.role === 'A&R' ? <Shield className="w-6 h-6" /> :
                   <Terminal className="w-6 h-6" />}
                </div>
                <div>
                  <h4 className="font-bold text-white text-lg">{agent.role}</h4>
                  <p className="text-[10px] text-gray-500 font-mono uppercase">Agent Profile v2.5</p>
                </div>
              </div>
              
              <div className="flex-1">
                <div className="relative">
                  <span className="absolute -top-4 -left-2 text-4xl text-white/5 font-serif">"</span>
                  <p className="text-sm text-gray-300 leading-relaxed italic relative z-10">
                    {agent.comment}
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 space-y-3">
                {Object.entries(agent.suggestedParams).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-mono text-gray-500">{key.replace(/_/g, ' ')}</span>
                    <span className="text-xs font-bold text-white bg-white/5 px-2 py-1 rounded">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-[2rem] blur opacity-20"></div>
        <div className="relative glass rounded-[2rem] p-10 border-white/10 overflow-hidden">
          <div className="absolute top-0 right-0 p-10 opacity-5">
            <Settings className="w-40 h-40 animate-[spin_20s_linear_infinite]" />
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="text-center md:text-left">
              <h4 className="text-3xl font-black text-white mb-2 tracking-tighter">FINAL DSP MATRIX</h4>
              <p className="text-blue-400 font-mono text-xs uppercase tracking-[0.4em]">Optimized for Beatport Top 10</p>
            </div>
            
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-12 w-full">
              {[
                { label: 'Tube Saturation', val: finalParams.tube_drive_amount, max: 1, unit: '' },
                { label: 'Pultec Low Boost', val: finalParams.low_contour_amount, max: 2.5, unit: 'dB' },
                { label: 'Limiter Ceiling', val: finalParams.limiter_ceiling_db, max: 2, unit: 'dB', isNeg: true }
              ].map((p, i) => (
                <div key={i} className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{p.label}</span>
                    <span className="text-xl font-black text-white">{p.val.toFixed(2)}{p.unit}</span>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-300 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
                      style={{ width: `${(p.isNeg ? (1 - Math.abs(p.val)/p.max) : (p.val/p.max)) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
