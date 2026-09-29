export type CompetitionRole = "judge" | "admin";

export interface CompetitionScoringItem {
  key: string;
  name: string;
  max: number;
  criteria: string;
}

export interface CompetitionAward {
  name: string;
  count: number;
  amount?: string;
  remaining?: boolean;
}

export interface CompetitionMeta {
  id: string;
  name: string;
  organizer: string;
  dimension_one_label: string;
  dimension_two_label: string;
  dimension_one_max: number;
  dimension_two_max: number;
  score_step: number;
  trim_high: number;
  trim_low: number;
}

export interface CompetitionSettings {
  scoring_open: boolean;
  results_published: boolean;
}

export interface CompetitionJudgeScore {
  team_id: string;
  judge_employee_id: string;
  judge_name: string;
  items: Record<string, number>;
  total: number;
  comment: string;
  submitted_at: number;
  updated_at: number;
  revision: number;
}

export interface CompetitionDimensionOneDetail {
  training_count: number;
  training_score: number;
  audience_total: number;
  signin_score: number;
  source: string;
  note: string;
}

export interface CompetitionTeam {
  id: string;
  display_order: number;
  name: string;
  contest_label: string;
  department_ids: string[];
  dimension_one: number;
  dimension_one_detail: CompetitionDimensionOneDetail;
  my_score: CompetitionJudgeScore | null;
}

export interface CompetitionLeaderboardRow {
  team_id: string;
  name: string;
  contest_label: string;
  dimension_one: number;
  dimension_two: number;
  total: number;
  rank: number;
  award: string;
  judge_count: number;
  counted_count: number;
  trimmed: boolean;
}

export interface CompetitionState {
  role: CompetitionRole;
  judge: { employee_id: string; name: string };
  competition: CompetitionMeta;
  items: CompetitionScoringItem[];
  awards: CompetitionAward[];
  settings: CompetitionSettings;
  teams: CompetitionTeam[];
  judges: Array<{ employee_id: string; name: string }>;
  leaderboard?: CompetitionLeaderboardRow[];
}

export interface CompetitionAuthResponse extends CompetitionState {
  token: string;
  expires_at: number;
}

export interface CompetitionProgressJudge {
  employee_id: string;
  name: string;
  submitted: boolean;
  total: number | null;
  items: Record<string, number> | null;
  comment: string;
  updated_at: number | null;
}

export interface CompetitionProgressRow {
  team_id: string;
  name: string;
  contest_label: string;
  submitted_count: number;
  judges: CompetitionProgressJudge[];
}

export interface CompetitionProgressResponse {
  matrix: CompetitionProgressRow[];
  judge_total: number;
}

export interface CompetitionDimensionOneEntry {
  team_id: string;
  training_count?: number;
  audience_total?: number;
  total?: number | null;
  note?: string;
}

export interface CompetitionDimensionOneRow extends CompetitionDimensionOneDetail {
  team_id: string;
  total: number;
}

export interface CompetitionImportResponse {
  rows: CompetitionDimensionOneRow[];
  unmatched: string[];
  sheet: string;
}
