# NEURO-MASTER — Refined Logic Specification v2.0

**解析 → マスタリング → 合議**
World-Class DSP Architecture + Best Practices

---

## 0. Executive Summary

NEURO-MASTER は AI 駆動のオーディオマスタリングサービスである。
3つのフェーズ — **解析**（AI スペクトル分析）、**マスタリング**（DSP 処理）、**合議**（マルチエージェント合意 + ユーザー確認）
— を通じて、Beatport Top 10 水準の楽曲を出力する。

本仕様書は 2 つの設計文書（World-Class DSP Architecture v1.0 / Best Practices Specification）を
現行コードベースの実態と照合し、**実装可能な単一の真実**として統合したものである。

---

## 1. 設計原則 — 7つの鉄則

| # | 原則 | 現状 | 対応方針 |
|---|------|------|----------|
| 1 | **DSP チェーンは決定論的** — 同一入力+同一パラメータ→同一出力 | OK（NumPy 演算は決定論的） | ディザリング追加時に seed を固定するオプションを設ける |
| 2 | **測定と処理を分離** — 処理前後で同一測定コードを実行 | 部分的（`measure_lufs` はあるが K 重み・ゲーティング未実装） | BS.1770-4 準拠の独立測定モジュールを作成 |
| 3 | **失敗は隠さない** — エラー・フォールバックを明示 | 部分的（DB にエラー記録するがフォールバック開示弱い） | `usedFallback` フラグを DB スキーマに追加 |
| 4 | **アナログ・モデリングはコードで裏付ける** — ラベルだけで音質を暗示しない | OK（`audio_logic.py` に全実装あり） | 14 段チェーン移行時も全段にコードを伴う |
| 5 | **M/S 処理はデフォルト有効** | OK（`build_mastering_chain` で M/S 分離済み） | 周波数依存ステレオ幅を追加 |
| 6 | **全パラメータをログに残す** | 部分的（`final_params` は保存。反復回数・処理時間は未記録） | `optimization_log` JSONB カラムを追加 |
| 7 | **処理結果を客観的に検証可能** | OK（A/B プレーヤー、メトリクス表示、LUFS 表示あり） | スペクトログラム比較を将来追加 |

---

## 2. システムアーキテクチャ

```
┌──────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + Vite)                  │
│  MasteringFlow → FileUploader → AnalysisView                 │
│  AgentConsensus → AudioComparisonPlayer                      │
│  Supabase Realtime で DB 変更を購読                           │
└──────────┬──────────────────────────────────────┬────────────┘
           │                                      │
    POST /get-upload-url                   POST /process-mastering
           │                                      │
           ▼                                      ▼
┌──────────────────┐               ┌──────────────────────────┐
│ Edge Function    │               │ Edge Function            │
│ get-upload-url   │               │ process-mastering        │
│ ・Job 作成       │               │ ・署名付 URL 生成        │
│ ・Storage URL 発行│              │ ・Cloud Run に委譲       │
└──────────────────┘               └────────────┬─────────────┘
                                                │
                                     POST /master (fire-and-forget)
                                                │
                                                ▼
                              ┌──────────────────────────────────┐
                              │  Cloud Run — DSP Engine (Python) │
                              │  ① WAV ダウンロード               │
                              │  ② LUFS 最適化ループ              │
                              │  ③ マスタリングチェーン適用       │
                              │  ④ Storage アップロード           │
                              │  ⑤ DB 更新 (status=completed)    │
                              └──────────────────────────────────┘
                                                │
                              ┌─────────────────┴────────────────┐
                              │                                  │
                              ▼                                  ▼
                    ┌──────────────┐                  ┌────────────────┐
                    │ Supabase DB  │                  │ Cloud Run      │
                    │ mastering_   │                  │ audio-analysis │
                    │ jobs テーブル │                  │ -trigger       │
                    │ + Realtime   │                  │ (Gemini 1.5)   │
                    └──────────────┘                  └────────────────┘
```

### 2.1 データフロー概要

```
User → [1.Upload] → Supabase Storage (originals/)
     → [2.解析]   → Gemini 1.5-Pro (3-Agent Consensus)
     → [3.処理]   → DSP Engine (14段チェーン)
     → [4.完了]   → Supabase Storage (mastered/) + DB + Email
     → [5.合議]   → Frontend (A/B Player + Metrics + Consensus Board)
```

---

## 3. データベーススキーマ — mastering_jobs

