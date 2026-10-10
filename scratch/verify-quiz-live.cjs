/** Opt-in Gemini smoke test. Sends only synthetic study material, never user PDFs or saved data. */
const fs = require('fs'), path = require('path'), {JSDOM} = require('jsdom');
if (process.env.HAMSA_QUIZ_LIVE !== '1') {
  console.log('Opt in with HAMSA_QUIZ_LIVE=1 and run Node with --env-file-if-exists=.env. This test spends one Gemini request.');
  process.exit(0);
}
if (!process.env.GEMINI_API_KEY) { console.error('A configured GEMINI_API_KEY is required.'); process.exit(1); }
const model = process.env.HAMSA_QUIZ_MODEL || 'gemini-2.5-flash';
const language = process.env.HAMSA_QUIZ_LANGUAGE || 'ENGLISH';
const count = 20, dom = new JSDOM('', {url:'http://localhost/',runScripts:'outside-only'}), w = dom.window;
w.console = {log(){},warn(){},error(){}}; w.TextEncoder = TextEncoder;
w.localStorage.setItem('hamsa_gemini_api_key',process.env.GEMINI_API_KEY);
const clean = value => String(value || '').replaceAll(process.env.GEMINI_API_KEY,'[REDACTED]');
w.fetch = async (url, init) => {
  if (String(url).endsWith('/status')) return Response.json({configured:false});
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/v1beta/models/')) throw new Error('Unexpected smoke-test destination.');
  const controller = new AbortController(), abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort',abort,{once:true});
  try { return await fetch(url,{...init,signal:controller.signal}); }
  catch(error) { console.error(JSON.stringify({networkError:clean(error.message),cause:clean(error.cause?.code || error.cause?.message)})); throw error; }
  finally { init.signal?.removeEventListener('abort',abort); }
};
w.eval(fs.readFileSync(path.join(__dirname,'../js/ai-client.js'),'utf8'));
w.eval(fs.readFileSync(path.join(__dirname,'../js/quiz-service.js'),'utf8'));
w.geminiService = {getActiveModel:()=>model};
const pages = [
  {pageNumber:1,text:'Motion is a change in position with time. Distance is scalar; displacement is vector. Speed is distance per time; velocity is displacement per time. Acceleration is change in velocity per time. Uniform motion has constant velocity. Newton first law describes inertia. Newton second law is force equals mass times acceleration. Newton third law gives equal opposite forces on different bodies. Force is measured in newtons. Mass is measured in kilograms. Friction opposes relative motion.'},
  {pageNumber:2,text:'Energy is the capacity to do work. The SI unit of energy and work is joule. Work equals force times displacement in the force direction. Kinetic energy equals one half mass times speed squared. Gravitational potential energy equals mass times gravity times height. Energy is conserved. Power is work per time and is measured in watts. Momentum equals mass times velocity and is conserved in an isolated system. Gravity accelerates falling objects. Weight is mass times gravitational acceleration. Pressure is force per area and is measured in pascals.'}
];
const job = {model,source:{type:'PDF',fromPage:1,toPage:2},count,difficulty:'MEDIUM',language,questions:[]};
const payload = w.quizService._payload(job,{count,fromPage:1,toPage:2},pages);
if (process.argv.includes('--legacy-schema')) {
  const schema = payload.generationConfig.responseSchema, question = schema.properties.questions.items.properties;
  Object.assign(schema.properties.questions,{minItems:count,maxItems:count});
  for (const name of ['options','optionExplanations']) Object.assign(question[name],{minItems:4,maxItems:4});
  Object.assign(question.answerIndex,{minimum:0,maximum:3});
  Object.assign(question.sourcePage,{minimum:1,maximum:2});
}
(async()=>{
  try {
    const started = Date.now(), result = {model,language,legacySchema:process.argv.includes('--legacy-schema')};
    const response = await w.aiClient.fetchGenerateContent(model,payload,{forceDirect:true,timeoutMs:90000,stage:'quiz-synthetic-smoke',quotaSafe:true});
    result.status = response.status;
    if (!response.ok) {
      const error = await w.aiClient.createError(response,'gemini');
      Object.assign(result,{providerStatus:error.providerStatus || null,error:clean(error.message),fields:error.invalidFields || []});
    } else {
      const data = await w.aiClient.readResponseJSON(response), candidate = data.candidates?.[0];
      result.finishReason = candidate?.finishReason || null;
      const text = (candidate?.content?.parts || []).filter(part=>!part.thought).map(part=>part.text || '').join('');
      const parsed = JSON.parse(text);
      result.returnedQuestions = parsed.questions?.length || 0;
      try { w.QuizService.validateQuizResponse(parsed,{count,fromPage:1,toPage:2,sourceType:'PDF',requireDetails:true,difficulty:job.difficulty,language}); result.valid = true; }
      catch(error) { result.valid = false; result.validationError = clean(error.message); }
    }
    result.elapsedMs = Date.now()-started;
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 200 && result.valid ? 0 : 1;
  } catch(error) { console.error(JSON.stringify({error:clean(error.message),name:error.name})); process.exitCode = 1; }
  finally { w.close(); }
})();
