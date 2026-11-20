// Display references are calculated from the full pinned definition, never a section subset.
export function questionReference(
  id: string,
  questions: readonly { id: string }[],
  sections?: readonly { title: string; question_ids: string[] }[] | null,
) {
  const section = sections?.find((item) => item.question_ids.includes(id));
  const index = questions.findIndex((question) => question.id === id);
  return `${section ? (section.title || 'Untitled section') + ' — ' : ''}Question ${index + 1}`;
}
