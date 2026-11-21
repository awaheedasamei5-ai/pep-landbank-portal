import { HomeInsightScreen } from "../_components/home-insight-screen";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ metric?: string }>;
}) {
  const { metric } = await searchParams;
  return <HomeInsightScreen metric={metric} />;
}

