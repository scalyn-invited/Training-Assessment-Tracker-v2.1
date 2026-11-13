import { AssignmentForm } from '../../../../components/assignment-form';
export default async function AssignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssignmentForm definition={id} />;
}
