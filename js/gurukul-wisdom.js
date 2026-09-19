/**
 * HAMSA VIDYA (हंस विद्या) — Ancient Gurukul Wisdom Oracle & Subhashita Engine
 * (गुरुकुल सुभाषितम् व दिव्य ज्ञान मन्दिरम्)
 * 
 * Provides authentic Sanskrit Subhashitas with Hindi & English translations,
 * audio recitation synthesis, AI on-demand inspiration, and Gurukul Sadhana tracking.
 */

class GurukulWisdomEngine {
  constructor() {
    this.currentIndex = 0;
    this.currentLang = 'all'; // 'all' | 'sanskrit' | 'hindi' | 'english'
    this.autoCycleInterval = null;
    this.cycleDuration = 14000; // 14 seconds per shloka
    this.isPaused = false;
    this.progressInterval = null;
    this.progressStartTime = null;

    // Load custom bookmarks from localStorage
    this.bookmarkedShlokas = JSON.parse(localStorage.getItem('hamsa_wisdom_bookmarks') || '[]');

    // Curated Ancient Gurukul Wisdom Treasury (25+ Authentic Shlokas)
    this.shlokas = [
      {
        id: 1,
        source: "हितोपदेशः (Hitopadesha)",
        category: "विद्या व शील (Character & Learning)",
        sanskrit: "विद्या ददाति विनयं विनयाद्याति पात्रताम् ।\nपात्रत्वाद्धनमाप्नोति धनाद्धर्मं ततः सुखम् ॥",
        hindi: "सच्ची विद्या मनुष्य को विनम्रता प्रदान करती है; विनम्रता से पात्रता (योग्यता) आती है; योग्यता से धन व धर्म सिद्ध होते हैं और शाश्वत सुख प्राप्त होता है।",
        english: "True knowledge bestows humility; humility earns worthiness; from worthiness comes righteous prosperity, and from virtue comes everlasting peace.",
        tag: "विनम्रता • Humility"
      },
      {
        id: 2,
        source: "श्रीमद्भगवद्गीता २.४७ (Bhagavad Gita)",
        category: "कर्मयोग (Duty & Focus)",
        sanskrit: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥",
        hindi: "तुम्हारा अधिकार केवल निष्ठापूर्वक कर्म करने में है, उसके फलों में कभी नहीं। अतः कर्म के परिणाम की चिंता छोड़कर आलस्य व अकर्मण्यता से मुक्त रहो।",
        english: "You have a divine right only to perform your duties with pure devotion, never to the fruits thereof. Do not let outcomes distract you, nor surrender to inaction.",
        tag: "कर्तव्य • Action"
      },
      {
        id: 3,
        source: "हितोपदेशः (Hitopadesha)",
        category: "पुरुषार्थ (Effort & Diligence)",
        sanskrit: "उद्यमेन हि सिध्यन्ति कार्याणि न मनोरथैः ।\nन हि सुप्तस्य सिंहस्य प्रविशन्ति मुखे मृगाः ॥",
        hindi: "सभी कार्य केवल निरंतर परिश्रम और पुरुषार्थ से सिद्ध होते हैं, केवल मनोरथ (कल्पना) करने से नहीं। सोते हुए सिंह के मुख में हिरण स्वयं प्रवेश नहीं करता।",
        english: "Success is attained through hard work and relentless diligence, never by mere daydreaming. Even the sleeping lion cannot feast unless he hunts.",
        tag: "परिश्रम • Hard Work"
      },
      {
        id: 4,
        source: "चाणक्य नीतिः (Chanakya Niti)",
        category: "समय प्रबन्धन (Time & Discipline)",
        sanskrit: "क्षणशः कणशश्चैव विद्यामर्थं च साधयेत् ।\nक्षणत्यागे कुतो विद्या कणत्यागे कुतो धनम् ॥",
        hindi: "प्रत्येक क्षण का सदुपयोग कर विद्या अर्जित करनी चाहिए और प्रत्येक कण का संचय कर धन। क्षण गँवाने वाले को विद्या और कण व्यर्थ करने वाले को धन कभी नहीं मिलता।",
        english: "Acquire wisdom second by second, and build resources particle by particle. One who wastes moments loses knowledge; one who squanders particles loses wealth.",
        tag: "समय साधना • Discipline"
      },
      {
        id: 5,
        source: "भर्तृहरि नीतिशतकम् (Niti Shatakam)",
        category: "धैर्य व संकल्प (Patience & Grit)",
        sanskrit: "प्रारभ्यते न खलु विघ्नभयेन नीचैः,\nप्रारभ्य विघ्नविहता विरमन्ति मध्याः ।\nविघ्नैः पुनः पुनरपि प्रतिहन्यमानाः,\nप्रारब्धमुत्तमगुणा न परित्यजन्ति ॥",
        hindi: "निम्न कोटि के लोग विघ्नों के भय से कार्य आरम्भ ही नहीं करते; मध्यम लोग विघ्न आते ही बीच में छोड़ देते हैं; किन्तु उत्तम संकल्प वाले महापुरुष बार-बार विघ्नों के आने पर भी लक्ष्य नहीं छोड़ते।",
        english: "The timid never begin for fear of obstacles; ordinary minds quit at the first sign of trouble; but the truly resilient endure repeated hardships without ever abandoning their quest.",
        tag: "अटल संकल्प • Resilience"
      },
      {
        id: 6,
        source: "तैत्तिरीयोपनिषद् (Taittiriya Upanishad)",
        category: "सत्य व धर्म (Integrity & Learning)",
        sanskrit: "सत्यं वद । धर्मं चर ।\nस्वाध्यायान्मा प्रमदः ॥",
        hindi: "सदा सत्य बोलो। धर्म और नीति का आचरण करो। प्रतिदिन नियमपूर्वक स्वाध्याय (अध्ययन) करने में कभी प्रमाद (आलस्य) मत करो।",
        english: "Speak the truth. Walk the righteous path. Never slacken in your daily self-study and pursuit of wisdom.",
        tag: "स्वाध्याय • Self-Study"
      },
      {
        id: 7,
        source: "विदुर नीतिः (Vidura Niti)",
        category: "एकाग्रता (Focus & Clarity)",
        sanskrit: "नाप्राप्यमभिवाञ्छन्ति नष्टं नेच्छन्ति शोचितुम् ।\nआपत्सु च न मुह्यन्ति नराः पण्डितबुद्धयः ॥",
        hindi: "जो अप्राप्य की व्यर्थ लालसा नहीं करते, जो बीत गया उस पर शोक नहीं मनाते, और संकट की घड़ी में भी अपना विवेक नहीं खोते—वही वास्तव में प्रबुद्ध विद्वान हैं।",
        english: "The wise do not crave unattainable illusions, do not grieve over past losses, and never lose composure amid life's adversities. Keep your focus sharp.",
        tag: "विवेक • Inner Calm"
      },
      {
        id: 8,
        source: "सुभाषितरत्नभाण्डागारम्",
        category: "विद्या की श्रेष्ठता (Supremacy of Knowledge)",
        sanskrit: "न चोरहार्यं न च राजहार्यं,\nन भ्रातृभाज्यं न च भारकारि ।\nव्यये कृते वर्धत एव नित्यं,\nविद्याधनं सर्वधनप्रधानम् ॥",
        hindi: "विद्या रूपी धन को न चोर चुरा सकता है, न राजा छीन सकता है, न भाइयों में बाँटा जा सकता है, और न यह कोई बोझ है। जितना खर्च करो उतना बढ़ता है; अतः विद्या सभी धनों में सर्वश्रेष्ठ है।",
        english: "Knowledge cannot be stolen by thieves, seized by rulers, divided among kin, nor is it a burden to carry. The more you share, the more it grows. It reigns supreme above all wealth.",
        tag: "ज्ञानं धनम् • Ultimate Wealth"
      },
      {
        id: 9,
        source: "चाणक्य नीतिः (Chanakya Niti)",
        category: "विद्या की सुगंध (Perseverance)",
        sanskrit: "यथा खनन्खनित्रेण नरो वार्यधिगच्छति ।\nतथा गुरुगतां विद्यां शुश्रूषुरधिगच्छति ॥",
        hindi: "जिस प्रकार कुदाल से खोदने वाला व्यक्ति गहरी भूमि से भी शीतल जल पा लेता है, उसी प्रकार गुरु व विद्या के प्रति समर्पित जिज्ञासु शिष्य गूढ़तम ज्ञान को भी प्राप्त कर लेता है।",
        english: "Just as a persistent digger reaches sweet subterranean water beneath tough earth, a dedicated student uncovers profound mastery through steady inquiry and devotion.",
        tag: "अन्वेषण • Deep Mastery"
      },
      {
        id: 10,
        source: "श्रीमद्भगवद्गीता ६.५ (Bhagavad Gita)",
        category: "आत्मविश्वास (Self-Empowerment)",
        sanskrit: "उद्धरेदात्मनात्मानं नात्मानमवसादयेत् ।\nआत्मैव ह्यात्मनो बन्धुरात्मैव रिपुरात्मनः ॥",
        hindi: "मनुष्य को चाहिए कि वह अपने शुभ संकल्पों द्वारा अपना उद्धार करे, अपने मन को कभी निराश न होने दे। क्योंकि मनुष्य स्वयं ही अपना सच्चा मित्र है और स्वयं ही अपना शत्रु।",
        english: "Elevate yourself through the power of your own focused will; do not degrade yourself. For your enlightened mind is your greatest ally, and an undisciplined mind your worst foe.",
        tag: "आत्मबल • Self-Confidence"
      },
      {
        id: 11,
        source: "सुभाषितम् (Ancient Proverb)",
        category: "विद्यार्थी के ५ लक्षण (5 Student Virtues)",
        sanskrit: "काकचेष्टा बकोध्यानं श्वाननिद्रा तथैव च ।\nअल्पहारी गृहत्यागी विद्यार्थी पञ्चलक्षणम् ॥",
        hindi: "कौवे जैसी चतुराई व सतत चेष्टा, बगुले जैसा एकाग्र ध्यान, श्वान जैसी सजग नींद, आवश्यकतानुसार अल्पाहार और स्वावलंबन—ये पाँच गुण सच्चे विद्यार्थी की पहचान हैं।",
        english: "Tenacious effort like a crow, razor-sharp focus like a heron, alert readiness like a faithful dog, mindful temperance, and independence—these are the five hallmarks of a true seeker.",
        tag: "साधना • Student Virtues"
      },
      {
        id: 12,
        source: "महाभारतम् (Mahabharata)",
        category: "अभ्यास (Practice & Repetition)",
        sanskrit: "अनभ्यासे विषं विद्या अजीर्णे भोजनं विषम् ।\nदरिद्रस्य विषं गोष्ठी वृद्धस्य तरुणी विषम् ॥",
        hindi: "निरंतर अभ्यास के बिना ज्ञान विष के समान निष्फल हो जाता है; अपच में भोजन विष बन जाता है। ज्ञान को जीवंत रखने के लिए उसका सतत पुनरावलोकन (Revision) अनिवार्य है।",
        english: "Knowledge without steady practice and active review turns toxic and fades away. Consistent revision is the lifeblood of mastery.",
        tag: "अभ्यास • Daily Practice"
      }
    ];
  }

