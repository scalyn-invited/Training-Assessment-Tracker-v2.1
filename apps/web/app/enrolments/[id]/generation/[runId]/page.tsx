import { GenerationRun } from '../../../../components/programme-generation';
export default async function Page({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  return <GenerationRun id={id} runId={runId} />;
}
