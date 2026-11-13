import { AssessmentResponse } from '../../../components/assessment-response';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssessmentResponse id={id} />;
}
