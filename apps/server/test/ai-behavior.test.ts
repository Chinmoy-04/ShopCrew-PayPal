import { afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({text:vi.fn(),object:vi.fn()}));
vi.mock('ai',()=>({generateText:mocks.text,generateObject:mocks.object,jsonSchema:(schema:unknown)=>schema}));
import { narrate,chooseTool,completeObject } from '../src/agents/llm.js';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
function live(){vi.stubEnv('LLM_PROVIDER','groq');vi.stubEnv('GROQ_API_KEY','synthetic-key');vi.stubEnv('LLM_FALLBACK_PROVIDER','groq');}
const fallback={action:'send_reply' as const,reasoning:'Stored safe response',confidence:0.5};
it('live narration returns the provider text',async()=>{live();mocks.text.mockResolvedValue({text:'Synthetic model answer'});expect(await narrate('Synthetic','Synthetic','fallback')).toBe('Synthetic model answer');});
it('rate-limited narration falls back safely',async()=>{live();mocks.text.mockRejectedValue(new Error('429 quota'));expect(await narrate('Synthetic','Synthetic','fallback')).toBe('fallback');});
it('malformed tool choice cannot escape schema validation',async()=>{live();mocks.object.mockResolvedValue({object:{action:'arbitrary_payment',amount:-1}});expect(await chooseTool('Synthetic','Synthetic',fallback)).toEqual(fallback);});
it('structured-output failure uses the supplied fallback',async()=>{live();mocks.object.mockRejectedValue(new Error('Malformed response'));expect(await completeObject('Synthetic','Synthetic',{type:'object'},{safe:true})).toEqual({safe:true});});
