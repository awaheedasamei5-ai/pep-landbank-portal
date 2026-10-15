/* Synthetic business-rule checks. No Supabase connection or SMS is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(compiled.outputText, filename);
};

const root = path.resolve(__dirname, '../..');
const {leaveDaysRemaining,leaveDaysReserved,leaveDaysConfirmedUsed,leaveIsBlocking} = require(path.join(root, 'src/webnext/features/leave/lib/leaveLogic.ts'));
const {classifyProviderResponse} = require(path.join(root, 'supabase/functions/process-leave-sms-outbox/delivery.ts'));
const {leaveSelectionYear,requireLeaveSelectionYear,leaveWeekdaysInRange} = require(path.join(root, 'src/webnext/features/leave/lib/leaveDates.ts'));

assert.equal(leaveSelectionYear(['2027-01-01','2027-12-31']),2027);
assert.equal(leaveSelectionYear(['2026-12-31','2027-01-01']),null,'Do not pool two annual allowances in one request');
assert.equal(leaveSelectionYear(['2026-02-30']),null,'Reject impossible dates');
assert.equal(leaveSelectionYear(['2028-02-29']),2028,'Leap days are valid');
assert.throws(()=>requireLeaveSelectionYear([]),/one calendar year/);
assert.deepEqual(leaveWeekdaysInRange('2026-10-16','2026-10-19'),['2026-10-16','2026-10-19']);
assert.deepEqual(leaveWeekdaysInRange('2026-12-31','2027-01-04'),[]);
assert.deepEqual(leaveWeekdaysInRange('2026-10-19','2026-10-16'),[]);
assert.deepEqual(leaveWeekdaysInRange('invalid','2026-10-16'),[]);
assert.ok(leaveWeekdaysInRange('2028-01-01','2028-12-31').length <= 262,'Emergency range calculation is bounded to one year');

const request = (patch = {}) => ({agentKey:'staff-a',year:2026,status:'planned',dates:['2026-10-01'],daysCount:3,deductQuota:true,usedConfirmedAt:null,...patch});
const records = [
  request(), request({status:'pending',daysCount:4}), request({status:'approved',daysCount:2}),
  request({status:'rescheduled',daysCount:5}), request({status:'declined',daysCount:8}),
  request({agentKey:'staff-b',daysCount:20}), request({year:2027,daysCount:20}),
  request({status:'approved',deductQuota:false,daysCount:6}),
];
assert.equal(leaveDaysReserved(records,'staff-a',2026),14,'Only the individual current-year reservations consume their allowance');
assert.equal(leaveDaysRemaining({leaveTotalDays:20},records,'staff-a',2026),6);
assert.equal(leaveDaysRemaining({leaveTotalDays:25},records,'staff-a',2026),11,'The shared company setting must change each individual balance');
assert.equal(leaveDaysRemaining({leaveTotalDays:0},[],'staff-a',2026),0,'A configured zero must not fall back to 20');
assert.equal(leaveDaysRemaining({leaveTotalDays:20},records,'staff-b',2026),0,'Another employee receives a separate annual allowance');
assert.equal(leaveDaysReserved(records,'staff-a',2027),20,'The next calendar year has its own reservations');
assert.equal(leaveDaysReserved([request({status:'rescheduled',daysCount:5})],'staff-a',2026),leaveDaysReserved([request({status:'pending',daysCount:5,dates:['2026-12-01']})],'staff-a',2026),'Responding to a reschedule must retain the reserved days');
assert.equal(leaveIsBlocking('rescheduled'),true);
assert.equal(leaveDaysConfirmedUsed([
  request({status:'approved',daysCount:2,usedConfirmedAt:'2026-10-02T10:00:00Z'}),
  request({status:'approved',daysCount:6,deductQuota:false,usedConfirmedAt:'2026-10-02T10:00:00Z'}),
  request({status:'approved',daysCount:3,dates:['2026-12-01'],usedConfirmedAt:'2026-10-02T10:00:00Z'}),
  request({status:'approved',daysCount:4}),
],'staff-a',2026,'2026-10-15'),2,'Only past, confirmed annual-quota leave contributes to confirmed usage');

const phone = '233200000000';
assert.equal(classifyProviderResponse(200,{status:'success',data:{id:'provider-1'}},phone).providerReference,'provider-1');
assert.equal(classifyProviderResponse(200,{status:'success',data:[{recipient:phone,id:'provider-2'}]},phone).status,'accepted');
assert.equal(classifyProviderResponse(200,{status:'success',data:[{recipient:'233200000001',id:'wrong-recipient'}]},phone).status,'needs_review');
assert.equal(classifyProviderResponse(200,{status:'error'},phone).status,'needs_review','HTTP 200 alone cannot prove acceptance');
assert.equal(classifyProviderResponse(200,null,phone).status,'needs_review');
assert.equal(classifyProviderResponse(429,{status:'error'},phone).status,'queued','An explicit rate-limit rejection can be retried');
assert.equal(classifyProviderResponse(429,{status:'success',data:{id:'uncertain'}},phone).status,'needs_review');
assert.equal(classifyProviderResponse(402,{status:'error'},phone).status,'failed','Insufficient funds needs attention, not automatic duplicate sends');
assert.equal(classifyProviderResponse(422,{status:'error'},phone).status,'failed');
assert.equal(classifyProviderResponse(408,{status:'error'},phone).status,'needs_review','A timeout may follow provider acceptance');
assert.equal(classifyProviderResponse(500,{status:'error'},phone).status,'needs_review','An ambiguous server failure must not trigger a second SMS');
console.log('Leave business-rule checks passed: per-staff yearly allowance, exemptions, rescheduling, usage, and SMS outcome classification.');
