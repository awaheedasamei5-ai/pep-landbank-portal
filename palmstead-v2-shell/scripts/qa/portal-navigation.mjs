import assert from "node:assert/strict";
import {
  applyPortalReturn, emptyPortalTrail, matchPortalRoute, portalHrefWithReturnTo,
  portalParent, portalRoutePatterns, portalViewKey, recordPortalVisit, resolvePortalReturn, safePortalHref,
} from "../../src/lib/palmstead/portal-navigation.ts";

const checks = [];
function check(name, test) { test(); checks.push(name); }
const project = "/dashboard/operations/11111111-1111-4111-8111-111111111111";
const issue = project + "/issues/22222222-2222-4222-8222-222222222222";
const request = "/dashboard/leave/requests/33333333-3333-4333-8333-333333333333";
const manager = "manager";
const home = "/dashboard/default";

for (const pattern of portalRoutePatterns) {
  const href = pattern.replace(/\[[^\]]+\]/g,"qa-record");
  check(`registered route and parent: ${pattern}`, () => {
    assert.equal(safePortalHref(href,manager),href);
    assert.ok(matchPortalRoute(portalParent(href,manager)));
    if (href !== home) assert.notEqual(portalParent(href,manager),href);
  });
}
const attacks = [
  "https://example.com/dashboard/default", "http://example.com", "javascript:alert(1)", "data:text/html,unsafe",
  "//example.com/dashboard/default", "\\\\example.com", "/\\example.com", "/dashboard//finance", "/dashboard\\finance",
  "/dashboard/leave/../finance", "/dashboard/leave/%2e%2e/finance", "/dashboard/leave/%252e%252e/finance",
  "/dashboard/operations/%2f%2fexample.com", "/dashboard/operations/%252fexample.com", "/dashboard/operations/%5cfoo",
  "/dashboard/operations/%255cfoo", "/dashboard/operations/%00", "/dashboard/operations/%0a", "/dashboard/operations/%zz",
  "/auth/v1/login", "/dashboard/coming-soon", "/dashboard/unknown/app", " /dashboard/finance", "/dashboard/finance\n", "",
];
for (const attack of attacks) check(`reject unsafe/unregistered target: ${JSON.stringify(attack)}`,()=>assert.equal(safePortalHref(attack,manager),null));
check("length limit",()=>assert.equal(safePortalHref("/dashboard/finance?search="+"x".repeat(4096),manager),null));
check("dashboard alias resolves Home",()=>assert.equal(safePortalHref("/dashboard",manager),home));
check("encoded spaces in legitimate record keys are preserved",()=>assert.equal(safePortalHref("/dashboard/clients/QA%20client",manager),"/dashboard/clients/QA%20client"));
check("encoded control characters still rejected",()=>assert.equal(safePortalHref("/dashboard/clients/QA%20%0aclient",manager),null));
check("filter values survive canonical key order",()=>assert.equal(safePortalHref("/dashboard/finance?tab=payments&staff=qa%20staff",manager),"/dashboard/finance?staff=qa+staff&tab=payments"));
check("credentials and recursive return keys stripped",()=>assert.equal(safePortalHref("/dashboard/finance?tab=payments&returnTo=javascript%3Aalert(1)&BACK_TO=%2Fdashboard%2Fleave&access_token=secret&password=secret",manager),"/dashboard/finance?tab=payments"));
check("Management-only reset rejected for Staff",()=>assert.equal(safePortalHref("/dashboard/operations/settings/data","agent"),null));
check("Management Leave view rejected for Staff",()=>assert.equal(safePortalHref("/dashboard/leave/management/reports","agent"),null));
check("Management Attendance rejected for Staff",()=>assert.equal(safePortalHref("/dashboard/attendance/management/records","agent"),null));
check("static settings parent is not a fake project",()=>assert.equal(portalParent("/dashboard/operations/settings/data",manager),"/dashboard/operations"));
check("issue parent is the actual project",()=>assert.equal(portalParent(issue,manager),project));
check("request edit returns to request detail",()=>assert.equal(portalParent(request+"/edit",manager),request));
check("forbidden Management parent skipped for Staff",()=>assert.equal(portalParent("/dashboard/leave/management/settings","agent"),"/dashboard/leave"));
check("unknown paths fall back to Home",()=>assert.equal(portalParent("/dashboard/not-real/extra",manager),home));

