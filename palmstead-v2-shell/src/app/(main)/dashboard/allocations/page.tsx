import { AllocationsBoard } from "./_components/allocations-board";

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <AllocationsBoard />
    </div>
  );
}
