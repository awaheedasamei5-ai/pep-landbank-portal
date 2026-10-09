import { IssueDetailScreen } from "./_components/issue-detail-screen";

export default async function Page({ params }: { params: Promise<{ projectId: string; issueId: string }> }) {
  const { projectId, issueId } = await params;
  return <IssueDetailScreen projectId={projectId} issueId={issueId} />;
}