```sql
CREATE TABLE mastering_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email        TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  original_file_path TEXT NOT NULL,

  -- ジョブ状態
  status            TEXT NOT NULL DEFAULT 'idle'
                    CHECK (status IN ('idle','uploading','analyzing',
                                      'consensus','processing','completed','failed')),

  -- AI 解析結果
  metrics           JSONB,              -- AnalysisMetric[]
  consensus_opinions JSONB,             -- AgentOpinion[]
  final_params      JSONB,              -- MasteringParams (AI 生成 + 自己補正後)

  -- 処理パラメータ
  target_lufs       FLOAT DEFAULT -14.0,
  mastering_params  JSONB,              -- ユーザー指定の上書きパラメータ (optional)

  -- 処理結果
  output_path       TEXT,
  output_url        TEXT,               -- 署名付き URL (7日有効)
  lufs_achieved     FLOAT,

  -- 最適化ログ (NEW)
  optimization_log  JSONB,              -- { iterations, segments_used, convergence_error,
                                        --   processing_time_ms, dsp_version }

  -- タイムスタンプ
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- RLS: ユーザーは自分のジョブのみ参照可能
ALTER TABLE mastering_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own jobs"
  ON mastering_jobs FOR SELECT
  USING (user_email = current_setting('request.jwt.claims')::json->>'email');
```

---

## 4. フェーズ I — 解析（Analysis）

### 4.1 3エージェント合議フロー

```
                    Audio File (GCS)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      ┌─────────┐  ┌─────────┐  ┌─────────────┐
      │Audience │  │  A&R    │  │  Engineer   │
      │ Agent   │  │  Agent  │  │  Agent      │
      │         │  │         │  │ (最終決定)   │
      │ 逐次実行 │←─┤ 前Agent │←─┤ 全Agent    │
      │ 1st     │  │ 参照 2nd│  │ 参照 3rd   │
      └────┬────┘  └────┬────┘  └─────┬───────┘
           │             │             │
           ▼             ▼             ▼
      comment +     comment +     metrics[] +
      suggestedParams suggestedParams finalParams +
                                   engineerComment
```

**重要な設計判断:**
- エージェントは**逐次実行**（並列ではない）。各エージェントは前のエージェントの意見を参照する
- Engineer が最終パラメータを決定する権限を持つ
- 全エージェントの意見は `consensus_opinions` として DB に保存される

### 4.2 AI パラメータ生成 — 2階層設計

```python
# Tier 1: AI が「意図」を生成（現行 4 パラメータ）
ai_generated = {
    "tube_drive_amount": 0.42,      # 0-1
    "low_contour_amount": 1.8,      # 0-2.5 dB
    "limiter_ceiling_db": -0.5,     # -1.0 to -0.1
    "target_lufs": -8.0,            # -9.0 to -7.0
}

# Tier 2 (将来拡張): AI が拡張パラメータを生成
ai_extended = {
    **ai_generated,
    # ── 新規パラメータ（Phase 2 以降） ──
    "transformer_saturation": 0.3,  # 0-1
    "triode_bias": -1.2,            # -2.0 to 0.0
    "tape_saturation": 0.3,         # 0-1
    "dyn_eq_bands": [...],          # DynEqBand[]
    "stereo_low_mono": 0.8,         # 0-1
    "parallel_wet": 0.18,           # 0-0.5
}

# Tier 3: 自己補正ループが gain_adjustment_db を自動決定
# → AI の出力誤差を DSP レイヤーで吸収
```

### 4.3 スキーマ検証（必須）

```python
PARAM_SCHEMA = {
    "tube_drive_amount":  {"min": 0.0,  "max": 1.0,  "default": 0.42},
    "low_contour_amount": {"min": 0.0,  "max": 2.5,  "default": 1.8},
    "limiter_ceiling_db": {"min": -1.0, "max": -0.1, "default": -0.5},
    "target_lufs":        {"min": -9.0, "max": -7.0, "default": -8.0},
}

def validate_and_clamp(params: dict) -> dict:
    """AI が範囲外の値を返した場合にクランプする"""
    for key, schema in PARAM_SCHEMA.items():
        if key in params:
            params[key] = max(schema["min"], min(schema["max"], params[key]))
        else:
            params[key] = schema["default"]
    return params
```

---

## 5. フェーズ II — マスタリング（DSP Engine）

### 5.1 チェーン構成 — 現行 5 段 → 目標 14 段

```
現行チェーン (audio_logic.py):
  ① Gain → ② Tube Waveshaper → ③ Pultec EQ → ④ Soft Clipper → ⑤ Limiter → ⑥ Neuro-Drive

目標チェーン (14段):
  ① DC Remove → ② M/S Split → ③ Gain Stage →
  ④ Transformer Sat → ⑤ Triode Tube → ⑥ Tape Emulation →
  ⑦ Dynamic EQ → ⑧ 4-Band Comp → ⑨ Parametric EQ →
  ⑩ Freq-Dep Width → ⑪ Soft Clipper → ⑫ TP Limiter v2 →
  ⑬ Parallel Drive → ⑭ Dither + M/S Merge
```

### 5.2 現行実装の詳細（audio_logic.py — 373 行）

#### process_mono_channel() — 現在の 6 段チェーン

