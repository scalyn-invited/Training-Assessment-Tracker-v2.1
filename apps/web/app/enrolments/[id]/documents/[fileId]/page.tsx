import { DocumentReview } from '../../../../components/document-review';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; fileId: string }>;
}) {
  const { id, fileId } = await params;
  return <DocumentReview id={id} fileId={fileId} />;
}
