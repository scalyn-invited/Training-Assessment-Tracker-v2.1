export type BuilderState = {
  id: string | null;
  version: number;
  revision?: number;
  source_definition_id?: string | null;
  source_revision?: number | null;
  status: string;
  title: string;
  questions: unknown[];
  sections: unknown[] | null;
  criteria: unknown[];
  threshold: number | null;
  answer_key: Record<string, string | null>;
};
export function mountAssessmentBuilder(root: HTMLElement, initial: BuilderState): () => void;