```python
def process_mono_channel(channel, sample_rate, params):
    # 1. Gain (自己補正ループが決定)
    channel *= 10 ** (params.gain_adjustment_db / 20)

    # 2. Tube Waveshaper (8192点 LUT, 偶数倍音)
    #    問題: 8x OS なし → エイリアシング発生
    tube_curve = make_tube_curve(params.tube_drive_amount)
    apply_wave_shaper(channel, tube_curve)

    # 3. Pultec Style (HPF 30Hz + Peaking 55Hz)
    apply_pultec_style(channel, sample_rate, params.low_contour_amount)

    # 4. Soft Clipper (threshold=0.99, slope=0.04)
    clipper_curve = make_clipper_curve(0.99)
    apply_wave_shaper(channel, clipper_curve)

    # 5. Limiter (attack=5ms, envelope follower)
    #    問題: Lookahead なし, OS なし → ISP 未対策
    apply_limiter(channel, sample_rate, params.limiter_ceiling_db, 5.0)

    # 6. Neuro-Drive (parallel: hyper_compress → HPF 250 → shelf 12kHz +4.5dB → wet 0.22)
    apply_neuro_drive(channel, sample_rate)
```

#### build_mastering_chain() — M/S 処理

```python
def build_mastering_chain(left, right, sample_rate, params):
    mid  = (left + right) * 0.5
    side = (left - right) * 0.5
    process_mono_channel(mid, sample_rate, params)   # Mid/Side を独立処理
    process_mono_channel(side, sample_rate, params)
    left[:]  = mid + side                            # L/R に再合成
    right[:] = mid - side
```

### 5.3 現行 vs World-Class — Gap 分析

| 領域 | 現行実装 | 目標 | Gap | Phase |
|------|---------|------|-----|-------|
| **サチュレーション** | `1-exp(-\|x\|*d)` 単一 waveshaper | 3段（Transformer + Triode + Tape） | 致命的 | P2 |
| **オーバーサンプリング** | なし | 全非線形処理に 8x OS | 致命的 | P1 |
| **コンプレッサー** | なし（Neuro-Drive の固定 hyper_compress のみ） | 4バンド・プログラム依存 + Dynamic EQ | 致命的 | P3 |
| **リミッター** | エンベロープ追従のみ | 8x OS + Lookahead + プログラム依存リリース | 致命的 | P2 |
| **ステレオ処理** | M/S 分離のみ（同一パラメータ） | 周波数依存幅 + Mono 互換チェック | 重大 | P3 |
| **DC 除去** | なし | 5Hz 1次 IIR HPF | 重大 | P1 |
| **ディザリング** | なし | TPDF + F-weighted ノイズシェーピング | 重大 | P1 |
| **LUFS 測定** | 簡易（K重みなし、ゲーティングなし） | BS.1770-4 完全準拠 | 重大 | P1 |
| **性能** | Pure Python for ループ | NumPy ベクトル化 → Numba JIT | 重大 | P1 |

### 5.4 目標 14 段チェーン — 各段の仕様

#### [NEW] ① DC オフセット除去

```python
def remove_dc(buf: np.ndarray, sr: int) -> np.ndarray:
    """5Hz 1次 IIR HPF で DC 成分を除去"""
    fc = 5.0
    w = 2.0 * np.pi * fc / sr
    alpha = 1.0 / (1.0 + w)
    out = np.empty_like(buf)
    out[0] = buf[0]
    for i in range(1, len(buf)):
        out[i] = alpha * (out[i-1] + buf[i] - buf[i-1])
    return out
```
**理由:** DC オフセット → リミッター片側反応 → ヘッドルーム浪費。全プロスタジオが最初に行う処理。

#### [KEEP] ② M/S Split

```python
mid  = (left + right) * 0.5
side = (left - right) * 0.5
```
**現行実装を維持。** 以降の全処理を Mid/Side 独立で行う。

#### [KEEP] ③ Gain Stage

```python
channel *= 10 ** (params.gain_adjustment_db / 20)
```
**現行実装を維持。** 自己補正ループが ±12dB 範囲で 0.1dB 単位調整。

#### [NEW] ④ Transformer 磁気飽和

```python
@dataclass
class TransformerParams:
    saturation: float = 0.3     # 0-1 (0.3 = Neve 1073 相当)
    inductance: float = 0.8     # 低域インダクタンス特性
    core_loss:  float = 0.02    # 鉄損による高域減衰

def apply_transformer(buf, sr, p):
    """Jiles-Atherton 簡略モデル。8x OS 内で処理。奇数倍音生成。"""
    up = resample_poly(buf, 8, 1)
    drive = p.saturation * 5.0 + 0.5
    H = up * drive
    B = np.tanh(H / 3.0)                    # Langevin 近似 → 奇数倍音
    # ヒステリシス: 磁気残留を模擬
    hysteresis = _apply_memory(B, 0.15 * p.saturation)
    wet = p.saturation * 0.6
    result = up * (1.0 - wet) + hysteresis * wet
    return resample_poly(result, 1, 8)[:len(buf)]
```
**Neve / API / SSL コンソールの「色」の正体。** tanh(x/3) は奇数倍音のみ生成し、トランスの特性を再現。

#### [EVO] ⑤ Triode Tube（現行 waveshaper を進化）

