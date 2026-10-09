import Link from "next/link";
import { ArrowLeft, MessageSquareText, ShieldCheck, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaveEmergencyForm } from "@/webnext/features/leave/components/LeaveEmergencyForm";

export default function Page() {
  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/dashboard/leave">
          <ArrowLeft />
          Dashboard
        </Link>
      </Button>
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <LeaveEmergencyForm />
        </div>
        <div className="grid gap-4 self-start xl:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Siren className="size-4 text-destructive" />
                What makes this different
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              A normal request blocks on a colleague&apos;s overlapping leave or your remaining balance. An emergency request never blocks on either — it still goes straight to Management, who see the
              conflict (if any) and decide with full context, rather than you being stopped from sending it at all.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <MessageSquareText className="size-4 text-primary" />
                What happens next
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>Management is SMS&apos;d the moment you send this.</p>
              <p>They choose whether it counts against your annual quota.</p>
              <p>You get an SMS the moment they approve or decline.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4 text-primary" />
                A real decision, not a rubber stamp
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Only use this for a genuine emergency — Management can see it was marked urgent, and the reason you give here is what they&apos;re deciding on.</CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
