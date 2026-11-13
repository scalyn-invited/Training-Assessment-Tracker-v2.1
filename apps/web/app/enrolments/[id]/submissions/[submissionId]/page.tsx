import { SubmissionReceipt } from '../../../../components/delivery';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id, submissionId } = await params;
  return <SubmissionReceipt id={id} submissionId={submissionId} />;
}