```python
@dataclass
class TriodeParams:
    drive: float = 0.4           # 0-1
    bias: float = -1.2           # -2.0 (偶数優勢) ~ 0.0 (奇数優勢)
    plate_voltage: float = 250.0
    mu: float = 100.0            # 12AX7 ≈ 100
    mix: float = 0.5

def apply_triode(buf, sr, p):
    """Koren 三極管方程式。8x OS。バイアスで倍音スペクトラム制御。"""
    up = resample_poly(buf, 8, 1)
    Kp, Kvb, Ex = 600.0, 300.0, 1.4
    Vg = up * (p.drive * 8.0 + 0.5) + p.bias
    sqrt_term = np.sqrt(Kvb + p.plate_voltage ** 2)
    inner = Kp * (1.0 / p.mu + Vg / sqrt_term)
    E1 = (p.plate_voltage / Kp) * np.where(inner > 20, inner, np.log1p(np.exp(np.clip(inner, -20, 20))))
    Ip = np.power(np.maximum(E1, 0), Ex)
    saturated = Ip / (np.max(np.abs(Ip)) + 1e-10)
    result = up * (1.0 - p.mix) + saturated * p.mix
    return resample_poly(result, 1, 8)[:len(buf)]
```

**バイアス制御 — 現行 waveshaper にない決定的な差:**

| バイアス | 倍音構成 | 音色 | 用途 |
|---------|---------|------|------|
| `-2.0V` | 偶数優勢 | 暖かく丸い | Jazz, Vocal |
| `-1.2V` | バランス | 太く存在感 | Pop, R&B (デフォルト) |
| `-0.5V` | 奇数優勢 | 攻撃的 | EDM, Metal |

#### [NEW] ⑥ Tape Emulation

```python
@dataclass
class TapeParams:
    speed_ips: float = 30.0     # 15 or 30 IPS
    saturation: float = 0.3     # テープ磁気飽和量
    bump_freq: float = 80.0     # ヘッドバンプ周波数
    bump_gain: float = 2.0      # ヘッドバンプ量 (dB)
    mix: float = 0.4

def apply_tape(buf, sr, p):
    """arctan 系サチュレーション + ヘッドバンプ + HF ロールオフ。8x OS。"""
```
**3 要素:** テープ・コンプレッション (arctan)、ヘッドバンプ (80Hz ピーキング EQ)、高域ロールオフ (テープ速度依存)

#### [NEW] ⑦ Dynamic EQ

```python
@dataclass
class DynEqBand:
    freq: float          # 中心周波数
    q: float
    threshold_db: float  # 閾値超過時のみ動作
    max_gain_db: float   # 最大カット/ブースト
    attack_ms: float = 10.0
    release_ms: float = 80.0

# AI エージェントが設定するデフォルト:
DEFAULT_DYN_EQ = [
    DynEqBand(80,   0.8, -12, -3),   # Low Tame: サビの低域膨らみ抑制
    DynEqBand(300,  1.0, -15, -2),   # Mud Cut: ボーカル帯域の濁り
    DynEqBand(5000, 1.2, -18, -4),   # De-Harsh: 耳障りな高域
    DynEqBand(12000,1.5, -25, +2),   # Air Boost: 静かなパートで空気感
]
```
**帯域分割なし。** サイドチェーン・フィルタでレベル検出 → 動的ゲイン制御。位相を完全保存。

#### [NEW] ⑧ 4-Band Program-Dependent Compressor

```python
COMP_BANDS = {
    'sub':  {'xover': 80,    'thresh': -18, 'ratio': 2.0, 'attack': 20, 'release': 150},
    'low':  {'xover': 300,   'thresh': -15, 'ratio': 1.8, 'attack': 15, 'release': 120},
    'mid':  {'xover': 4000,  'thresh': -14, 'ratio': 1.5, 'attack': 10, 'release': 80},
    'high': {'xover': 20000, 'thresh': -20, 'ratio': 2.5, 'attack': 5,  'release': 60},
}
```
**プログラム依存:** トランジェント検出 → attack 1/3 加速。持続音 → release 2x 延長。パンチを殺さず音圧を上げる。

#### [EVO] ⑨ Parametric EQ（現行 Pultec を拡張）

現行: HPF 30Hz + Peaking 55Hz (固定)
目標: Pultec 基本構成 + AI が可変バンドを追加

```python
def apply_parametric_eq(buf, sr, bands):
    """AI が周波数・Q・ゲインを曲ごとに生成する可変バンド EQ"""
    # 必ず Pultec 基本構成（HPF 30Hz + Peak 55Hz）を含む
    # + AI 指定の追加バンド
```

#### [NEW] ⑩ Frequency-Dependent Stereo Width

```python
@dataclass
class StereoWidthParams:
    low_mono_freq: float = 200.0    # ~200Hz 以下をモノ化
    low_mono_amount: float = 0.8    # モノ化強さ (0-1)
    high_wide_freq: float = 4000.0  # ~4kHz 以上をワイド化
    high_wide_amount: float = 1.15  # Side ゲイン倍率
    global_width: float = 1.0

def apply_freq_dependent_width(mid, side, sr, p):
    """Side を 3 帯域に分割し帯域別ゲイン適用 + Mono 互換チェック"""
```
**Abbey Road の黄金律:** 低域モノ（クラブ対策）、高域ワイド（空気感）。Side エネルギーが Mid の 50% を超えたらセーフティ発動。

