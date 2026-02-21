
import React from 'react';
import { Upload, FileAudio, Zap, Layers } from 'lucide-react';

interface Props {
  onUpload: (file: File) => void;
  isUploading: boolean;
  fileName: string | null;
}

export const FileUploader: React.FC<Props> = ({ onUpload, isUploading, fileName }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <label className={`
        relative group flex flex-col items-center justify-center w-full h-80 
        rounded-3xl cursor-pointer transition-all duration-500 overflow-hidden
        ${fileName ? 'bg-blue-500/5 border-2 border-blue-500/30' : 'bg-white/[0.02] border-2 border-dashed border-white/10 hover:border-blue-500/40 hover:bg-white/[0.04]'}
      `}>
        <input type="file" className="hidden" accept="audio/*" onChange={handleFileChange} disabled={isUploading} />
        
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity">
          <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500 blur-[100px]"></div>
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-purple-500 blur-[100px]"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-6">
          {fileName ? (
            <>
              <div className="relative mb-6">
                <div className="absolute -inset-4 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
                <div className="relative p-6 bg-blue-500/10 rounded-full border border-blue-500/30">
                  <FileAudio className="w-12 h-12 text-blue-400" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2 mono">{fileName}</h3>
              <div className="flex items-center gap-4 text-xs font-mono text-blue-400 uppercase tracking-widest">
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Ready for Neuro-Scan</span>
                <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
                <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> GCS Buffer Initialized</span>
              </div>
            </>
          ) : (
            <>
              <div className="p-6 bg-white/5 rounded-full mb-6 border border-white/10 group-hover:scale-110 transition-transform duration-500">
                <Upload className="w-12 h-12 text-gray-400 group-hover:text-blue-400 transition-colors" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Initialize Mastering Sequence</h3>
              <p className="text-gray-500 max-w-xs mx-auto text-sm leading-relaxed">
                Drop your high-fidelity pre-master (WAV/AIFF) to begin the AI-driven optimization process.
              </p>
            </>
          )}
        </div>

        {isUploading && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-20">
            <div className="scanline"></div>
            <div className="relative w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-400 animate-[progress_2s_ease-in-out_infinite]" style={{ width: '60%' }}></div>
            </div>
            <p className="text-blue-400 font-mono text-xs uppercase tracking-[0.3em] animate-pulse">Uploading to GCS Cluster...</p>
          </div>
        )}
      </label>
    </div>
  );
};
