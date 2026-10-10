/** Isolated local quiz UI preview with synthetic profile/content; never calls an external provider. */
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..'),port=Number(process.env.HAMSA_QUIZ_PREVIEW_PORT || 3315);
let requestNumber=0;
const bootstrap=`(()=>{
  localStorage.setItem('hamsa_auth_mode','GUEST');localStorage.setItem('hamsa_sound_enabled','false');
  localStorage.setItem('hamsa_exam_profile',JSON.stringify({fullName:'Quiz Preview',dateOfBirth:'2001-03-12',category:'GENERAL',qualificationId:'GRADUATION',domicile:'Delhi',gender:'MALE',score:75,tenthPercentage:80,twelfthPercentage:80,education:[{level:'GRADUATION',score:75,scoreType:'PERCENTAGE'}]}));
  const originalFetch=fetch.bind(window);window.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);return url.origin===location.origin?originalFetch(input,options):Promise.resolve(new Response('{}',{status:503}));};
})()`;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:'+port),pathname=decodeURIComponent(url.pathname);
  res.setHeader('Cache-Control','no-store');
  if(pathname.startsWith('/api/')){
    res.setHeader('Content-Type','application/json');
    if(pathname==='/api/live-exams')return res.end(JSON.stringify({success:true,exams:[],source:'ISOLATED_PREVIEW',timestamp:new Date().toISOString()}));
    if(pathname==='/api/gemini/status')return res.end(JSON.stringify({configured:true,models:['gemini-2.5-flash'],defaultModel:'gemini-2.5-flash'}));
    if(req.method==='POST'&&/^\/api\/gemini\/gemini-/.test(pathname)){
      const buffers=[];for await(const chunk of req){buffers.push(chunk);if(buffers.reduce((n,b)=>n+b.length,0)>2500000){res.statusCode=413;res.end('{}');return;}}
      const body=JSON.parse(Buffer.concat(buffers).toString()),prompt=body.contents?.[0]?.parts?.[0]?.text || '',count=Number(prompt.match(/Create exactly (\d+)/)?.[1] || 1),number=++requestNumber;
      const delay = Math.min(30000,Math.max(0,Number(process.env.HAMSA_QUIZ_PREVIEW_DELAY_MS) || 0));
      if (delay) await new Promise(resolve=>setTimeout(resolve,delay));
      if (prompt.includes('PREVIEW_ERROR')) { res.statusCode=503; return res.end(JSON.stringify({error:{message:'Preview provider is temporarily unavailable. Your source is saved. Resume when ready.',status:'UNAVAILABLE'}})); }
      const bilingual=/bilingually/.test(prompt),pair=(english,hindi)=>bilingual?english+'\n'+hindi:english,sourcePage=Number(prompt.match(/sourcePage between (\d+) and (\d+)/)?.[1])||null;
      const difficulty = prompt.match(/Difficulty: (\w+)/)?.[1] || 'MEDIUM';
      const value={title:pair('Energy practice preview','ऊर्जा अभ्यास'),questions:Array.from({length:count},(_,i)=>({question:pair(`Energy question ${number}-${i+1}: what does a moving body possess?`,`ऊर्जा प्रश्न ${number}-${i+1}: गतिशील वस्तु में क्या होता है?`),options:[pair('Kinetic energy','गतिज ऊर्जा'),pair('Rest only','केवल विराम'),pair('No energy','ऊर्जा नहीं'),pair('Massless state','द्रव्यमान रहित अवस्था')],answerIndex:0,explanation:pair('Motion gives the body kinetic energy.','गति से वस्तु को गतिज ऊर्जा मिलती है।'),optionExplanations:[pair('Motion stores kinetic energy.','गति में गतिज ऊर्जा होती है।'),pair('The body is moving.','वस्तु गतिशील है।'),pair('A moving body has energy.','गतिशील वस्तु में ऊर्जा होती है।'),pair('Motion does not remove mass.','गति से द्रव्यमान समाप्त नहीं होता।')],difficulty:['EASY','MEDIUM','HARD'][i%3],topic:'Energy',...(sourcePage?{sourcePage}:{})}))};
      for (let i=0;i<value.questions.length;i++) value.questions[i].difficulty=difficulty === 'MIXED' ? ['EASY','MEDIUM','HARD'][i%3] : difficulty;
      console.log('MOCK quiz request '+number+': '+count+' questions'+(bilingual?' bilingual':''));
      return res.end(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}],usageMetadata:{promptTokenCount:200,candidatesTokenCount:400,totalTokenCount:600}}));
    }
    res.statusCode=503;return res.end('{}');
  }
  const publicPath=pathname==='/'?'/index.html':pathname;
  if(!/^\/(?:index\.html|manifest\.webmanifest|sw\.js|(?:assets|js|css)\/)/.test(publicPath)){res.statusCode=404;return res.end();}
  const filename=path.resolve(root,'.'+publicPath);if(!filename.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  try{const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ttf':'font/ttf'};res.setHeader('Content-Type',mime[path.extname(filename)]||'application/octet-stream');let contents=fs.readFileSync(filename);if(publicPath==='/index.html')contents=contents.toString().replace('<head>','<head><script>'+bootstrap+'</script>');res.end(contents);}
  catch{res.statusCode=404;res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log('Synthetic quiz preview: http://127.0.0.1:'+port+'/#quiz'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
