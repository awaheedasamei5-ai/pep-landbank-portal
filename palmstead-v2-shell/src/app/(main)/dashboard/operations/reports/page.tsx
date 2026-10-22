import { OperationsReportsScreen } from "./_components/operations-reports-screen";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
	const values = await searchParams;
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(values)) {
		if (Array.isArray(value)) for (const item of value) params.append(key, item);
		else if (typeof value === "string") params.append(key, value);
	}
	return <OperationsReportsScreen initialSearchParams={params.toString()} />;
}
