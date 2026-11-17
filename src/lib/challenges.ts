export type AnswerType = "number" | "text" | "dax";
export type TrackId = "retail" | "fintech" | "supply" | "health";
export const DEFAULT_CHECKPOINT_POINTS = 100;
export const MAX_CHECKPOINT_POINTS = 2_147_483_647;
export const CHECKPOINT_HINT_COST = 50;
export type Checkpoint = {
  title: string; question: string; type: AnswerType; expected: string;
  tolerance: number; variants: string[]; hint: string; query?: string | null; points?: number;
};
