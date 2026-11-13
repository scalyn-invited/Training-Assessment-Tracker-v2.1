import { LearningProgress } from '../../../components/learning-progress';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LearningProgress id={id} />;
}
