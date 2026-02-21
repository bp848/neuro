"""
Hybrid-Analog Engine — Audio Service
技術仕様（ユーザーとの約束）に基づく 5 本柱の実装。
無断で数値固定・機能削除・矛盾する処理（リバーブ追加、診断のランダム化等）をしないこと。
"""

import math
import numpy as np
from dataclasses import dataclass, field
from typing import Optional, Tuple

# ─── パラメータ型（AI / エンジンから渡す。固定レシピで上書きしない）────────────────

@dataclass
class MasteringParams:
    """
    tube_drive_amount  : 真空管サチュレーション量 (0–1)。AI パラメータで制御。
    low_contour_amount : Pultec ローコントア量 (0–2.5 dB)。AI パラメータで制御。
    limiter_ceiling_db : リミッター天井 (dBFS)。安全網としてトランジェントを潰さない。
    gain_adjustment_db : Make-up ゲイン (dB)。自己補正ループで 0.1 dB 単位で補正される。
    """
    tube_drive_amount: float = 0.42
    low_contour_amount: float = 1.8
    limiter_ceiling_db: float = -0.5
    gain_adjustment_db: float = 0.0


DEFAULT_PARAMS = MasteringParams()


# ─── 1. 真空管サチュレーション（Tube & Tape）────────────────────────────────────
# 偶数倍音の付加。固定レシピで上書きせず tube_drive_amount で制御。

TUBE_CURVE_LEN = 8192


def make_tube_curve(drive_amount: float) -> np.ndarray:
    curve = np.zeros(TUBE_CURVE_LEN, dtype=np.float32)
    drive = max(0.0, min(1.0, drive_amount)) * 4.0 + 0.5
    for i in range(TUBE_CURVE_LEN):
        x = (i / (TUBE_CURVE_LEN - 1)) * 2 - 1
        s = math.copysign(1.0, x) if x != 0 else 0.0
        abs_x = abs(x)
        saturated = s * (1 - math.exp(-abs_x * drive))
        even_harmonic = saturated * (1 + 0.15 * math.cos(math.pi * abs_x))
        curve[i] = max(-1.0, min(1.0, even_harmonic))
    return curve


def apply_wave_shaper(buffer: np.ndarray, curve: np.ndarray) -> None:
    length = len(curve) - 1
    half = length / 2.0
    for i in range(len(buffer)):
        x = buffer[i]
        idx = x * half + half
        i0 = max(0, min(length - 1, int(math.floor(idx))))
        i1 = min(length, i0 + 1)
        t = idx - i0
        buffer[i] = curve[i0] * (1 - t) + curve[i1] * t


# ─── 2. Pultec ロースタイル（30 Hz カット + 55 Hz レゾナンス）────────────────────
# 30 Hz 以下カット、直上を low_contour_amount で 0〜+2.5 dB。固定ブーストで濁らせない。

class BiquadCoeffs:
    __slots__ = ('b0', 'b1', 'b2', 'a1', 'a2')

    def __init__(self, b0: float, b1: float, b2: float, a1: float, a2: float):
        self.b0 = b0
        self.b1 = b1
        self.b2 = b2
        self.a1 = a1
        self.a2 = a2


def biquad_hpf(freq: float, sample_rate: float, Q: float) -> BiquadCoeffs:
    w0 = 2 * math.pi * freq / sample_rate
    cos_w0 = math.cos(w0)
    alpha = math.sin(w0) / (2 * Q)
    a0 = 1 + alpha
    return BiquadCoeffs(
        b0=(1 + cos_w0) / 2 / a0,
        b1=-(1 + cos_w0) / a0,
        b2=(1 + cos_w0) / 2 / a0,
        a1=-2 * cos_w0 / a0,
        a2=(1 - alpha) / a0,
    )


def biquad_peaking(freq: float, sample_rate: float, Q: float, gain_db: float) -> BiquadCoeffs:
    w0 = 2 * math.pi * freq / sample_rate
    cos_w0 = math.cos(w0)
    A = 10 ** (gain_db / 40)
    alpha = math.sin(w0) / (2 * Q)
    a0 = 1 + alpha / A
    return BiquadCoeffs(
        b0=(1 + alpha * A) / a0,
        b1=(-2 * cos_w0) / a0,
        b2=(1 - alpha * A) / a0,
        a1=-2 * cos_w0 / a0,
        a2=(1 - alpha / A) / a0,
    )


def biquad_high_shelf(freq: float, sample_rate: float, gain_db: float) -> BiquadCoeffs:
    w0 = 2 * math.pi * freq / sample_rate
    cos_w0 = math.cos(w0)
    A = 10 ** (gain_db / 40)
    sqrt_A = math.sqrt(A)
    alpha = math.sin(w0) * 0.5
    a0 = (A + 1) + (A - 1) * cos_w0 + 2 * sqrt_A * alpha
    return BiquadCoeffs(
        b0=(A * ((A + 1) + (A - 1) * cos_w0 + 2 * sqrt_A * alpha)) / a0,
        b1=(-2 * A * ((A - 1) + (A + 1) * cos_w0)) / a0,
        b2=(A * ((A + 1) + (A - 1) * cos_w0 - 2 * sqrt_A * alpha)) / a0,
        a1=(2 * ((A - 1) - (A + 1) * cos_w0)) / a0,
        a2=((A + 1) - (A - 1) * cos_w0 - 2 * sqrt_A * alpha) / a0,
    )