#### [KEEP] ⑪ Soft Clipper

```python
# 現行実装を維持: threshold=0.99, slope=0.04
# Exponential blend で指数的に丸める
clipper_curve = make_clipper_curve(0.99)
apply_wave_shaper(channel, clipper_curve)
```
**改善点:** 8x OS 内で適用する（OS は ④⑤⑥ と共有のアップサンプル区間で行う）

#### [EVO] ⑫ True Peak Limiter v2（現行リミッターを進化）

```python
@dataclass
class TruePeakLimiterParams:
    ceiling_dbtp: float = -1.0      # ストリーミング標準
    lookahead_ms: float = 5.0
    release_ms: float = 50.0
    release_curve: str = 'program_dependent'

def apply_true_peak_limiter_v2(buf, sr, p):
    """8x OS でインターサンプルピーク検出 + Lookahead + プログラム依存リリース"""
    # 1. 8x OS でピーク位置検出
    # 2. Lookahead: 未来のピークを事前把握
    # 3. ゲイン計算 (ceiling / peak)
    # 4. プログラム依存リリース (深い削減 → 遅いリリース)
    # 5. 入力を lookahead 分遅延させてゲイン適用
```
**現行との差:** Lookahead なし→あり、OS なし→8x、固定リリース→プログラム依存。ISP ゼロ保証。

#### [KEEP] ⑬ Parallel Drive (Neuro-Drive)

```python
# 現行実装を維持
# Dry 0.78 + Wet 0.22
# Wet: hyper_compress(0.3, 4:1) → HPF 250Hz → High Shelf 12kHz +4.5dB
# 将来: wet 量を AI パラメータ化 (0.10-0.30)
```

#### [NEW] ⑭ TPDF Dither + M/S Merge

```python
def apply_dither(buf, target_bits=24, noise_shaping=True):
    """TPDF + F-weighted ノイズシェーピング"""
    levels = 2 ** (target_bits - 1)
    lsb = 1.0 / levels
    r1 = np.random.uniform(-0.5, 0.5, len(buf))
    r2 = np.random.uniform(-0.5, 0.5, len(buf))
    dither = (r1 + r2) * lsb  # 三角分布
    if noise_shaping:
        # F-weighted: 聴覚が鈍い高域にノイズ集中
        # フィードバック [1, -2, 1] → 2次差分 → 高域強調
        ...
    return np.round((buf + dither) * levels) / levels
```

### 5.5 統合チェーン関数

```python
def master_world_class(left, right, sr, p: WorldClassParams):
    """14段の世界最高峰マスタリングチェーン"""

    # ① DC 除去
    left, right = remove_dc(left, sr), remove_dc(right, sr)

    # ② M/S 分離
    mid  = (left + right) * 0.5
    side = (left - right) * 0.5

    # ③-⑨, ⑪-⑬: Mid/Side 独立処理
    for ch in [mid, side]:
        ch[:] = apply_gain(ch, p.gain_db)                        # ③
        ch[:] = apply_transformer(ch, sr, p.transformer)          # ④
        ch[:] = apply_triode(ch, sr, p.triode)                    # ⑤
        ch[:] = apply_tape(ch, sr, p.tape)                        # ⑥
        ch[:] = apply_dynamic_eq(ch, sr, p.dyn_eq_bands)          # ⑦
        ch[:] = apply_4band_comp(ch, sr, p.comp_bands)            # ⑧
        ch[:] = apply_parametric_eq(ch, sr, p.eq_bands)           # ⑨
        ch[:] = apply_soft_clipper(ch, 0.98)                      # ⑪
        ch[:] = apply_true_peak_limiter_v2(ch, sr, p.limiter)     # ⑫
        ch[:] = apply_neuro_drive(ch, sr, p.parallel_wet)         # ⑬

    # ⑩ 周波数依存ステレオ幅 (M/S のまま処理)
    mid, side = apply_freq_dependent_width(mid, side, sr, p.stereo)

    # M/S → L/R 合成
    left[:], right[:] = mid + side, mid - side

    # ⑭ TPDF ディザ
    left[:], right[:] = apply_dither(left, p.output_bits), apply_dither(right, p.output_bits)
```

---

## 6. LUFS 測定 — BS.1770-4 準拠

### 6.1 現行実装の問題

```python
# 現行 (audio_logic.py:274-295)
# - K 重みフィルタなし (K_LEFT = K_RIGHT = 1.0)
# - ゲーティングなし (全ブロックを平均)
# - 75% オーバーラップなし
# → 静寂部を含む楽曲で LUFS が低く測定される
```

### 6.2 目標実装

