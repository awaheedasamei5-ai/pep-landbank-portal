import { TableCell, TableRow } from "@/components/ui/table";

// Ported verbatim from Shreyasmark1/leave-management-system
// (src/components/table-empty.tsx).
export function TableEmpty({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}
