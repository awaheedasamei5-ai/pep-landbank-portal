import { PlotDetail } from "../_components/plot-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <PlotDetail id={id} />
    </div>
  );
}
