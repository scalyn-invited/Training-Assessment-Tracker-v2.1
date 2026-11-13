import { AssessmentBuilder } from '../../../components/assessment-builder';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssessmentBuilder definitionId={id} />;
}
