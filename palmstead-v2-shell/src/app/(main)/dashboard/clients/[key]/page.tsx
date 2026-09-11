import { ClientDetail } from "../_components/client-detail";

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <ClientDetail clientKey={decodeURIComponent(key)} />
    </div>
  );
}
