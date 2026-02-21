/**
 * Hybrid-Analog Engine — Audio Service
 * Implementing the 5 pillars of the mastering chain.
 */

export interface MasteringParams {
    tube_drive_amount: number;
    low_contour_amount: number;
    limiter_ceiling_db: number;
    gain_adjustment_db?: number;
}

export const DEFAULT_PARAMS: MasteringParams = {
    tube_drive_amount: 0.42,
    low_contour_amount: 1.8,
    limiter_ceiling_db: -0.5,
    gain_adjustment_db: 0,
};

const TUBE_CURVE_LEN = 8192;

export function makeTubeCurve(driveAmount: number): Float32Array {
    const curve = new Float32Array(TUBE_CURVE_LEN);
    const drive = Math.max(0, Math.min(1, driveAmount)) * 4 + 0.5;
    for (let i = 0; i < TUBE_CURVE_LEN; i++) {
        const x = (i / (TUBE_CURVE_LEN - 1)) * 2 - 1;
        const s = Math.sign(x);
        const abs = Math.abs(x);
        const saturated = s * (1 - Math.exp(-abs * drive));
        const evenHarmonic = saturated * (1 + 0.15 * Math.cos(Math.PI * abs));
        curve[i] = Math.max(-1, Math.min(1, evenHarmonic));
    }
    return curve;
}

export function applyWaveShaper(buffer: Float32Array, curve: Float32Array): void {
    const len = curve.length - 1;
    const half = len / 2;
    for (let i = 0; i < buffer.length; i++) {
        const x = buffer[i];
        const idx = x * half + half;
        const i0 = Math.max(0, Math.min(len - 1, Math.floor(idx)));
        const i1 = Math.min(len, i0 + 1);
        const t = idx - i0;
        buffer[i] = curve[i0] * (1 - t) + curve[i1] * t;
    }
}

interface BiquadCoeffs {
    b0: number;
    b1: number;
    b2: number;
    a1: number;
    a2: number;
}

export function biquadHPF(freq: number, sampleRate: number, Q: number): BiquadCoeffs {
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha;
    return {
        b0: (1 + cos) / 2 / a0,
        b1: -(1 + cos) / a0,
        b2: (1 + cos) / 2 / a0,
        a1: -2 * cos / a0,
        a2: (1 - alpha) / a0,
    };
}

export function biquadPeaking(freq: number, sampleRate: number, Q: number, gainDB: number): BiquadCoeffs {
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cos = Math.cos(w0);
    const A = 10 ** (gainDB / 40);
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha / A;
    return {
        b0: (1 + alpha * A) / a0,
        b1: (-2 * cos) / a0,
        b2: (1 - alpha * A) / a0,
        a1: -2 * cos / a0,
        a2: (1 - alpha / A) / a0,
    };
}

export function biquadHighShelf(freq: number, sampleRate: number, gainDB: number): BiquadCoeffs {
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cos = Math.cos(w0);
    const A = 10 ** (gainDB / 40);
    const sqrtA = Math.sqrt(A);
    const alpha = Math.sin(w0) * 0.5;
    const a0 = (A + 1) + (A - 1) * cos + 2 * sqrtA * alpha;
    return {
        b0: (A * ((A + 1) + (A - 1) * cos + 2 * sqrtA * alpha)) / a0,
        b1: (-2 * A * ((A - 1) + (A + 1) * cos)) / a0,
        b2: (A * ((A + 1) + (A - 1) * cos - 2 * sqrtA * alpha)) / a0,
        a1: (2 * ((A - 1) - (A + 1) * cos)) / a0,
        a2: ((A + 1) - (A - 1) * cos - 2 * sqrtA * alpha) / a0,
    };
}

