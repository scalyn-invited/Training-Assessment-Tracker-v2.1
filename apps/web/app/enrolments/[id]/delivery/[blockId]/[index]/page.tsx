import { LearningLesson } from '../../../../../components/delivery';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; blockId: string; index: string }>;
}) {
  const { id, blockId, index } = await params;
  return <LearningLesson id={id} blockId={blockId} index={Number(index)} />;
}