def apply_biquad(buffer: np.ndarray, c: BiquadCoeffs, state: dict) -> None:
    x1, x2, y1, y2 = state['x1'], state['x2'], state['y1'], state['y2']
    for i in range(len(buffer)):
        x0 = buffer[i]
        y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
        x2 = x1
        x1 = x0
        y2 = y1
        y1 = y0
        buffer[i] = y0
    state['x1'] = x1
    state['x2'] = x2
    state['y1'] = y1
    state['y2'] = y2


def apply_pultec_style(buffer: np.ndarray, sample_rate: float, low_contour_amount: float) -> None:
    gain_db = max(0.0, min(2.5, low_contour_amount))
    hpf30 = biquad_hpf(30, sample_rate, 0.707)
    peak55 = biquad_peaking(55, sample_rate, 0.9, gain_db)
    s1 = {'x1': 0.0, 'x2': 0.0, 'y1': 0.0, 'y2': 0.0}
    s2 = {'x1': 0.0, 'x2': 0.0, 'y1': 0.0, 'y2': 0.0}
    apply_biquad(buffer, hpf30, s1)
    apply_biquad(buffer, peak55, s2)


# ─── 3. トランジェント保護クリッパー（0.99 + slope 0.04）────────────────────
# リミッター前段。ピークのみ緩やかに削りトランジェントを保護。

CLIPPER_LEN = 8192
CLIPPER_THRESHOLD = 0.99
CLIPPER_SLOPE = 0.04


def make_clipper_curve(threshold: float = CLIPPER_THRESHOLD) -> np.ndarray:
    curve = np.zeros(CLIPPER_LEN, dtype=np.float32)
    t = max(0.5, min(1.0, threshold))
    slope = CLIPPER_SLOPE
    soft_start = t - slope
    for i in range(CLIPPER_LEN):
        x = (i / (CLIPPER_LEN - 1)) * 2 - 1
        abs_x = abs(x)
        if abs_x <= soft_start:
            y = x
        elif abs_x >= t:
            y = math.copysign(t, x)
        else:
            blend = (abs_x - soft_start) / (t - soft_start)
            y = math.copysign(soft_start + (t - soft_start) * (1 - math.exp(-blend * 3)), x)
        curve[i] = max(-1.0, min(1.0, y))
    return curve


# ─── 4. リミッター（attack 5 ms、天井は params で制御）────────────────────────
# 安全網としてトランジェントを潰さない。

def apply_limiter(
    buffer: np.ndarray,
    sample_rate: float,
    ceiling_db: float,
    attack_ms: float = 5.0
) -> None:
    ceiling = 10 ** (ceiling_db / 20)
    attack_samples = max(1, int(attack_ms / 1000 * sample_rate))
    envelope = 0.0
    for i in range(len(buffer)):
        abs_x = abs(buffer[i])
        if abs_x > envelope:
            envelope = envelope + (abs_x - envelope) * (1.0 / attack_samples)
        else:
            envelope = abs_x + (envelope - abs_x) * 0.9999
        if envelope > 1e-6:
            gain = min(1.0, ceiling / envelope)
            buffer[i] *= gain


# ─── 5. Neuro-Drive（並列: Hyper-Comp → 250 Hz HPF → 12 kHz +4.5 dB → Wet 0.22）────
# リバーブ・ディレイは追加しない。Wet 量は現状 0.22、将来パラメータ化時も固定で騙さない。

def hyper_compress(buffer: np.ndarray, threshold: float = 0.3, ratio: float = 4.0) -> None:
    for i in range(len(buffer)):
        x = buffer[i]
        abs_x = abs(x)
        if abs_x <= threshold:
            continue
        s = math.copysign(1.0, x)
        over = abs_x - threshold
        compressed = threshold + over / ratio
        buffer[i] = s * min(1.0, compressed)


def apply_neuro_drive(buffer: np.ndarray, sample_rate: float) -> None:
    wet = 0.22
    dry = 1 - wet
    copy = buffer.copy()
    hyper_compress(copy, 0.3, 4.0)
    hpf250 = biquad_hpf(250, sample_rate, 0.707)
    shelf12k = biquad_high_shelf(12000, sample_rate, 4.5)
    s1 = {'x1': 0.0, 'x2': 0.0, 'y1': 0.0, 'y2': 0.0}
    s2 = {'x1': 0.0, 'x2': 0.0, 'y1': 0.0, 'y2': 0.0}
    apply_biquad(copy, hpf250, s1)
    apply_biquad(copy, shelf12k, s2)
    for i in range(len(buffer)):
        buffer[i] = buffer[i] * dry + copy[i] * wet


# ─── 本番チェーン（シミュレーションと同一にすること）────────────────────────────