export function applyBiquad(
    buffer: Float32Array,
    c: BiquadCoeffs,
    state: { x1: number; x2: number; y1: number; y2: number }
): void {
    for (let i = 0; i < buffer.length; i++) {
        const x0 = buffer[i];
        const y0 =
            c.b0 * x0 +
            c.b1 * state.x1 +
            c.b2 * state.x2 -
            c.a1 * state.y1 -
            c.a2 * state.y2;
        state.x2 = state.x1;
        state.x1 = x0;
        state.y2 = state.y1;
        state.y1 = y0;
        buffer[i] = y0;
    }
}

export function applyPultecStyle(
    buffer: Float32Array,
    sampleRate: number,
    lowContourAmount: number
): void {
    const gainDB = Math.max(0, Math.min(2.5, lowContourAmount));
    const hpf30 = biquadHPF(30, sampleRate, 0.707);
    const peak55 = biquadPeaking(55, sampleRate, 0.9, gainDB);
    const s1 = { x1: 0, x2: 0, y1: 0, y2: 0 };
    const s2 = { x1: 0, x2: 0, y1: 0, y2: 0 };
    applyBiquad(buffer, hpf30, s1);
    applyBiquad(buffer, peak55, s2);
}

const CLIPPER_THRESHOLD = 0.99;
const CLIPPER_SLOPE = 0.04;
const CLIPPER_LEN = 8192;

export function makeClipperCurve(threshold: number = CLIPPER_THRESHOLD): Float32Array {
    const curve = new Float32Array(CLIPPER_LEN);
    const t = Math.max(0.5, Math.min(1, threshold));
    const slope = CLIPPER_SLOPE;
    const softStart = t - slope;
    for (let i = 0; i < CLIPPER_LEN; i++) {
        const x = (i / (CLIPPER_LEN - 1)) * 2 - 1;
        const abs = Math.abs(x);
        let y: number;
        if (abs <= softStart) {
            y = x;
        } else if (abs >= t) {
            y = Math.sign(x) * t;
        } else {
            const blend = (abs - softStart) / (t - softStart);
            y = Math.sign(x) * (softStart + (t - softStart) * (1 - Math.exp(-blend * 3)));
        }
        curve[i] = Math.max(-1, Math.min(1, y));
    }
    return curve;
}

export function applyLimiter(
    buffer: Float32Array,
    sampleRate: number,
    ceilingDB: number,
    attackMs: number = 5
): void {
    const ceiling = 10 ** (ceilingDB / 20);
    const attackSamples = Math.max(1, (attackMs / 1000) * sampleRate);
    let envelope = 0;
    for (let i = 0; i < buffer.length; i++) {
        const abs = Math.abs(buffer[i]);
        if (abs > envelope) {
            envelope = envelope + (abs - envelope) * (1 / attackSamples);
        } else {
            envelope = abs + (envelope - abs) * 0.9999;
        }
        if (envelope > 1e-6) {
            const gain = Math.min(1, ceiling / envelope);
            buffer[i] *= gain;
        }
    }
}

export function hyperCompress(buffer: Float32Array, threshold: number = 0.3, ratio: number = 4): void {
    for (let i = 0; i < buffer.length; i++) {
        const x = buffer[i];
        const abs = Math.abs(x);
        if (abs <= threshold) {
            continue;
        }
        const s = Math.sign(x);
        const over = abs - threshold;
        const compressed = threshold + over / ratio;
        buffer[i] = s * Math.min(1, compressed);
    }
}

export function applyNeuroDrive(buffer: Float32Array, sampleRate: number): void {
    const wet = 0.22;
    const dry = 1 - wet;
    const copy = new Float32Array(buffer.length);
    copy.set(buffer);
    hyperCompress(copy, 0.3, 4);
    const hpf250 = biquadHPF(250, sampleRate, 0.707);
    const shelf12k = biquadHighShelf(12000, sampleRate, 4.5);
    const s1 = { x1: 0, x2: 0, y1: 0, y2: 0 };
    const s2 = { x1: 0, x2: 0, y1: 0, y2: 0 };
    applyBiquad(copy, hpf250, s1);
    applyBiquad(copy, shelf12k, s2);
    for (let i = 0; i < buffer.length; i++) {
        buffer[i] = buffer[i] * dry + copy[i] * wet;
    }
}

