export const lessonTextFields = [
  'title',
  'explanation',
  'example',
  'activity',
  'tools',
  'completion',
] as const;
export const lessonMinuteFields = ['reading', 'practice', 'assessment', 'revision'] as const;
export type Lesson = {
  date: string;
  kpi: number;
  title?: string | null;
  explanation?: string | null;
  example?: string | null;
  activity?: string | null;
  tools?: string | null;
  completion?: string | null;
  reading?: number | null;
  practice?: number | null;
  assessment?: number | null;
  revision?: number | null;
};
export type LearningBlock = {
  number: number;
  start: string;
  freeze_at: string;
  objective?: string | null;
  prerequisites?: string | null;
  competency: number;
  criterion_one?: string | null;
  criterion_two?: string | null;
  weight_one: number;
  weight_two: number;
  lessons: Lesson[];
};
export type ProgrammeContent = { blocks: LearningBlock[]; generation_run_id?: string };
