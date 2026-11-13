export type BuilderState = {
  id: string | null;
  version: number;
  status: string;
  title: string;
  questions: unknown[];
  sections: unknown[] | null;
  criteria: unknown[];
  threshold: number | null;
  answer_key: Record<string, string | null>;
};
export function mountAssessmentBuilder(root: HTMLElement, initial: BuilderState): () => void;
