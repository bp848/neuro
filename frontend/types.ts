
export interface MasteringParams {
  tube_drive_amount: number;
  low_contour_amount: number;
  limiter_ceiling_db: number;
  gain_adjustment_db?: number;
}

export interface AnalysisMetric {
  name: string;
  value: number;
  target: number;
  unit: string;
  status: 'low' | 'optimal' | 'high';
  description: string;
}

export interface AgentOpinion {
  role: 'Audience' | 'A&R' | 'Engineer';
  avatar: string;
  comment: string;
  suggestedParams: Partial<MasteringParams>;
}

export interface MasteringState {
  step: 'idle' | 'uploading' | 'analyzing' | 'consensus' | 'processing' | 'completed';
  progress: number;
  fileName: string | null;
  analysis: AnalysisMetric[] | null;
  consensus: AgentOpinion[] | null;
  finalParams: MasteringParams | null;
  outputUrl: string | null;
  originalBuffer: AudioBuffer | null;
  masteredBuffer: AudioBuffer | null;
}