let state=emptyPortalTrail();
state=recordPortalVisit(state,home,"visit",manager);
state=recordPortalVisit(state,"/dashboard/operations?view=queue&priority=high","visit",manager);
state=recordPortalVisit(state,"/dashboard/operations?view=queue&priority=urgent","visit",manager);
check("filter changes replace the current view",()=>assert.equal(state.entries.length,2));
state=recordPortalVisit(state,issue,"visit",manager);
let back=resolvePortalReturn(issue,state,undefined,manager);
check("Back restores exact queue filter",()=>assert.equal(back.href,"/dashboard/operations?priority=urgent&view=queue"));
state=applyPortalReturn(state,back);
back=resolvePortalReturn(back.href,state,undefined,manager);
check("repeated Back cannot toggle into the closed issue",()=>assert.equal(back.href,home));

state=recordPortalVisit(emptyPortalTrail(),"/dashboard/finance?tab=payments&month=2026-10","visit",manager);
state=recordPortalVisit(state,"/dashboard/finance?tab=reports","visit",manager);
check("meaningful tab change adds a return step",()=>assert.equal(state.entries.length,2));
check("Back restores selected Accounting tab and month",()=>assert.equal(resolvePortalReturn("/dashboard/finance?tab=reports",state,undefined,manager).href,"/dashboard/finance?month=2026-10&tab=payments"));
const forward=state;
state=recordPortalVisit(state,"/dashboard/finance?tab=payments&month=2026-10","pop",manager);
check("native Back retains forward visit",()=>{assert.equal(state.index,0);assert.equal(state.entries.length,2);});
state=recordPortalVisit(state,"/dashboard/finance?tab=reports","pop",manager);
check("native Forward returns to recorded view",()=>assert.equal(state.index,forward.index));

const filtered="/dashboard/leave/management/reports?view=requests&year=2026&employee=qa&from=2&to=4";
const drill=portalHrefWithReturnTo(request,filtered,manager);
check("deep-link context preserves filtered register",()=>assert.equal(resolvePortalReturn(drill,emptyPortalTrail(),undefined,manager).href,safePortalHref(filtered,manager)));
check("returnTo is stripped after one use",()=>assert.equal(new URL(resolvePortalReturn(drill,emptyPortalTrail(),undefined,manager).href,"https://example.com").searchParams.has("returnTo"),false));
check("external returnTo uses real parent",()=>assert.equal(resolvePortalReturn(issue+"?returnTo=https%3A%2F%2Fexample.com",emptyPortalTrail(),undefined,manager).href,project));
check("repeated returnTo rejected",()=>assert.equal(resolvePortalReturn(issue+"?returnTo=%2Fdashboard%2Ffinance&returnTo=%2Fdashboard%2Fleave",emptyPortalTrail(),undefined,manager).source,"parent"));
check("same-view self return cannot loop",()=>assert.equal(resolvePortalReturn("/dashboard/finance?tab=payments&returnTo=%2Fdashboard%2Ffinance%3Ftab%3Dpayments",emptyPortalTrail(),undefined,manager).href,home));
check("forbidden explicit Management context ignored for Staff",()=>assert.equal(resolvePortalReturn(portalHrefWithReturnTo(request,filtered,manager),emptyPortalTrail(),undefined,"agent").href,"/dashboard/leave/requests"));
check("invalid destination never becomes a link",()=>assert.equal(portalHrefWithReturnTo("javascript:alert(1)",home,manager),home));
check("trail role restrictions checked at return",()=>assert.equal(resolvePortalReturn(request,recordPortalVisit(recordPortalVisit(emptyPortalTrail(),filtered,"visit",manager),request,"visit",manager),undefined,"agent").href,"/dashboard/leave/requests"));
check("unobserved current route retains previous trusted visit",()=>assert.equal(resolvePortalReturn(issue,recordPortalVisit(emptyPortalTrail(),"/dashboard/operations?view=queue","visit",manager),undefined,manager).href,"/dashboard/operations?view=queue"));
check("explicit parent fallback stays internal",()=>assert.equal(resolvePortalReturn(issue,emptyPortalTrail(),"//example.com",manager).href,project));
check("view keys ignore routine filters",()=>assert.equal(portalViewKey("/dashboard/finance?tab=payments&month=2026-10"),portalViewKey("/dashboard/finance?tab=payments&month=2026-09")));
state=emptyPortalTrail();
for(let index=0;index<100;index++) state=recordPortalVisit(state,index%2?home:"/dashboard/finance","visit",manager);
check("trail is bounded",()=>{assert.equal(state.entries.length,80);assert.equal(state.index,79);});
check("identity change can clear all old URLs",()=>assert.deepEqual(emptyPortalTrail(),{entries:[],index:-1}));
console.log(JSON.stringify({passed:checks.length,checks},null,2));
