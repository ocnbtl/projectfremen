import ProjectsRoutePage from "../ProjectsRoutePage";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectsRoutePage mode="detail" projectId={projectId} />;
}