```python
def measure_lufs_bs1770(left, right, sr):
    """EBU R128 / ITU-R BS.1770-4 準拠"""

    # Stage 1: K-weighting (2段 Biquad SOS)
    k_sos = _build_k_weight_sos(sr)
    left_k  = sosfilt(k_sos, left)
    right_k = sosfilt(k_sos, right)

    # Stage 2: 400ms ブロック / 75% オーバーラップ
    block_size = int(sr * 0.4)
    hop_size   = int(sr * 0.1)

    # Stage 3: Absolute gating (-70 LUFS)
    # Stage 4: Relative gating (-10 LU below abs-gated mean)

    return -0.691 + 10 * np.log10(mean_power)
```

### 6.3 True Peak 測定

```python
def measure_true_peak(left, right, sr):
    """4x OS でインターサンプルピーク検出"""
    up_l = resample_poly(left, 4, 1)
    up_r = resample_poly(right, 4, 1)
    return 20 * np.log10(max(np.max(np.abs(up_l)), np.max(np.abs(up_r))) + 1e-10)
```

---

## 7. 自己補正ループ — 改良型閉ループ制御

### 7.1 現行実装

```
- 中央 10 秒のみサンプリング
- 0.1dB リニアサーチ (最大 50 回)
- 収束閾値: ±0.05 LU
- 簡易 LUFS 測定
```

### 7.2 改良設計

```python
def optimize_params(left, right, sr, target_lufs, initial_params,
                    max_iter=30, tolerance=0.1):
    params = copy(initial_params)

    # 改善1: 3 箇所サンプリング (序盤/中盤/終盤 × 5秒)
    segments = _extract_segments(left, right, sr, n=3, dur=5)

    # 改善2: 二分探索で初期推定 (6 回 → 0.375dB 精度)
    lo, hi = -12.0, 12.0
    for _ in range(6):
        mid_gain = (lo + hi) / 2
        params.gain_adjustment_db = mid_gain
        lufs = _simulate_and_measure(segments, sr, params)
        if lufs < target_lufs: lo = mid_gain
        else: hi = mid_gain

    # 改善3: 微調整はリニアサーチ (反復上限 24 回に削減)
    for i in range(max_iter):
        params.gain_adjustment_db = (lo + hi) / 2
        lufs = _simulate_and_measure(segments, sr, params)
        err = target_lufs - lufs
        if abs(err) <= tolerance: break
        if err > 0: lo = params.gain_adjustment_db
        else: hi = params.gain_adjustment_db

    return params, lufs, i + 7
```

| 改善点 | 現行 | 改良 | 効果 |
|--------|------|------|------|
| サンプリング | 中央 10 秒 | 3 箇所 × 5 秒 | ダイナミクス偏り軽減 |
| 初期探索 | 0.1dB リニア | 二分探索 6 回 | 50 → ~15 反復に削減 |
| LUFS 測定 | 簡易 | K 重み + ゲーティング | 精度 ±0.5 → ±0.1 LU |

---

## 8. フェーズ III — 合議（Consensus Display）

### 8.1 Frontend 表示構成

```
┌────────────────────────────────────────────────────┐
│ AudioComparisonPlayer                              │
│ ・Original vs Mastered の A/B 即時切替             │
│ ・Web Audio API による円形周波数ビジュアライザー     │
└────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────┐
│ AnalysisView — Spectral Scan Results               │
│ ・20 点メトリクス (4 列グリッド)                     │
│ ・各メトリクス: name, value, target, status         │
│ ・Compatibility Score (optimal 率 %)               │
└────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────┐
│ AgentConsensus — Neuro-Consensus Board             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │ Audience │ │   A&R    │ │ Engineer │            │
│ │ comment  │ │ comment  │ │ comment  │            │
│ │ params   │ │ params   │ │ params   │            │
│ └──────────┘ └──────────┘ └──────────┘            │
│                                                    │
│ ┌──────────────────────────────────────┐          │
│ │ FINAL DSP MATRIX                     │          │
│ │ Tube: 0.42 | Pultec: 1.80dB | Ceil: -0.50dB   │
│ └──────────────────────────────────────┘          │
└────────────────────────────────────────────────────┘
```

### 8.2 Realtime Subscription

```typescript
// App.tsx — DB 変更を購読してステート更新
supabase.channel(`job-${activeJobId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'mastering_jobs',
    filter: `id=eq.${activeJobId}`
  }, (payload) => {
    const job = payload.new;
    setState(prev => ({
      ...prev,
      step: job.status,
      analysis: job.metrics,
      consensus: job.consensus_opinions,
      finalParams: job.final_params,
      outputUrl: job.output_url,
    }));
  })
  .subscribe();
```

### 8.3 状態遷移

```
idle → uploading → analyzing → consensus → processing → completed
  │                                                          │
  └──── failed ←─────────────────────────────────────────────┘
