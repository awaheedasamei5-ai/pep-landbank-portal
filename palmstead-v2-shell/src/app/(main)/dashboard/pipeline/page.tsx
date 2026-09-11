import { PipelineBoard } from "./_components/pipeline-board";

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <PipelineBoard />
    </div>
  );
}
