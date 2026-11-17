export type AnswerType = "number" | "text" | "dax";
export type TrackId = "retail" | "fintech" | "supply" | "health";
export type Checkpoint = {
  title: string; question: string; type: AnswerType; expected: string;
  tolerance: number; variants: string[]; hint: string; query?: string | null;
};
