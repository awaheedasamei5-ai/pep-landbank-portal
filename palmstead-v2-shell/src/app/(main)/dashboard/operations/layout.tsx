import { OperationsDataBoundary } from "./_components/operations-data-boundary";

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return <OperationsDataBoundary>{children}</OperationsDataBoundary>;
}
