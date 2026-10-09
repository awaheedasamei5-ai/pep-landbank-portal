import { ProjectIssuesScreen } from "./_components/project-issues-screen";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectIssuesScreen projectId={projectId} />;
}