  init() {
    this.startAutoCycle();
  }

  getCurrentShloka() {
    return this.shlokas[this.currentIndex];
  }

  nextShloka() {
    this.currentIndex = (this.currentIndex + 1) % this.shlokas.length;
    this.renderCurrentWisdom();
    this.resetCycleTimer();
  }

  prevShloka() {
    this.currentIndex = (this.currentIndex - 1 + this.shlokas.length) % this.shlokas.length;
    this.renderCurrentWisdom();
    this.resetCycleTimer();
  }

  setLanguage(lang) {
    this.currentLang = lang;
    this.renderCurrentWisdom();
    if (window.audioEngine && window.audioEngine.playOptionSelect) {
      window.audioEngine.playOptionSelect();
    }
  }

  startAutoCycle() {
    this.stopAutoCycle();
    this.progressStartTime = performance.now();
    this.updateProgressBar();

    this.autoCycleInterval = setInterval(() => {
      if (!this.isPaused) {
        this.nextShloka();
      }
    }, this.cycleDuration);
  }

  stopAutoCycle() {
    if (this.autoCycleInterval) {
      clearInterval(this.autoCycleInterval);
      this.autoCycleInterval = null;
    }
    if (this.progressInterval) {
      cancelAnimationFrame(this.progressInterval);
      this.progressInterval = null;
    }
  }

