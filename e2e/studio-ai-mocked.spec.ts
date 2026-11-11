import { test,expect } from './fixtures';
async function setup(page:any) {
 await page.route('**/api/config', (r:any)=>r.fulfill({json:{dryRun:true,studioAiEnabled:true,studioAiModels:['qa-one','qa-two']}}));
 await page.route('**/api/studio/telemetry',(r:any)=>r.fulfill({status:503,json:{error:'QA telemetry offline'}}));
 await page.goto('/insights');await page.getByRole('button',{name:'Edit report',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message input'})).toBeVisible();
}
test('STUDIO AI model selection and streamed answer tolerate telemetry failure',async({page})=>{
 const message={id:'qa-message',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'QA synthetic Studio answer',annotations:[]}]};
 let requestedModel='';
 await page.route('**/api/studio/ai/responses',async r=>{
 requestedModel=r.request().postDataJSON().model;
 const frames=[{type:'response.output_item.added',item:{...message,content:[]}},{type:'response.output_text.delta',item_id:message.id,delta:'QA synthetic Studio answer'},{type:'response.output_item.done',item:message},{type:'response.completed',response:{id:'qa-response',created_at:0,model:requestedModel,status:'completed',output:[message],usage:{input_tokens:5,output_tokens:5,total_tokens:10}}}];
 await r.fulfill({contentType:'text/event-stream',body:frames.map(f=>'data: '+JSON.stringify(f)+'\n\n').join('')});
 });
 await setup(page);await page.getByRole('button',{name:'Model',exact:true}).click();await page.getByText('qa-two',{exact:true}).click();
 await page.getByRole('textbox',{name:'Message input'}).fill('Reply to this synthetic connectivity test only');await page.getByRole('textbox',{name:'Message input'}).press('Enter');
 await expect(page.getByText('QA synthetic Studio answer',{exact:true})).toBeVisible();expect(requestedModel).toBe('qa-two');
 await page.getByRole('button',{name:'New chat',exact:true}).click();await page.getByRole('dialog').getByText('New chat',{exact:true}).last().click();await expect(page.getByText('QA synthetic Studio answer',{exact:true})).toHaveCount(0);
});
test('STUDIO AI rate limits surface an error without crashing the report',async({page})=>{
 await page.route('**/api/studio/ai/responses',r=>r.fulfill({status:429,json:{error:{message:'QA Studio quota exceeded'}}}));
 await setup(page);await page.getByRole('textbox',{name:'Message input'}).fill('Synthetic quota test');await page.getByRole('textbox',{name:'Message input'}).press('Enter');
 await expect(page.getByText('QA Studio quota exceeded',{exact:false})).toBeVisible();await expect(page.locator('.studio-frame')).toBeVisible();
});