```

- `idle`: 初期状態。アップロードフォーム表示
- `uploading`: ファイル転送中 (Progress bar)
- `analyzing`: Gemini が 3 エージェントで解析中
- `consensus`: AI パラメータ合意完了 (DB 更新トリガー)
- `processing`: DSP エンジンが処理中
- `completed`: 結果表示 + ダウンロードリンク
- `failed`: エラーメッセージ表示 + リトライボタン

---

## 9. 性能最適化ロードマップ

### 9.1 現行のボトルネック

```python
# audio_logic.py の全 for ループ:
# - apply_wave_shaper()  : O(n) Pure Python
# - apply_biquad()       : O(n) Pure Python
# - apply_limiter()      : O(n) Pure Python
# - hyper_compress()     : O(n) Pure Python
# - measure_lufs()       : O(n) Pure Python
#
# 44.1kHz × 5min = ~13M samples × 2ch × 最適化50回
# → 理論上 数十分/曲
```

### 9.2 最適化レベル

| Level | 手法 | 速度 | 対象 | コスト |
|-------|------|------|------|--------|
| 0 (現行) | Pure Python for | 1x | — | — |
| **1** | **NumPy ベクトル化** | **10-50x** | `apply_wave_shaper`, `measure_lufs` | **数時間** |
| **2** | **scipy.signal.sosfilt** | **50-100x** | `apply_biquad`, `apply_pultec_style` | **数時間** |
| 3 | Numba JIT (`@njit`) | 100-500x | `apply_limiter`, `hyper_compress` | 1-2 日 |
| 4 | C/Rust 拡張 (pyo3) | 500-1000x | ホットパス全体 | 1 週間+ |

### 9.3 Level 1 ベクトル化の具体例

```python
# Before (apply_wave_shaper — Pure Python):
def apply_wave_shaper(buffer, curve):
    length = len(curve) - 1
    half = length / 2.0
    for i in range(len(buffer)):
        idx = buffer[i] * half + half
        i0 = max(0, min(length - 1, int(math.floor(idx))))
        i1 = min(length, i0 + 1)
        t = idx - i0
        buffer[i] = curve[i0] * (1 - t) + curve[i1] * t

# After (NumPy vectorized):
def apply_wave_shaper_vectorized(buffer, curve):
    length = len(curve) - 1
    half = length / 2.0
    idx = buffer * half + half
    i0 = np.clip(np.floor(idx).astype(np.int32), 0, length - 1)
    i1 = np.clip(i0 + 1, 0, length)
    t = idx - i0
    buffer[:] = curve[i0] * (1 - t) + curve[i1] * t
```

---

## 10. テスト・QA 戦略

| 層 | 内容 | 合格基準 |
|----|------|----------|
| **L1: Unit** | 各 DSP 段の入出力。正弦波 → 倍音構成。Biquad 係数の数学的正確性 | Golden file と SNR > 120dB |
| **L2: Integration** | 合成音源を全チェーンに通す。処理前後の LUFS / True Peak / クレスト | LUFS: 目標 ±0.5 LU, TP: ≤ ceiling + 0.1 dBTP |
| **L3: Regression** | ジャンル別 5-10 曲で golden baseline 比較 | LUFS 差分 ≤ 0.3 LU, スペクトル相関 ≥ 0.98 |

```python
def test_sine_wave_mastering():
    """1kHz 正弦波 → 全チェーン → LUFS/TruePeak 検証"""
    sr = 44100
    t = np.linspace(0, 10, sr * 10, dtype=np.float32)
    sine = np.sin(2 * np.pi * 1000 * t) * 0.5
    left, right = sine.copy(), sine.copy()

    params = WorldClassParams(target_lufs=-14.0)
    optimized, lufs, iters = optimize_params(left, right, sr, -14.0, params)
    master_world_class(left, right, sr, optimized)

    final_lufs = measure_lufs_bs1770(left, right, sr)
    true_peak = measure_true_peak(left, right, sr)

    assert abs(final_lufs - (-14.0)) < 0.5
    assert true_peak <= -0.9
    assert iters < 30
