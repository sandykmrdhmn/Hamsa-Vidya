/** Quiz validation and source matching shared by generation, preview and storage. */
class QuizQuality {
  static text(value) { return typeof value === 'string' ? value.trim() : ''; }
  static skippedPdfNote(pages) {
    if(!Array.isArray(pages))return '';
    const groups=new Map();
    for(const page of pages) {
      if(!Number.isSafeInteger(page?.pageNumber)||page.pageNumber<1)continue;
      const reason=this.text(page.reason)||'Unreadable page';
      if(!groups.has(reason))groups.set(reason,new Set());
      groups.get(reason).add(page.pageNumber);
    }
    if(!groups.size)return '';
    return `PDF source note — skipped pages: ${Array.from(groups,([reason,numbers])=>`${Array.from(numbers).sort((a,b)=>a-b).join(', ')} (${reason})`).join('; ')}. Quiz questions use only the remaining readable pages. Page numbers refer to the original PDF.`;
  }
  static plain(value) { return String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim(); }
  static stem(value) { return this.answerIdentity(this.plain(value)); }

  // Option identity must preserve mathematical signs, decimals and type names.
  static answerIdentity(value) {
    const text = String(value ?? '').normalize('NFC').trim()
      .replace(/\u2212/g, '-').replace(/\s+/g, ' ');
    return this.isTechnicalAnswer(text) ? text : text.toLocaleLowerCase();
  }
  static isTechnicalAnswer(text) {
    if (/[\d_^=<>\\{}+*/-]|[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/u.test(text) || /^[A-Za-z]{1,2}$/.test(text) || /[a-z][A-Z]/.test(text)) return true;
    this._elementSymbols ||= new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' '));
    return (text.match(/\b[A-Z][A-Za-z]*\b/g) || []).some(word => /^(?:[A-Z][a-z]?)+$/.test(word) && word.match(/[A-Z][a-z]?/g).every(symbol => this._elementSymbols.has(symbol)));
  }

  static format(value) {
    return window.StudyFormat ? StudyFormat.format(value) : SecurityUtils.escapeHtml(String(value ?? '')).replace(/\n/g, '<br>');
  }
  static distribution(questions) {
    const topics = new Map(), difficulties = new Map();
    for (const q of questions) {
      const topic = this.text(q.topic) || 'Unspecified topic';
      const difficulty = ['EASY','MEDIUM','HARD'].includes(q.difficulty) ? q.difficulty : 'Unspecified difficulty';
      topics.set(topic, (topics.get(topic) || 0) + 1);
      difficulties.set(difficulty, (difficulties.get(difficulty) || 0) + 1);
    }
    return { topics: Object.fromEntries(topics), difficulties: Object.fromEntries(difficulties) };
  }
  static distributionHtml(questions) {
    const d = this.distribution(questions), e = SecurityUtils.escapeHtml;
    return `<details class="quiz-distribution"><summary>Topic & difficulty coverage · ${questions.length} questions</summary><p>Question distribution; this does not claim complete syllabus coverage.</p><div class="quiz-topic-list">${Object.entries(d.topics).map(([topic,n])=>`<div><span>${e(topic)}</span><strong>${n}</strong></div>`).join('')}</div><p>${Object.entries(d.difficulties).map(([level,n])=>`${e(level)}: ${n}`).join(' · ')}</p></details>`;
  }
  static parse(raw) {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;
    let clean = raw.trim();
    const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) clean = fenced[1].trim();
    try { return JSON.parse(clean); } catch { /* Try a JSON object surrounded by prose. */ }
    const starts = [clean.indexOf('{'), clean.indexOf('[')].filter(index => index >= 0).sort((a,b) => a-b);
    for (const start of starts) {
      const end = clean.lastIndexOf(clean[start] === '{' ? '}' : ']');
      if (end > start) { try { return JSON.parse(clean.slice(start, end + 1)); } catch {} }
    }
    return null;
  }

  static normalize(question, { extraction = false } = {}) {
    if (!question || typeof question !== 'object') return null;
    const questionText = this.text(question.questionText || question.question || question.stem);
    let options = question.options ?? question.choices;
    if (options && !Array.isArray(options) && typeof options === 'object') {
      const keys = ['A','B','C','D'].filter(key => Object.hasOwn(options, key));
      options = keys.length ? keys.map(key => options[key]) : Object.values(options);
    }
    if (!questionText || !Array.isArray(options) || ![2,4].includes(options.length)) return null;
    options = options.map(option => this.text(option));
    if (options.some(option => !option || /^(?:option\s*[a-d1-4]|placeholder|tbd|n\/a|undefined|null)$/i.test(option)) || new Set(options.map(option => this.answerIdentity(option))).size !== options.length) return null;
    let index = null;
    const answer = question.correctAnswerIndex ?? question.correctAnswer ?? question.answer;
    if (typeof answer === 'number' || (typeof answer === 'string' && /^\d+$/.test(answer.trim()))) index = Number(answer);
    else if (typeof answer === 'string') {
      const letter = answer.trim().match(/^\(?([A-D])\)?[.)]?$/i);
      index = letter ? letter[1].toUpperCase().charCodeAt(0)-65 : options.findIndex(option => this.answerIdentity(option) === this.answerIdentity(answer));
    }
    if (!Number.isInteger(index) || index < 0 || index >= options.length) return null;
    const explanation = this.text(question.explanation || question.rationale);
    if (!explanation && !extraction) return null;
    const sourcePage = Number(question.sourcePage);
    return { ...question, questionText, options, correctAnswerIndex: index,
      explanation: explanation || 'Answer copied from the source key. The source did not include a detailed explanation.',
      sourcePage: Number.isInteger(sourcePage) && sourcePage > 0 ? sourcePage : null,
      topic: this.text(question.topic) || '', evidenceQuote: this.text(question.evidenceQuote),
      optionExplanations: Array.isArray(question.optionExplanations) ? options.map((_,i) => this.text(question.optionExplanations[i])) : [],
      memoryCue: this.text(question.memoryCue), sourceRefs: Array.isArray(question.sourceRefs) ? question.sourceRefs : [] };
  }

  static validate(question) {
    const normalized = this.normalize(question);
    if (!normalized) return 'A question needs a clear stem, 2 or 4 distinct options, a valid answer key and an explanation.';
    if (normalized.questionText.length > 15000 || normalized.options.some(option => option.length > 5000)) return 'Question or options are too long.';
    return null;
  }

  static result(raw, subject = 'General Study', title = 'Practice Quiz', options = {}) {
    const parsed = this.parse(raw);
    if (!parsed) return null;
    if (parsed.found === false) return { found: false, questions: [], invalidCount: 0 };
    const list = Array.isArray(parsed) ? parsed : parsed.questions || parsed.mcqs || parsed.data || (Array.isArray(parsed.quiz) ? parsed.quiz : parsed.quiz?.questions);
    if (!Array.isArray(list)) return null;
    const normalized = list.map(question => this.normalize(question, options));
    return { title: this.text(parsed.title || parsed.quiz?.title) || title, subject: this.text(parsed.subject) || subject,
      found: parsed.found, questions: normalized.filter(Boolean), invalidCount: normalized.filter(question => !question).length };
  }

  static unique(questions) {
    const seen = new Map(), conflicts = new Set();
    for (const question of questions) {
      const stem = this.stem(question.questionText);
      if (!stem) continue;
      const prior = seen.get(stem);
      if (prior && this.answerIdentity(prior.options[prior.correctAnswerIndex]) !== this.answerIdentity(question.options[question.correctAnswerIndex])) conflicts.add(stem);
      else if (!prior) seen.set(stem, question);
    }
    return [...seen].filter(([stem]) => !conflicts.has(stem)).map(([,question]) => question);
  }

  static fingerprint(questions) {
    const text = JSON.stringify(questions.map(q => [q.id, q.questionText, q.options, q.correctAnswerIndex]));
    return this.hash(text);
  }
  static hash(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(16);
  }

  static sourcePages(content, pages = []) {
    if (pages.length) return pages.filter(page => typeof page.text === 'string' && Number.isInteger(Number(page.pageNumber)) && Number(page.pageNumber)>0).map(page => ({ pageNumber: Number(page.pageNumber), text: page.text, fileName: String(page.fileName || '') }));
    const found = [...String(content || '').matchAll(/--- \[PAGE (\d+) START\] ---\s*([\s\S]*?)\s*--- \[PAGE \1 END\] ---/g)];
    return found.length ? found.map(match => ({ pageNumber: Number(match[1]), text: match[2] })) : [];
  }

  static chunks(content, pages = [], limit = 18000) {
    const units = pages.length ? pages.map(page => ({ text: page.text, pageNumber: page.pageNumber })) : [{ text: String(content || ''), pageNumber: null }];
    const chunks = []; let current = { text: '', pages: [] };
    const flush = () => { if (current.text.trim()) chunks.push(current); current = { text: '', pages: [] }; };
    for (const unit of units) {
      for (let offset = 0; offset < unit.text.length; offset += limit) {
        const part = unit.text.slice(offset, offset + limit);
        const labeled = unit.pageNumber ? `[PAGE ${unit.pageNumber}]\n${part}\n` : part;
        if (current.text.length + labeled.length > limit && current.text) flush();
        current.text += labeled;
        if (unit.pageNumber && !current.pages.includes(unit.pageNumber)) current.pages.push(unit.pageNumber);
      }
    }
    flush(); return chunks;
  }

  static ground(question, pages, notes = '') {
    if (!pages.length) {
      const quote = this.plain(question.evidenceQuote);
      if (notes.trim() && (quote.length < 12 || !this.plain(notes).includes(quote))) return null;
      return { ...question, sourcePage: null, evidenceQuote: notes.trim() ? question.evidenceQuote : '', sourceRefs: [], sourceMatched: Boolean(notes.trim()) };
    }
    const quote = this.plain(question.evidenceQuote);
    const page = pages.find(item => item.pageNumber === question.sourcePage);
    if (!page || quote.length < 12 || !this.plain(page.text).includes(quote)) return null;
    return { ...question, sourceMatched: true, sourceRefs: [{ page: page.pageNumber, fileName: page.fileName || '' }] };
  }

  static decimalDigits(value) { return String(value ?? '').replace(/[०-९]/g, digit=>String(digit.charCodeAt(0)-0x0966)); }
  static abort(signal) { if (signal?.aborted) throw new DOMException('Generation cancelled.', 'AbortError'); }
  static keyMatches(question) {
    const quote=this.decimalDigits(this.plain(question.keyEvidenceQuote));
    const letters=['A','B','C','D','क','ख','ग','घ'];
    const number=this.decimalDigits(question.sourceQuestionNumber||'').trim();
    let token=null;
    if (/^\d+$/.test(number)) {
      const entries = [...quote.matchAll(new RegExp(`(?:^|[\\s;])(?:(?:Q(?:uestion)?|प्रश्न)[.\\s]*)?${number}\\s*[).:=—-]?\\s*[([]?\\s*([A-Dकखगघ])(?=[).\\s;]|$)`,'giu'))];
      const keys = new Set(entries.map(entry => letters.indexOf(entry[1].toUpperCase())%4));
      if (keys.size !== 1) return false;
      return [...keys][0]===question.correctAnswerIndex;
    } else {
      token = quote.match(/^(?:(?:Q(?:uestion)?|प्रश्न)[.\s]*)?\d+\s*[).:=—-]\s*[([]?\s*([A-Dकखगघ])[).\s]*$/iu)?.[1];
      token ||= quote.match(/(?:ans(?:wer)?|correct\s*(?:answer|option)|उत्तर|सही\s*विकल्प)\s*[.:=—-]?\s*[([]?\s*([A-Dकखगघ])(?:[).\s]|$)/iu)?.[1];
    }
    if(token) return letters.indexOf(token.toUpperCase())%4===question.correctAnswerIndex;
    // Text keys are allowed only when one complete option is explicitly identified.
    const text=quote.replace(/^(?:ans(?:wer)?|उत्तर)\s*[.:=—-]\s*/iu,'');
    const matches=question.options.map((option,index)=>({index,match:this.answerIdentity(option)===this.answerIdentity(text)})).filter(item=>item.match);
    return matches.length===1 && matches[0].index===question.correctAnswerIndex;
  }
  static printedOptionsTail(question, text) {
    const normalize=value=>this.decimalDigits(this.plain(value));
    let rest=normalize(text);
    const labels=[['A','क'],['B','ख'],['C','ग'],['D','घ']];
    for(let index=0;index<question.options.length;index++) {
      const alternatives=labels[index]?.join('|');if(!alternatives)return null;
      const label=new RegExp(`^(?:[([]\\s*(?:${alternatives})\\s*[)\\]]|(?:${alternatives})\\s*[).:])\\s*`,'iu');
      const printed=rest.match(label);if(!printed)return null;
      rest=rest.slice(printed[0].length);
      const option=normalize(question.options[index]).replace(label,'');
      if(!option || !rest.startsWith(option))return null;
      rest=rest.slice(option.length).trimStart();
    }
    return rest;
  }
  static numberedSourceSupported(question, pages) {
    const number=Number(this.decimalDigits(question.sourceQuestionNumber));
    const source=pages.find(page=>page.pageNumber===Number(question.sourcePage));
    if(!source || !Number.isSafeInteger(number) || number<1)return false;
    const normalize=value=>this.decimalDigits(this.plain(value));
    const questionLabel=new RegExp(`^(?:(?:Q(?:uestion)?|प्रश्न)[.\\s]*)?${number}\\s*[).:=—-](?!\\d)\\s*`,'iu');
    const stem=normalize(question.questionText).replace(questionLabel,'');
    const primary=normalize(source.text),quote=normalize(question.evidenceQuote);
    if(!stem || !quote || !primary.includes(quote))return false;
    const markers=text=>[...text.matchAll(/(?:^|\s)(?:(?:Q(?:uestion)?|प्रश्न)[.\s]*)?(\d+)\s*[).:=—-](?!\d)\s*/giu)]
      .map(match=>({number:Number(match[1]),start:match.index,body:match.index+match[0].length}));
    const quoteAt=primary.indexOf(quote);
    const starts=markers(primary).filter(marker=>marker.number===number && quoteAt>=marker.start && quoteAt<=marker.body);
    if(starts.length!==1)return false;
    const start=starts[0];
    if(quoteAt<start.start || quoteAt>=start.body+stem.length)return false;
    // Continue only into the next original page(s); a skipped page or printed
    // answer-key section cannot supply missing options for this question.
    let text=primary;
    for(let pageNumber=source.pageNumber+1;pageNumber<=source.pageNumber+2 && text.length-start.body<40000;pageNumber++) {
      const next=pages.find(page=>page.pageNumber===pageNumber);
      if(!next || /answer\s*key|उत्तर\s*(?:कुंजी|माला)/iu.test(next.text))break;
      text+=' '+normalize(next.text);
    }
    const next=markers(text).find(marker=>marker.start>=start.body);
    const span=text.slice(start.body,Math.min(next?.start??text.length,start.body+40000));
    if(!span.startsWith(stem))return false;
    const rest=this.printedOptionsTail(question,span.slice(stem.length));
    if(rest===null)return false;
    // A shortened last option must not match a longer printed answer by prefix.
    if(rest && !/^(?:ans(?:wer)?|correct\s*(?:answer|option)|उत्तर|सही\s*विकल्प|explanation|व्याख्या)(?=\s|[.:=—-])/iu.test(rest))return false;
    // Reused numbering in different question sections makes a separate key
    // ambiguous even when both sections happen to print the same answer letter.
    if(Number(question.sourcePage)!==Number(question.keySourcePage)) {
      const numbered=pages.filter(page=>!/answer\s*key|उत्तर\s*(?:कुंजी|माला)/iu.test(page.text))
        .flatMap(page=>markers(normalize(page.text))).filter(marker=>marker.number===number);
      if(numbered.length!==1)return false;
    }
    return true;
  }
  static sourceKeySupported(question, pages) {
    const number=Number(this.decimalDigits(question.sourceQuestionNumber));
    const source=pages.find(p=>p.pageNumber===Number(question.sourcePage));
    const key=pages.find(p=>p.pageNumber===Number(question.keySourcePage));
    const quote=this.plain(question.evidenceQuote),entry=this.plain(question.keyEvidenceQuote);
    if(!source || !key || !entry || !this.plain(key.text).includes(entry))return false;
    // An unnumbered inline key is supported only when every printed option
    // occurs in order and the explicit answer follows the final option directly.
    if(source.pageNumber===key.pageNumber && /^(?:ans(?:wer)?|correct\s*(?:answer|option)|उत्तर|सही\s*विकल्प)(?=\s|[.:=—(-])/iu.test(entry) && this.keyMatches({...question,sourceQuestionNumber:null})) {
      const text=this.plain(source.text),quoteStart=text.indexOf(quote);
      const stem=this.plain(question.questionText),stemStart=text.indexOf(stem,Math.max(0,quoteStart));
      if(quoteStart>=0 && stemStart>=quoteStart && stemStart<=quoteStart+quote.length) {
        const label=new RegExp(`^(?:(?:Q(?:uestion)?|प्रश्न)[.\\s]*)?${number}\\s*[).:=—-]`,'iu');
        const before=new RegExp(`(?:^|\\s)(?:(?:Q(?:uestion)?|प्रश्न)[.\\s]*)?${number}\\s*[).:=—-]\\s*$`,'iu');
        if(Number.isSafeInteger(number) && number>0 && (label.test(this.decimalDigits(quote)) || before.test(this.decimalDigits(text.slice(0,quoteStart)))) && !this.numberedSourceSupported(question,pages))return false;
        const tail=this.printedOptionsTail(question,text.slice(stemStart+stem.length,stemStart+40000));
        const normalizedEntry=this.decimalDigits(entry);
        if(tail!==null && tail.startsWith(normalizedEntry) && (!tail.slice(normalizedEntry.length) || /^[\s;.,:—-]/u.test(tail.slice(normalizedEntry.length))))return true;
      }
    }
    if(!Number.isSafeInteger(number) || number<1 || !this.keyMatches(question))return false;
    const text=this.plain(source.text),index=text.indexOf(quote);
    if(index<0)return false;
    // The claimed question number must be printed immediately with its quotation.
    const start=new RegExp(`^(?:(?:Q(?:uestion)?|प्रश्न)[.\\s]*)?${number}\\s*[).:=—-]`,'iu');
    const before=new RegExp(`(?:^|\\s)(?:(?:Q(?:uestion)?|प्रश्न)[.\\s]*)?${number}\\s*[).:=—-]\\s*$`,'iu');
    if(!start.test(this.decimalDigits(quote)) && !before.test(this.decimalDigits(text.slice(0,index))))return false;
    if(!this.numberedSourceSupported(question,pages))return false;
    // Separate answer-key sections can reuse numbering. Conflicting mappings
    // without an inline question/key relationship must be excluded.
    if(source.pageNumber!==key.pageNumber) {
      const keys=new Set();
      for(const page of pages.filter(p=>/answer\s*key|उत्तर\s*(?:कुंजी|माला)/iu.test(p.text))) {
        const pattern=new RegExp(`(?:^|[\\s;])(?:(?:Q(?:uestion)?|प्रश्न)[.\\s]*)?${number}\\s*[).:=—-]\\s*[([]?\\s*([A-Dकखगघ])(?=[).\\s;]|$)`,'giu');
        for(const match of this.decimalDigits(this.plain(page.text)).matchAll(pattern))keys.add(['A','B','C','D','क','ख','ग','घ'].indexOf(match[1].toUpperCase())%4);
      }
      if(keys.size>1)return false;
    }
    return true;
  }
  static wait(ms, signal) {
    this.abort(signal);
    return new Promise((resolve,reject) => {
      const onAbort = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(new DOMException('Generation cancelled.', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  static preview(questions) {
    return questions.map((question,index) => ({ index, error: this.validate(question) })).filter(item => item.error);
  }
}
window.QuizQuality = QuizQuality;
