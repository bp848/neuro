
import React, { useState } from 'react';
import { Zap, Cpu, Layers, Shield, Radio, TrendingUp, Check, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Pricing Plans — Beatport Edition ─────────────────────────────────────

const plans = [
    {
        id: 'starter',
        name: 'Starter',
        price: 'Free',
        sub: 'No credit card required',
        border: 'border-[#262626]',
        badge: null,
        scanItems: 25,
        iterations: 1,
        features: [
            '1 track / day',
            'Beatport target — –8.0 LUFS / –1.0 dBTP',
            '25-item scan (Groups A1–A25)',
            'Single-pass mastering',
            'MP3 output (320 kbps)',
            'Email delivery',
        ],
        cta: 'Get Started',
        ctaStyle: 'btn-secondary',
    },
    {
        id: 'creator',
        name: 'Creator',
        price: '$9',
        sub: '/ track',
        border: 'border-[#3b3b6e]',
        badge: 'Most Popular',
        scanItems: 55,
        iterations: 50,
        features: [
            '10 tracks / month',
            'Beatport target — –8.0 LUFS / –1.0 dBTP',
            '55-item full scan',
            '50-iteration convergence loop',
            'WAV output (24-bit / 48 kHz)',
            'Art Council scoring',
            'MQI composite score',
            'Email delivery',
        ],
        cta: 'Start Free Trial',
        ctaStyle: 'btn-primary',
    },
    {
        id: 'pro',
        name: 'Creator Pro',
        price: '$79',
        sub: '/ month',
        border: 'border-[#2e2e2e]',
        badge: 'Best Value',
        scanItems: 55,
        iterations: 999,
        features: [
            'Unlimited tracks',
            'Beatport target — –8.0 LUFS / –1.0 dBTP',
            '55-item full scan',
            '999-iteration deep convergence',
            'Dynamic Adaptive Mastering',
            'Section-by-section processing',
            'WAV output (24-bit / 96 kHz)',
            'Art Council + full analytics',
            'Priority processing queue',
            'API access',
        ],
        cta: 'Go Pro',
        ctaStyle: 'btn-primary',
    },
];

// ─── Processing Pillars ────────────────────────────────────────────────────

const pillars = [
    {
        icon: Zap,
        title: 'Tube & Tape Saturation',
        desc: 'Even-order harmonics via waveshaper modeled on vintage tube amps. Drive controlled entirely by AI — never hardcoded.',
        specs: ['Drive: 0–1 mapped to 0.5–4.5', '8,192-sample interpolation curve', 'Exponential transfer function'],
    },
    {
        icon: Cpu,
        title: 'Pultec-Style Low Contour',
        desc: 'Simultaneously cuts below 30 Hz and resonantly boosts at 55 Hz — the classic Pultec EQP-1A trick for punchy low end.',
        specs: ['HPF at 30 Hz (Q = 0.707)', 'Peaking boost at 55 Hz (Q = 0.9)', '0 – 2.5 dB range, AI-controlled'],
    },
    {
        icon: Shield,
        title: 'Transient-Protective Clipper',
        desc: 'Soft clip before the limiter to round peaks without destroying transient energy. Kick punch and snap stay intact.',
        specs: ['Clip threshold: 0.99', 'Soft knee slope: 0.04', 'Exponential blend curve'],
    },
    {
        icon: Layers,
        title: 'True Peak Limiter',
        desc: '4× oversampled limiting for accurate True Peak detection. Protects transients — the ceiling is a safety net, not a compressor.',
        specs: ['Attack: 5 ms', 'Ceiling: –1.0 dBTP (Beatport spec)', '4× oversampled True Peak detection'],
    },
    {
        icon: Radio,
        title: 'Neuro-Drive (Parallel)',
        desc: 'Parallel saturation & HF air enhancement for club-system presence. No reverb, no delay, no coloration.',
        specs: ['Wet mix: 0.22 (fixed)', '250 Hz HPF → +4.5 dB shelf at 12 kHz', 'Hyper-Comp: threshold 0.3, ratio 4:1'],
    },
    {
        icon: TrendingUp,
        title: 'Self-Correcting Convergence',
        desc: 'Iterative LUFS loop that hits –8.0 LUFS within ±0.05 LU — the Beatport Top 10 integrated loudness standard.',
        specs: ['Central 10s sample for efficiency', 'Max iterations: plan-dependent (1–999)', 'Step size: 0.1 dB'],
    },
];

// ─── Art Council ───────────────────────────────────────────────────────────

const council = [
    { role: 'Composer', focus: 'Musical intent', metrics: 'Story, Contrast, Melody, Groove, Character', threshold: '≥ 90' },
    { role: 'Audience', focus: 'Club listening experience', metrics: 'Loudness, Energy, Air, Low Impact, Fatigue', threshold: '≥ 92' },
    { role: 'Engineer', focus: 'Technical integrity', metrics: 'Safety, Crest, Phase, Distortion, Compliance', threshold: '≥ 95' },
];

// ─── MQI ──────────────────────────────────────────────────────────────────

const mqi = [
    { dim: 'Dynamics', weight: 25 },
    { dim: 'Distortion Safety', weight: 20 },
    { dim: 'Frequency Balance', weight: 20 },
    { dim: 'Loudness Optimization', weight: 20 },
    { dim: 'Spatial Stability', weight: 15 },
];

// ─── Scan groups ──────────────────────────────────────────────────────────

const scanGroups = [
    { group: 'A — Audio Analysis', items: 'Loudness, Dynamics, Low End, Frequency, Spatial, Noise/Distortion', count: 33 },
    { group: 'B — Engine Parameters', items: 'Tube/Tape, EQ, Transient, Limiter, Neuro-Drive, Convergence', count: 20 },
    { group: 'C — Art Council', items: 'Composer (5) + Audience (5) + Engineer (5)', count: 15 },
];

// ─── Collapsible section ───────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(true);
    return (
        <div className="surface-1 rounded-lg overflow-hidden">
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/2 transition-colors"
            >
                <span className="label">{title}</span>
                {open
                    ? <ChevronUp className="w-3.5 h-3.5 text-[#444]" strokeWidth={1.5} />
                    : <ChevronDown className="w-3.5 h-3.5 text-[#444]" strokeWidth={1.5} />}
            </button>
            {open && <div className="px-5 pb-5 pt-1">{children}</div>}
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export const AlgorithmPage: React.FC = () => {
    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">

                {/* Target spec banner */}
                <div className="surface-2 rounded-lg px-5 py-4 flex items-center justify-between">
                    <div>
                        <p className="label mb-1">Target Specification</p>
                        <p className="text-lg font-semibold text-white">Beatport Top 10</p>
                    </div>
                    <div className="flex items-center gap-8">
                        <div className="text-right">
                            <p className="label mb-0.5">Integrated Loudness</p>
                            <p className="text-2xl font-bold text-white font-mono">–8.0 LUFS</p>
                        </div>
                        <div className="divider-v h-10" />
                        <div className="text-right">
                            <p className="label mb-0.5">True Peak</p>
                            <p className="text-2xl font-bold text-white font-mono">–1.0 dBTP</p>
                        </div>
                        <div className="divider-v h-10" />
                        <div className="text-right">
                            <p className="label mb-0.5">Convergence</p>
                            <p className="text-2xl font-bold text-white font-mono">±0.05 LU</p>
                        </div>
                    </div>
                </div>

                {/* ── Pricing ── */}
                <div>
                    <p className="label mb-4">Pricing</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {plans.map(plan => (
                            <div key={plan.id}
                                className={`surface-1 rounded-lg p-5 flex flex-col gap-4 border ${plan.border} relative`}>
                                {plan.badge && (
                                    <div className="absolute -top-3 left-5">
                                        <span className="tag tag-blue">{plan.badge}</span>
                                    </div>
                                )}
                                <div>
                                    <p className="label mb-1">{plan.name}</p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-3xl font-bold text-white">{plan.price}</span>
                                        {plan.price !== 'Free' && <span className="text-[#555] text-sm">{plan.sub}</span>}
                                    </div>
                                </div>

                                <div className="space-y-1.5 flex-1">
                                    {plan.features.map(f => (
                                        <div key={f} className="flex items-start gap-2">
                                            <Check className="w-3 h-3 text-[#555] mt-0.5 flex-none" strokeWidth={2} />
                                            <span className="text-xs text-[#aaa]">{f}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="divider" />
                                <div className="mono text-[#444]">
                                    {plan.scanItems} scan items · {plan.iterations} iterations
                                </div>

                                <button className={`w-full py-2 rounded-md text-sm font-medium transition-all ${plan.ctaStyle}`}>
                                    {plan.cta}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Engine ── */}
                <div>
                    <p className="label mb-4">Processing Chain</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {pillars.map((p, i) => {
                            const Icon = p.icon;
                            return (
                                <div key={p.title} className="surface-1 rounded-lg p-4 flex gap-3">
                                    <div className="w-7 h-7 flex items-center justify-center flex-none surface-2 rounded-md">
                                        <Icon className="w-3.5 h-3.5 text-[#888]" strokeWidth={1.5} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="mono text-[#444]">{String(i + 1).padStart(2, '0')}</span>
                                            <h3 className="text-sm font-medium text-white">{p.title}</h3>
                                        </div>
                                        <p className="text-xs text-[#666] leading-relaxed mb-2">{p.desc}</p>
                                        <div className="space-y-0.5">
                                            {p.specs.map(s => (
                                                <p key={s} className="mono text-[#444]">{s}</p>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Collapsible sections ── */}
                <div className="space-y-3">

                    <Section title="Three-Perspective Art Council">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-[#1f1f1f]">
                                    {['Perspective', 'Focus', 'Key Metrics', 'Pass Threshold'].map(h => (
                                        <th key={h} className="text-left pb-2 label">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {council.map(c => (
                                    <tr key={c.role} className="border-b border-[#1a1a1a]">
                                        <td className="py-3 font-medium text-white">{c.role}</td>
                                        <td className="py-3 text-[#888]">{c.focus}</td>
                                        <td className="py-3 mono text-[#555]">{c.metrics}</td>
                                        <td className="py-3 mono text-[#aaa]">{c.threshold}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Section>

                    <Section title="Master Quality Index (MQI)">
                        <div className="space-y-3 pt-1">
                            {mqi.map(m => (
                                <div key={m.dim} className="flex items-center gap-4">
                                    <span className="text-xs text-[#888] w-44 flex-none">{m.dim}</span>
                                    <div className="progress-track flex-1">
                                        <div className="progress-fill" style={{ width: `${m.weight * 4}%`, background: '#555' }} />
                                    </div>
                                    <span className="mono text-[#555] w-8 text-right">{m.weight}%</span>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section title="55-Item Full Scan">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                            {scanGroups.map(g => (
                                <div key={g.group} className="surface-2 rounded-md p-4">
                                    <p className="text-xs font-medium text-white mb-1">{g.group}</p>
                                    <p className="mono text-[#555] mb-3 leading-relaxed">{g.items}</p>
                                    <p className="text-2xl font-bold text-white">{g.count}</p>
                                    <p className="mono text-[#444]">scan items</p>
                                </div>
                            ))}
                        </div>
                        <p className="mono text-[#333] mt-3">Starter plan covers items 1–25 only.</p>
                    </Section>

                </div>
            </div>
        </div>
    );
};