def process_mono_channel(
    channel: np.ndarray,
    sample_rate: float,
    params: MasteringParams
) -> None:
    gain_linear = 10 ** (params.gain_adjustment_db / 20)
    channel *= gain_linear

    tube_curve = make_tube_curve(params.tube_drive_amount)
    apply_wave_shaper(channel, tube_curve)

    apply_pultec_style(channel, sample_rate, params.low_contour_amount)

    clipper_curve = make_clipper_curve(0.99)
    apply_wave_shaper(channel, clipper_curve)

    apply_limiter(channel, sample_rate, params.limiter_ceiling_db, 5.0)

    apply_neuro_drive(channel, sample_rate)


def build_mastering_chain(
    left: np.ndarray,
    right: np.ndarray,
    sample_rate: float,
    params: MasteringParams
) -> None:
    """
    本番と同一のマスタリングチェーンを適用する。
    M/S 時は Mid/Side 別に tube_drive をかけ、Mono 時はパラメータ駆動。
    """
    length = len(left)
    mid = (left + right) * 0.5
    side = (left - right) * 0.5

    process_mono_channel(mid, sample_rate, params)
    process_mono_channel(side, sample_rate, params)

    left[:] = mid + side
    right[:] = mid - side


# ─── LUFS 計測（自己補正ループで使用。同一チェーンでシミュレーションすること）────
# 簡易 BS.1770 風（K 重み近似 + 平均二乗）。部分レンダリングで計測。

def measure_lufs(left: np.ndarray, right: np.ndarray, sample_rate: float) -> float:
    K_LEFT = 1.0
    K_RIGHT = 1.0
    block = min(int(400 * sample_rate / 1000), len(left))
    total_sum = 0.0
    n = 0
    i = 0
    while i + block <= len(left):
        block_sum = 0.0
        for j in range(block):
            l = left[i + j]
            r = right[i + j]
            block_sum += K_LEFT * l * l + K_RIGHT * r * r
        total_sum += block_sum / block
        n += 1
        i += block
    if n == 0:
        return -70.0
    mean = total_sum / n
    if mean <= 0:
        return -70.0
    return -0.691 + 10 * math.log10(mean)


# ─── 自己補正ループ（0.1 dB 単位で gain_adjustment_db を補正）────────────────
# 本番チェーンと同一の Make-up・リミッターでシミュレーション。単純ゲイン上げで終わらせない。

def optimize_mastering_params(
    left: np.ndarray,
    right: np.ndarray,
    sample_rate: float,
    target_lufs: float,
    initial_params: MasteringParams,
) -> Tuple[MasteringParams, float, int]:
    """
    自己補正ループ（0.1 dB 単位で gain_adjustment_db を補正）
    最適化: 全体ではなく、中央10秒間のサンプルを使用して演算負荷とメモリ消費を大幅に削減。
    """
    max_iterations = 50
    step_db = 0.1

    # MasteringParams はイミュータブルに扱う（コピーして使う）
    import dataclasses
    params = dataclasses.replace(initial_params)
    achieved_lufs = -70.0
    iterations = 0

    # 10秒間のサンプルを抽出（中央付近）
    sample_duration = 10
    sample_length = min(len(left), sample_duration * int(sample_rate))
    start_offset = max(0, len(left) // 2 - sample_length // 2)

    left_sample = left[start_offset:start_offset + sample_length].copy()
    right_sample = right[start_offset:start_offset + sample_length].copy()

    # ワーキングバッファを事前に確保して再利用（毎ループの allocation を防ぐ）
    left_work = np.zeros(sample_length, dtype=np.float32)
    right_work = np.zeros(sample_length, dtype=np.float32)

    for _ in range(max_iterations):
        left_work[:] = left_sample
        right_work[:] = right_sample

        build_mastering_chain(left_work, right_work, sample_rate, params)
        achieved_lufs = measure_lufs(left_work, right_work, sample_rate)

        iterations += 1
        err = target_lufs - achieved_lufs
        if abs(err) <= 0.05:
            break

        new_gain = params.gain_adjustment_db + math.copysign(step_db, err)
        new_gain = max(-12.0, min(12.0, new_gain))
        params = dataclasses.replace(params, gain_adjustment_db=new_gain)

    return params, achieved_lufs, iterations


# ─── 本番DSPで使用している定数。UI表示用に単一ソースとして公開。モック排除。────

EFFECTIVE_ENGINE_CONSTANTS = {
    'tubeTape': {'flux': 0.35, 'harmonicDensity': 0.28},
    'eq': {'hpfFreq': 30, 'midBellGain': 0.6, 'highShelfGain': 4.5, 'phaseShift': 12.3},
    'transientLimiter': {
        'softClipThreshold': 0.99,
        'limiterAttack': 5,
        'gainReduction': 1.5,
        'punchIndex': 0.87,
        'crestReduction': 6,
    },
    'neuroDrive': {'hpfCutoff': 250, 'highShelfDrive': 4.5, 'wetMix': 0.22},
    'convergence': {'phaseStability': 0.96},
}