```

---

## 11. 実装ロードマップ

### Phase 1 — 即効性の高い改善（1-2 週間）

| 優先度 | タスク | 影響 | ファイル |
|--------|--------|------|---------|
| **P0** | `apply_wave_shaper` / `measure_lufs` の NumPy ベクトル化 | 処理時間 1/10-1/50 | `audio_logic.py` |
| **P0** | `apply_biquad` → `scipy.signal.sosfilt` 置換 | 処理時間 1/50-1/100 | `audio_logic.py` |
| **P0** | DC 除去 (`remove_dc`) 追加 | ヘッドルーム確保 | `audio_logic.py` |
| **P0** | TPDF ディザ (`apply_dither`) 追加 | 量子化歪み排除 | `audio_logic.py` |
| **P1** | LUFS 測定を BS.1770-4 準拠に更新 | 測定精度 ±0.5→±0.1 | `audio_logic.py` |

### Phase 2 — 音質の飛躍（2-4 週間）

| 優先度 | タスク | 影響 |
|--------|--------|------|
| **P1** | 全非線形処理に 8x OS 追加 | エイリアシング完全排除 |
| **P1** | Koren 三極管モデル (`apply_triode`) | バイアスによる倍音制御 |
| **P1** | Transformer 磁気飽和 (`apply_transformer`) | コンソールの「色」再現 |
| **P1** | True Peak Limiter v2 (Lookahead + プログラム依存) | ISP ゼロ保証 |

### Phase 3 — プロスタジオ品質（1-2 ヶ月）

| 優先度 | タスク | 影響 |
|--------|--------|------|
| **P2** | 4バンド・プログラム依存コンプ | パンチ保持 + 帯域別制御 |
| **P2** | ダイナミック EQ | 時間変動する周波数問題を動的補正 |
| **P2** | テープ・エミュレーション | Studer / Ampex 相当 |
| **P2** | 周波数依存ステレオ幅 | Abbey Road 標準 |
| **P2** | AI パラメータ拡張 (4→15 パラメータ) | Gemini の能力を活用 |

### Phase 4 — 極限性能（2-3 ヶ月）

| 優先度 | タスク |
|--------|--------|
| P3 | Numba JIT for リミッター / コンプレッサー |
| P3 | 自己補正ループの二分探索 + 3 箇所サンプリング |
| P3 | L1-L3 テストスイート構築 |
| P3 | スペクトログラム比較 UI |

---

## 12. 定数テーブル

### DSP 固定定数（コード変更なしには変更不可）

```python
# 現行 (audio_logic.py)
TUBE_CURVE_LEN       = 8192
CLIPPER_THRESHOLD     = 0.99
CLIPPER_SLOPE         = 0.04
NEURO_DRIVE_WET       = 0.22
HPF_CUTOFF            = 250       # Hz
HIGH_SHELF_FREQ       = 12000     # Hz
HIGH_SHELF_GAIN       = 4.5       # dB
HYPER_COMP_THRESHOLD  = 0.3
HYPER_COMP_RATIO      = 4.0
LIMITER_ATTACK        = 5.0       # ms

# 追加予定 (14段チェーン)
DC_HPF_FREQ           = 5.0       # Hz
OS_FACTOR             = 8         # オーバーサンプリング倍率
LOOKAHEAD_MS          = 5.0       # リミッター先読み
DITHER_BITS           = 24        # 出力ビット深度
```

### AI 制御パラメータ（Gemini が曲ごとに生成）

```python
# 現行 4 パラメータ
tube_drive_amount:   0.0 - 1.0     # default: 0.42
low_contour_amount:  0.0 - 2.5 dB  # default: 1.8
limiter_ceiling_db: -1.0 - -0.1    # default: -0.5
target_lufs:        -9.0 - -7.0    # default: -8.0

# 拡張パラメータ (Phase 2-3)
transformer_saturation: 0.0 - 1.0  # default: 0.3
triode_drive:          0.0 - 1.0   # default: 0.4
triode_bias:          -2.0 - 0.0   # default: -1.2
tape_saturation:       0.0 - 1.0   # default: 0.3
dyn_eq_bands:          DynEqBand[] # default: 4 bands
parallel_wet:          0.0 - 0.5   # default: 0.18
stereo_width:          0.8 - 1.3   # default: 1.0
```

### Beatport Top 10 ターゲット

```python
BEATPORT_TARGETS = {
    'LUFS':           -8.5,
    'DYNAMIC_RANGE':   6.0,
    'STEREO_WIDTH':    0.75,
    'SUB_BASS_ENERGY': -12.0,
}
```

---

## 13. ファイルマップ

```
neuro/
├── docs/
│   └── SPEC.md                              # ← この仕様書
├── frontend/
│   ├── App.tsx                              # メイン UI + Realtime 購読
│   ├── components/
│   │   ├── MasteringFlow.tsx                # 3ステップフォーム
│   │   ├── FileUploader.tsx                 # ドラッグ&ドロップ
│   │   ├── AnalysisView.tsx                 # 20点メトリクス表示
│   │   ├── AgentConsensus.tsx               # 3ペルソナ + FINAL DSP MATRIX
│   │   ├── AudioComparisonPlayer.tsx        # A/B 比較プレーヤー
│   │   ├── AlgorithmPage.tsx                # アルゴリズム仕様ページ
│   │   └── Header.tsx                       # ナビゲーション
│   ├── types.ts                             # TypeScript 型定義
│   ├── constants.ts                         # DSP 定数 + Beatport ターゲット
│   └── services/supabaseClient.ts           # Supabase クライアント
├── backend/
│   ├── audio-analysis-trigger/
│   │   └── src/server.ts                    # 3-Agent Consensus (Gemini 1.5-Pro)
│   └── dsp-mastering-engine/
│       ├── app.py                           # FastAPI (Cloud Run)
│       └── audio_logic.py                   # 6段 DSP チェーン (373行)
│                                            # → 14段に拡張予定
└── supabase/
    └── functions/
        └── process-mastering/index.ts       # Edge Function → Cloud Run ブリッジ
```

---

*NEURO-MASTER Refined Logic Specification v2.0 — February 2026*
*Based on: World-Class DSP Architecture v1.0 + Best Practices Specification*
*Source of truth for: 解析 → マスタリング → 合議 pipeline*
