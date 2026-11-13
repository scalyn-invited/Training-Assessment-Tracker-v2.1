import { LearningDelivery } from '../../../components/delivery';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LearningDelivery id={id} />;
}
