// Generated from project uzmadqbamyryefhayyzy with the Supabase MCP `generate_typescript_types` (2026-10-20),
// trimmed to the Database type. Regenerate after any migration.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type AttemptRow = {
  answered_at: string;
  confidence: string;
  content_hash: string;
  correct: boolean;
  course_id: string;
  created_at: string;
  domain_id: string;
  id: string;
  local_date: string;
  mode: string;
  question_id: string;
  rating: number;
  section_id: string;
  selected: string[];
  session_id: string | null;
  task_id: string | null;
  time_ms: number;
  user_id: string;
};

export type DailyActivityRow = {
  answered: number;
  correct: number;
  goal_met: boolean;
  local_date: string;
  minutes: number;
  sessions_completed: number;
  user_id: string;
};

export type ProfileRow = {
  active_course: string;
  created_at: string;
  daily_goal_min: number;
  day_rollover_hour: number;
  desired_retention: number;
  english_content: boolean;
  locale: string;
  new_per_day: number;
  timezone: string;
  updated_at: string;
  user_id: string;
};

export type ReviewStateRow = {
  content_hash: string;
  course_id: string;
  difficulty: number;
  due: string;
  elapsed_days: number;
  is_leech: boolean;
  lapses: number;
  last_review: string | null;
  learning_steps: number;
  question_id: string;
  recheck_by: string | null;
  reps: number;
  scheduled_days: number;
  stability: number;
  state: number;
  suspended: boolean;
  updated_at: string;
  user_id: string;
};

export type SectionProgressRow = {
  attempts: number;
  best_pct: number;
  course_id: string;
  passed_at: string | null;
  section_id: string;
  updated_at: string;
  user_id: string;
};

export type SessionRow = {
  answered: number;
  completed: boolean;
  correct: number;
  course_id: string;
  ended_at: string | null;
  id: string;
  kind: string;
  local_date: string;
  planned_due: number;
  planned_new: number;
  section_id: string | null;
  started_at: string;
  user_id: string;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      attempts: Table<AttemptRow, "confidence" | "content_hash" | "correct" | "course_id" | "domain_id" | "id" | "local_date" | "mode" | "question_id" | "rating" | "section_id" | "selected" | "time_ms">;
      daily_activity: Table<DailyActivityRow, "local_date">;
      profiles: Table<ProfileRow, "user_id">;
      review_states: Table<ReviewStateRow, "content_hash" | "course_id" | "question_id">;
      section_progress: Table<SectionProgressRow, "course_id" | "section_id">;
      sessions: Table<SessionRow, "course_id" | "id" | "kind" | "local_date">;
    };
    Views: {
      due_today: {
        Row: { course_id: string | null; due: string | null; is_leech: boolean | null; lapses: number | null; question_id: string | null; state: number | null };
        Relationships: [];
      };
    };
    Functions: {
      local_study_date: { Args: { rollover_hour?: number; ts: string; tz: string }; Returns: string };
      streak_status: {
        Args: never;
        Returns: { current_streak: number; freezes: number; longest_streak: number; today_done: boolean }[];
      };
      topic_stats: {
        Args: { p_course_id: string };
        Returns: { attempted: number; confident_wrong: number; correct: number; domain_id: string; section_id: string; stale: number }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
