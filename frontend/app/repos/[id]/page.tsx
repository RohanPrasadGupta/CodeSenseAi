import { RepoDashboard } from "@/components/repo-dashboard";

export default async function RepoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RepoDashboard repoId={id} />;
}