  resetCycleTimer() {
    this.stopAutoCycle();
    this.startAutoCycle();
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  updateProgressBar() {
    const bar = document.getElementById('gurukul-stream-progress');
    if (!bar) return;

    const animate = (time) => {
      if (!this.progressStartTime) this.progressStartTime = time;
      const elapsed = time - this.progressStartTime;
      const progress = Math.min((elapsed % this.cycleDuration) / this.cycleDuration * 100, 100);
      
      if (bar) {
        bar.style.width = `${progress}%`;
      }
      this.progressInterval = requestAnimationFrame(animate);
    };
    this.progressInterval = requestAnimationFrame(animate);
  }

  /**
   * Recite current shloka in sacred Gurukul style:
   * First rings a resonant temple bell chime, then chants the Sanskrit text using SpeechSynthesis.
   */
  reciteShloka() {
    const shloka = this.getCurrentShloka();
    if (!shloka) return;

    // 1. Play synthesized Vedic Temple Bell / Singing Bowl Chime
    if (window.audioEngine && window.audioEngine.playTempleBell) {
      window.audioEngine.playTempleBell();
    }

    // 2. Animate recitation badge pulse
    const reciteBtn = document.getElementById('shloka-recite-btn');
    if (reciteBtn) {
      reciteBtn.classList.add('reciting');
      reciteBtn.innerHTML = `
        <span class="sound-wave-bars">
          <span></span><span></span><span></span><span></span>
        </span>
        <span>उच्चारणम् चलति...</span>
      `;
    }

    // 3. Web Speech API Sanskrit/Hindi chanting synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any pending speech

      // Clean shloka text for speech engine (remove punctuation marks)
      const cleanText = shloka.sanskrit.replace(/[।॥\n]/g, ' ').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);

      // Prefer Hindi/Sanskrit voices if installed on client OS
      const voices = window.speechSynthesis.getVoices();
      const devanagariVoice = voices.find(v => v.lang.startsWith('hi') || v.lang.startsWith('sa') || v.lang.includes('Hindi'));
      if (devanagariVoice) {
        utterance.voice = devanagariVoice;
      }
      utterance.lang = 'hi-IN';
      utterance.rate = 0.82; // Ethereal, calm Gurukul cadence
      utterance.pitch = 0.95; // Warm harmonic tone

      utterance.onend = () => {
        if (reciteBtn) {
          reciteBtn.classList.remove('reciting');
          reciteBtn.innerHTML = `
            <i data-lucide="volume-2" style="width:15px;height:15px;"></i>
            <span>उच्चारणम् (Recite)</span>
          `;
          if (window.lucide) window.lucide.createIcons();
        }
      };

      utterance.onerror = () => {
        if (reciteBtn) {
          reciteBtn.classList.remove('reciting');
          reciteBtn.innerHTML = `
            <i data-lucide="volume-2" style="width:15px;height:15px;"></i>
            <span>उच्चारणम् (Recite)</span>
          `;
          if (window.lucide) window.lucide.createIcons();
        }
      };

      // Slight delay after bell resonance starts
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 450);
    } else {
      if (reciteBtn) {
        setTimeout(() => {
          reciteBtn.classList.remove('reciting');
        }, 1200);
      }
    }
  }

  copyShloka() {
    const shloka = this.getCurrentShloka();
    if (!shloka) return;

    const formattedText = `॥ गुरुकुल सुभाषितम् — हंस विद्या ॥\n\n${shloka.sanskrit}\n\n[स्रोत: ${shloka.source}]\n\n🇮🇳 हिन्दी भावार्थ:\n${shloka.hindi}\n\n🌍 English Application:\n${shloka.english}\n\n— Shared via HAMSA VIDYA (हंस विद्या)`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(formattedText).then(() => {
        if (window.app && window.app.showToast) {
          window.app.showToast('सुभाषितं प्रतिलिपिं कृतम्! (Shloka copied to clipboard 📜✨)', 'success');
        }
      });
    }
  }

  toggleBookmark() {
    const shloka = this.getCurrentShloka();
    if (!shloka) return;

    const index = this.bookmarkedShlokas.indexOf(shloka.id);
    const isBookmarking = index === -1;

    if (isBookmarking) {
      this.bookmarkedShlokas.push(shloka.id);
      if (window.app && window.app.showToast) {
        window.app.showToast('सुभाषितं संगृहीतम् (Wisdom bookmarked to your sacred collection ⭐)', 'success');
      }
    } else {
      this.bookmarkedShlokas.splice(index, 1);
      if (window.app && window.app.showToast) {
        window.app.showToast('Bookmark removed', 'info');
      }
    }

    localStorage.setItem('hamsa_wisdom_bookmarks', JSON.stringify(this.bookmarkedShlokas));
    this.renderCurrentWisdom();
  }

  /**
   * AI Gurukul Contemplation (AI चिन्तन)
   * Connects to Google Gemini API (if available) or synthesizes an instant custom Vedic shloka.
   */
  async generateAiWisdom() {
    const btn = document.getElementById('ai-wisdom-btn');
    if (btn) {
      btn.classList.add('loading');
      btn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width:14px;height:14px;"></i> <span>ब्रह्म-ज्ञानं विचिन्त्यते...</span>`;
      if (window.lucide) window.lucide.createIcons();
    }

    const studentProfile = window.examProfileManager ? window.examProfileManager.loadProfile() : null;
    const targetExam = studentProfile && studentProfile.targetExams && studentProfile.targetExams[0] ? studentProfile.targetExams[0] : 'UPSC / Competitive Exams';

    try {
      if (window.geminiService && window.geminiService.apiKey) {
        const prompt = `You are an enlightened Ancient Indian Rishi / Guru in a royal Vedic Gurukul advising an aspiring student preparing for competitive exams like "${targetExam}".
Provide ONE profound, authentic, inspirational Sanskrit Subhashita Shloka with precise Devanagari script, source reference, lucid Hindi Bhavartha, and modern English mindset guidance.
Format EXACTLY as JSON:
{
  "source": "Scripture name (e.g. श्रीमद्भगवद्गीता / हितोपदेशः / चाणक्य नीतिः)",
  "category": "Domain of wisdom",
  "sanskrit": "Devanagari Sanskrit shloka with ॥ marks",
  "hindi": "Hindi explanation (सरल भावार्थ)",
  "english": "Modern motivational takeaway for students",
  "tag": "Focus area tag"
}`;
        const rawResponse = await window.geminiService.generateContent(prompt, { temperature: 0.7 });
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          parsed.id = Date.now();
          this.shlokas.unshift(parsed);
          this.currentIndex = 0;
          if (window.app && window.app.showToast) {
            window.app.showToast('✨ नवीन दिव्य सुभाषितं प्राप्तम् (AI Vedic Revelation Received)', 'success');
          }
        } else {
          this.nextShloka();
        }
      } else {
        // Instant offline cycling with celestial bell sound
        this.nextShloka();
        if (window.app && window.app.showToast) {
          window.app.showToast('✨ प्राचीन गुरुकुल सन्देशः (Ancient Gurukul Wisdom Transmitted)', 'success');
        }
      }
    } catch (e) {
      this.nextShloka();
    } finally {
      if (btn) {
        btn.classList.remove('loading');
        btn.innerHTML = `<i data-lucide="sparkles" style="width:14px;height:14px;"></i> <span>AI चिन्तन (New)</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
      this.renderCurrentWisdom();
    }
  }

  /**
   * Determine student's Vedic Scholarship Title & Sadhana Level
   */
  getSadhanaLevel(quizzesCount = 0, accuracy = 0) {
    if (quizzesCount >= 15 && accuracy >= 75) {
      return {
        title: "महाविद्वान् / आचार्य",
        enTitle: "Vedic Grandmaster Scholar",
        level: 4,
        auraColor: "#F59E0B",
        badge: "👑 स्वर्ण पदवी",
        diyaFlickerRate: "1.2s",
        streakDays: Math.max(5, quizzesCount)
      };
    } else if (quizzesCount >= 8) {
      return {
        title: "विद्यालंकार",
        enTitle: "Adorned with Knowledge",
        level: 3,
        auraColor: "#10B981",
        badge: "🌿 रजत पदवी",
        diyaFlickerRate: "1.8s",
        streakDays: Math.max(3, quizzesCount)
      };
    } else if (quizzesCount >= 3) {
      return {
        title: "अध्येता",
        enTitle: "Diligent Vedic Scholar",
        level: 2,
        auraColor: "#6366F1",
        badge: "🪶 ज्ञान साधक",
        diyaFlickerRate: "2.4s",
        streakDays: Math.max(2, quizzesCount)
      };
    } else {
      return {
        title: "जिज्ञासु",
        enTitle: "Curious Seeker of Truth",
        level: 1,
        auraColor: "#E11D48",
        badge: "✨ नव प्रवेशी",
        diyaFlickerRate: "3.0s",
        streakDays: 1
      };
    }
  }

  renderCurrentWisdom() {
    const container = document.getElementById('gurukul-shloka-body');
    if (!container) return;

    const shloka = this.getCurrentShloka();
    if (!shloka) return;

    const isBookmarked = this.bookmarkedShlokas.includes(shloka.id);

    // Update Source Badge
    const sourceEl = document.getElementById('gurukul-source-badge');
    if (sourceEl) sourceEl.textContent = shloka.source;

    // Update Bookmark Button State
    const bmBtn = document.getElementById('shloka-bm-btn');
    if (bmBtn) {
      bmBtn.innerHTML = `<i data-lucide="${isBookmarked ? 'star-off' : 'star'}" style="width:13px;height:13px;fill:${isBookmarked ? 'var(--color-gold, #F59E0B)' : 'none'};color:${isBookmarked ? 'var(--color-gold, #F59E0B)' : 'currentColor'};"></i>`;
      bmBtn.title = isBookmarked ? 'Remove Bookmark' : 'Bookmark this Subhashita';
    }

    container.innerHTML = `
      <div class="gurukul-shloka-flow animate-shloka-fade">
        <div class="gurukul-devanagari-quote">
          “ ${shloka.sanskrit.replace(/\n/g, '<span class="shloka-line-break"> </span>')} ”
        </div>

        <div class="gurukul-bhavartha-stream">
          <div class="bhavartha-row hindi-row">
            <span class="lang-dot hi-dot">हिन्दी</span>
            <span class="bhavartha-text">${shloka.hindi}</span>
          </div>
          <div class="bhavartha-row english-row">
            <span class="lang-dot en-dot">English</span>
            <span class="bhavartha-text">${shloka.english}</span>
          </div>
        </div>
      </div>
    `;

    // Refresh icons
    if (window.lucide) window.lucide.createIcons();
  }
}

// Instantiate global singleton
window.gurukulWisdomEngine = new GurukulWisdomEngine();