export function processMonoChannel(
    channel: Float32Array,
    sampleRate: number,
    params: MasteringParams
): void {
    const p = { ...DEFAULT_PARAMS, ...params };
    const gainLinear = 10 ** ((p.gain_adjustment_db ?? 0) / 20);
    for (let i = 0; i < channel.length; i++) channel[i] *= gainLinear;

    const tubeCurve = makeTubeCurve(p.tube_drive_amount);
    applyWaveShaper(channel, tubeCurve);

    applyPultecStyle(channel, sampleRate, p.low_contour_amount);

    const clipperCurve = makeClipperCurve(0.99);
    applyWaveShaper(channel, clipperCurve);

    applyLimiter(channel, sampleRate, p.limiter_ceiling_db, 5);

    applyNeuroDrive(channel, sampleRate);
}

export function buildMasteringChain(
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
    params: MasteringParams
): void {
    const mid = new Float32Array(left.length);
    const side = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
        mid[i] = (left[i] + right[i]) * 0.5;
        side[i] = (left[i] - right[i]) * 0.5;
    }
    processMonoChannel(mid, sampleRate, params);
    processMonoChannel(side, sampleRate, params);
    for (let i = 0; i < left.length; i++) {
        left[i] = mid[i] + side[i];
        right[i] = mid[i] - side[i];
    }
}

export function measureLUFS(
    left: Float32Array,
    right: Float32Array,
    sampleRate: number
): number {
    const K_LEFT = 1;
    const K_RIGHT = 1;
    let sum = 0;
    const block = Math.min(400 * (sampleRate / 1000) | 0, left.length);
    let n = 0;
    for (let i = 0; i + block <= left.length; i += block) {
        let blockSum = 0;
        for (let j = 0; j < block; j++) {
            const l = left[i + j];
            const r = right[i + j];
            blockSum += K_LEFT * l * l + K_RIGHT * r * r;
        }
        sum += blockSum / block;
        n++;
    }
    if (n === 0) return -70;
    const mean = sum / n;
    if (mean <= 0) return -70;
    return -0.691 + 10 * Math.log10(mean);
}

export function optimizeMasteringParams(
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
    targetLUFS: number,
    initialParams: MasteringParams
): { params: MasteringParams; achievedLUFS: number; iterations: number } {
    const maxIterations = 50;
    const stepDB = 0.1;
    let params: MasteringParams = { ...DEFAULT_PARAMS, ...initialParams };
    let achievedLUFS = -70;
    let iterations = 0;

    const sampleDuration = 10;
    const sampleLength = Math.min(left.length, sampleDuration * sampleRate);
    const startOffset = Math.floor(Math.max(0, left.length / 2 - sampleLength / 2));

    const leftSample = left.slice(startOffset, startOffset + sampleLength);
    const rightSample = right.slice(startOffset, startOffset + sampleLength);

    const leftWork = new Float32Array(sampleLength);
    const rightWork = new Float32Array(sampleLength);

    for (let i = 0; i < maxIterations; i++) {
        leftWork.set(leftSample);
        rightWork.set(rightSample);

        buildMasteringChain(leftWork, rightWork, sampleRate, params);
        achievedLUFS = measureLUFS(leftWork, rightWork, sampleRate);

        iterations++;
        const err = targetLUFS - achievedLUFS;
        if (Math.abs(err) <= 0.05) break;

        const adj = (params.gain_adjustment_db ?? 0) + Math.sign(err) * stepDB;
        params = { ...params, gain_adjustment_db: Math.max(-12, Math.min(12, adj)) };
    }

    return { params, achievedLUFS, iterations };
}
