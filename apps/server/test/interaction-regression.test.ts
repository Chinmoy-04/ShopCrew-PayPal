import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { initDb, db, closeDb } from '../src/db/client.js';
import { resetDatabase } from '../src/db/seed.js';
import { registerRoutes } from '../src/routes/register.js';
import { proposals, actions, auditLog } from '../src/db/schema.js';
import { advanceDay, setAutorun } from '../src/sim/clock.js';
import { rateLimitSimAdvance, enforcePublicResetCooldown } from '../src/routes/demoLimits.js';
const app = Fastify();
beforeAll(async () => {
 process.env.PGLITE_DIR = path.join(os.tmpdir(), `shopcrew-interactions-${crypto.randomUUID()}`);
 await initDb(); await resetDatabase(); await registerRoutes(app); await app.ready();
});
afterAll(async () => { vi.useRealTimers(); await setAutorun(false); await new Promise(r => setTimeout(r, 1300)); await app.close(); await closeDb(); });
async function pending(amount=20) {
 const id=crypto.randomUUID();
 await db().insert(proposals).values({id,agent:'cs',type:'reply',targetRef:'qa',toolName:'send_reply',toolArgsJson:{body:'Synthetic reply'},reasoning:'Synthetic',summary:'Synthetic',amount,status:'pending_approval',correlationId:id,createdAt:new Date().toISOString(),simDay:1});
 return id;
}
it('concurrent approvals claim and execute a proposal once', async () => {
 const id=await pending(); const result=await Promise.all(Array.from({length:4},()=>app.inject({method:'POST',url:`/api/proposals/${id}/approve`,payload:{}})));
 expect(result.filter(r=>r.statusCode===200)).toHaveLength(1);
 expect(result.filter(r=>r.statusCode===409)).toHaveLength(3);
 expect(await db().select().from(actions).where(eq(actions.proposalId,id))).toHaveLength(1);
});
it('approve/reject race has one winner and consistent final state', async () => {
 const id=await pending();const result=await Promise.all(['approve','reject'].map(action=>app.inject({method:'POST',url:`/api/proposals/${id}/${action}`,payload:{}})));
 expect(result.map(r=>r.statusCode).sort()).toEqual([200,409]);
 const [row]=await db().select().from(proposals).where(eq(proposals.id,id));
 expect(['confirmed','rejected']).toContain(row.status);
 const logs=await db().select().from(auditLog).where(eq(auditLog.proposalId,id));
 expect(logs.filter(l=>['proposal.approved','proposal.rejected'].includes(l.event))).toHaveLength(1);
});
it('bulk approvals respect the $50 boundary, mixed states and duplicate IDs', async () => {
 const below=await pending(49.99), exact=await pending(50), above=await pending(50.01), rejected=await pending(1);
 await app.inject({method:'POST',url:`/api/proposals/${rejected}/reject`,payload:{}});
 const r=await app.inject({method:'POST',url:'/api/proposals/approve-selected',payload:{ids:[below,exact,above,rejected,below,'missing'],maxAmount:50}});
 expect(r.json().approved.sort()).toEqual([below,exact].sort());
 expect((await app.inject({method:'POST',url:'/api/proposals/approve-selected',payload:{ids:[],maxAmount:50}})).json()).toEqual({approved:[]});
});
it('an edit racing approval cannot change an already claimed execution amount', async () => {
 const id=await pending(20);
 const [edit,approve]=await Promise.all([
  app.inject({method:'PATCH',url:`/api/proposals/${id}`,payload:{amount:8}}),
  app.inject({method:'POST',url:`/api/proposals/${id}/approve`,payload:{}}),
 ]);
 expect(approve.statusCode).toBe(200);expect([200,409]).toContain(edit.statusCode);
 const [row]=await db().select().from(proposals).where(eq(proposals.id,id));expect(row.amount).toBe(edit.statusCode===200?8:20);
 const logs=await db().select().from(auditLog).where(eq(auditLog.proposalId,id));
 expect(logs.find(log=>log.event==='proposal.approved')?.message).toContain(`$${row.amount?.toFixed(2)}`);
 expect((await app.inject({method:'PATCH',url:`/api/proposals/${id}`,payload:{amount:1}})).statusCode).toBe(409);
});
for (const [field,max] of Object.entries({autoApproveMax:500,dailyBudget:5000,maxPctOfOrder:1,maxPriceChangePct:100,minMarginPct:100})) {
 it(`policy ${field} validates values and persists its exact boundary`, async () => {
  for(const value of [-1,'text',null,max+1]) expect((await app.inject({method:'PUT',url:'/api/policies/cs',payload:{[field]:value}})).statusCode).toBe(422);
  const r=await app.inject({method:'PUT',url:'/api/policies/cs',payload:{[field]:max}});expect(r.statusCode).toBe(200);expect(r.json()[field]).toBe(max);
 });
}
it('advance limiter and public reset cooldown recover at exact time boundaries', () => {
 vi.useFakeTimers();try {
 vi.setSystemTime(100000);const ip=crypto.randomUUID();for(let i=0;i<6;i++)rateLimitSimAdvance(ip);expect(()=>rateLimitSimAdvance(ip)).toThrow(/max 6/);
 enforcePublicResetCooldown(ip);expect(()=>enforcePublicResetCooldown(ip)).toThrow(/cooldown/);
 vi.setSystemTime(160000);expect(()=>rateLimitSimAdvance(ip)).not.toThrow();expect(()=>enforcePublicResetCooldown(ip)).not.toThrow();
 }finally{vi.useRealTimers();}
});
it('seven scripted days reproduce the same proposal inputs after reset', async () => {
 async function run() {await resetDatabase();for(let day=1;day<=7;day++)expect((await advanceDay()).simDay).toBe(day);
 return (await db().select().from(proposals)).filter(p=>p.simDay>=1).map(p=>({day:p.simDay,type:p.type,amount:p.amount,summary:p.summary})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
 const first=await run();expect(new Set(first.map(p=>p.day)).size).toBe(7);expect(first.some(p=>p.day===1&&p.type==='refund'&&p.amount===8)).toBe(true);expect(await run()).toEqual(first);
},90000);

for(const unclaimed of [false,true]) it(`DRY payout ${unclaimed?'unclaimed cancellation':'success'} preserves correct state`,async()=>{
 const { paypal }=await import('../src/paypal/rest.js');expect(paypal.configured()).toBe(false);
 const { executeProposal }=await import('../src/executor/executor.js');
 const { rollbackProposal }=await import('../src/executor/rollback.js');
 const { payouts }=await import('../src/db/schema.js');
 const { applyPayPalEvent }=await import('../src/paypal/events.js');
 const id=crypto.randomUUID();await db().insert(proposals).values({id,agent:'inventory',type:'payout',targetRef:'qa',toolName:'pay_supplier',toolArgsJson:{amount:'1.00',receiver:unclaimed?'unclaimed@qa.invalid':'supplier@qa.invalid'},reasoning:'Synthetic',summary:'Synthetic payout',amount:1,status:'approved',correlationId:id,createdAt:new Date().toISOString(),simDay:1});
 await executeProposal(id,'owner');
 await expect.poll(async()=>(await db().select().from(proposals).where(eq(proposals.id,id)))[0].status,{timeout:5000}).toBe('confirmed');
 const [payout]=await db().select().from(payouts).where(eq(payouts.proposalId,id));expect(payout.status).toBe(unclaimed?'UNCLAIMED':'SUCCESS');
 const result=await rollbackProposal(id);expect(result.status).toBe(unclaimed?'rolled_back':'rollback_failed');
 if(unclaimed){await applyPayPalEvent({id:crypto.randomUUID(),event_type:'PAYMENT.PAYOUTS-ITEM.UNCLAIMED',resource:{payout_item_id:payout.payoutItemId},dryRun:true},true);expect((await db().select().from(payouts).where(eq(payouts.id,payout.id)))[0].status).toBe('CANCELED');}
});
it('external webhook cannot claim to be an internal dry-run event',async()=>{
 const { orders }=await import('../src/db/schema.js');const [order]=await db().select().from(orders);
 await db().update(orders).set({confirmedAt:null}).where(eq(orders.id,order.id));
 const response=await app.inject({method:'POST',url:'/api/paypal/webhooks',payload:{id:crypto.randomUUID(),event_type:'PAYMENT.CAPTURE.COMPLETED',dryRun:true,resource:{id:order.paypalCaptureId}}});
 expect(response.statusCode).toBe(200);expect((await db().select().from(orders).where(eq(orders.id,order.id)))[0].confirmedAt).toBeNull();
});

it('autorun advances on schedule and Stop prevents further days',async()=>{
 const { simState }=await import('../src/db/schema.js');const { agentsRunning }=await import('../src/sim/clock.js');
 const [before]=await db().select().from(simState);vi.useFakeTimers();
 try {
 await setAutorun(true);await vi.advanceTimersByTimeAsync(20000);
 await vi.waitFor(async()=>{expect(agentsRunning()).toBe(false);expect((await db().select().from(simState))[0].simDay).toBe(before.simDay+1);},{timeout:10000});
 await setAutorun(false);await vi.advanceTimersByTimeAsync(30000);expect((await db().select().from(simState))[0].simDay).toBe(before.simDay+1);
 }finally{await setAutorun(false);vi.useRealTimers();}
});
