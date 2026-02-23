
import React, { useState } from 'react';
import { Mail, Upload, Play, ChevronRight, Music, AlertCircle } from 'lucide-react';

interface Props {
    onUpload: (file: File, email: string) => void;
}

type FlowStep = 'email' | 'upload' | 'confirm';

export const MasteringFlow: React.FC<Props> = ({ onUpload }) => {
    const [step, setStep] = useState<FlowStep>('upload');
    const [email, setEmail] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const handleNext = () => {
        if (step === 'email' && email) setStep('confirm');
        else if (step === 'upload' && file) setStep('email');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setStep('email');
        }
    };

    const initiateMastering = () => {
        if (file && email) {
            onUpload(file, email);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
            {/* Progress Bar */}
            <div className="flex justify-between items-center mb-12 px-2">
                {[
                    { id: 'email', icon: Mail, label: 'Delivery' },
                    { id: 'upload', icon: Upload, label: 'Source' },
                    { id: 'confirm', icon: Play, label: 'Execute' }
                ].map((s, i) => (
                    <React.Fragment key={s.id}>
                        <div className="flex flex-col items-center gap-3 relative z-10">
                            <div className={`
                w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500
                ${step === s.id ? 'bg-blue-500 text-white neon-glow scale-110' :
                                    (i < ['email', 'upload', 'confirm'].indexOf(step) ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-gray-600 border border-white/5')}
              `}>
                                <s.icon className="w-5 h-5" />
                            </div>
                            <span className={`text-[10px] uppercase tracking-[0.2em] font-bold ${step === s.id ? 'text-blue-400' : 'text-gray-600'}`}>
                                {s.label}
                            </span>
                        </div>
                        {i < 2 && (
                            <div className={`h-px flex-1 mx-4 ${i < ['email', 'upload', 'confirm'].indexOf(step) ? 'bg-green-500/30' : 'bg-white/5'}`} />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Content Area */}
            <div className="glass rounded-[2rem] p-10 border-white/5 min-h-[400px] flex flex-col justify-between relative overflow-hidden">
                {/* Step 1: Email */}
                {step === 'email' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="space-y-4">
                            <h3 className="text-3xl font-black text-white tracking-tight italic">01 // DELIVERY POINT</h3>
                            <p className="text-gray-400 leading-relaxed text-sm max-w-md">
                                We'll send your professionally mastered preview and download link to this address. AI processing can take up to 2 minutes.
                            </p>
                        </div>

                        <div className="relative group">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="email"
                                placeholder="producer@studio.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-5 text-lg text-white placeholder:text-gray-700 focus:border-blue-500/50 focus:bg-white/[0.08] outline-none transition-all"
                            />
                        </div>

                        <button
                            onClick={handleNext}
                            disabled={!email || !email.includes('@')}
                            className="w-full flex items-center justify-center gap-3 py-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-blue-600 text-white font-black rounded-2xl transition-all uppercase tracking-widest text-sm group"
                        >
                            Confirm Delivery Address <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                )}

                {/* Step 2: Upload */}
                {step === 'upload' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="space-y-4">
                            <h3 className="text-3xl font-black text-white tracking-tight italic">02 // SOURCE INGESTION</h3>
                            <p className="text-gray-400 leading-relaxed text-sm max-w-md">
                                Upload your high-fidelity pre-master. We recommend 24-bit WAV or AIFF at -6dB head room.
                            </p>
                        </div>

                        <label className={`
              flex flex-col items-center justify-center w-full h-48 rounded-2xl border-2 border-dashed transition-all cursor-pointer
              ${file ? 'bg-blue-500/5 border-blue-500/30' : 'bg-white/5 border-white/10 hover:border-blue-500/30 hover:bg-white/[0.08]'}
            `}>
                            <input type="file" className="hidden" accept="audio/*" onChange={handleFileChange} />
                            {file ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Music className="w-10 h-10 text-blue-400" />
                                    <span className="text-white font-mono text-sm">{file.name}</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2">
                                    <Upload className="w-10 h-10 text-gray-500" />
                                    <span className="text-gray-500 text-sm">Tap to select or drop audio</span>
                                </div>
                            )}
                        </label>

                        <div className="flex gap-4">
                            <button onClick={() => setStep('email')} className="flex-1 py-5 glass hover:bg-white/5 text-white font-bold rounded-2xl transition-all text-sm uppercase">
                                Back
                            </button>
                            <button
                                onClick={handleNext}
                                disabled={!file}
                                className="flex-[2] py-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white font-black rounded-2xl transition-all text-sm uppercase tracking-widest"
                            >
                                Proceed to Mastering
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Confirm */}
                {step === 'confirm' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="space-y-4">
                            <h3 className="text-3xl font-black text-white tracking-tight italic">03 // INITIATE NEURAL CHAIN</h3>
                            <p className="text-gray-400 leading-relaxed text-sm max-w-md">
                                Analysis and DSP agents are ready. Once you click initiate, the neural consensus will begin determining the optimal parameters for your track.
                            </p>
                        </div>

                        <div className="p-6 bg-blue-500/5 border border-blue-500/20 rounded-2xl space-y-4">
                            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest text-blue-400">
                                <span>Ingestion System</span>
                                <span>Active</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">Selected Track</span>
                                <span className="text-white font-bold">{file?.name}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">Notification To</span>
                                <span className="text-white font-bold">{email}</span>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setStep('upload')}
                                className="flex-1 py-5 glass hover:bg-white/5 text-white font-bold rounded-2xl transition-all text-sm uppercase"
                            >
                                Modify
                            </button>
                            <button
                                onClick={initiateMastering}
                                className="flex-[2] relative overflow-hidden py-5 bg-gradient-to-r from-blue-600 to-blue-400 hover:scale-[1.02] active:scale-95 text-white font-black rounded-2xl transition-all text-sm uppercase tracking-widest neon-glow shadow-blue-500/20"
                            >
                                INITIATE NEURAL MASTERING
                            </button>
                        </div>
                    </div>
                )}

                {/* Background Visuals */}
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />
            </div>

            <div className="mt-8 flex items-center justify-center gap-4 text-gray-500">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                    <AlertCircle className="w-3 h-3" />
                    <span className="text-[10px] uppercase tracking-widest">Beatport Top 10 Standard Applied</span>
                </div>
            </div>
        </div>
    );
};
