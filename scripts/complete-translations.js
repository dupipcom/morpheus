const fs = require('fs');
const path = require('path');

// Comprehensive translations for all remaining English text
const translations = {
  // Common translations
  'common.dashboard': {
    'ar': 'لوحة التحكم', 'bn': 'ড্যাশবোর্ড', 'ca': 'Tauler de control', 'cs': 'Nástěnka',
    'da': 'Dashboard', 'de': 'Dashboard', 'el': 'Πίνακας ελέγχου', 'et': 'Armatuurlaud',
    'eu': 'Kontrol-panela', 'fi': 'Kojelauta', 'gl': 'Panel de control', 'he': 'לוח מחוונים',
    'hi': 'डैशबोर्ड', 'hu': 'Vezérlőpult', 'it': 'Dashboard', 'ko': '대시보드',
    'ms': 'Papan pemuka', 'nl': 'Dashboard', 'pa': 'ਡੈਸ਼ਬੋਰਡ', 'pl': 'Panel',
    'ro': 'Tablou de bord', 'ru': 'Панель управления', 'sv': 'Instrumentpanel', 'tr': 'Gösterge Paneli'
  },
  'common.signUp': {
    'ar': 'إنشاء حساب', 'bn': 'সাইন আপ', 'ca': 'Registrar-se', 'cs': 'Registrovat se',
    'da': 'Tilmeld dig', 'de': 'Registrieren', 'el': 'Εγγραφή', 'et': 'Registreeru',
    'eu': 'Erregistratu', 'fi': 'Rekisteröidy', 'gl': 'Rexistrarse', 'he': 'הרשמה',
    'hi': 'साइन अप', 'hu': 'Regisztráció', 'it': 'Registrati', 'ko': '가입하기',
    'ms': 'Daftar', 'nl': 'Registreren', 'pa': 'ਸਾਈਨ ਅਪ', 'pl': 'Zarejestruj się',
    'ro': 'Înregistrare', 'ru': 'Зарегистрироваться', 'sv': 'Registrera dig', 'tr': 'Kayıt ol'
  },
  'navigation.home': {
    'ar': 'الرئيسية', 'bn': 'হোম', 'ca': 'Inici', 'cs': 'Domů', 'da': 'Hjem',
    'de': 'Startseite', 'el': 'Αρχική', 'et': 'Avaleht', 'eu': 'Hasiera',
    'fi': 'Koti', 'gl': 'Inicio', 'he': 'בית', 'hi': 'होम', 'hu': 'Kezdőlap',
    'it': 'Inizio', 'ko': '홈', 'ms': 'Rumah', 'nl': 'Home', 'pa': 'ਹੋਮ',
    'pl': 'Strona główna', 'ro': 'Acasă', 'ru': 'Главная', 'sv': 'Hem', 'tr': 'Ana Sayfa'
  },
  'navigation.shows': {
    'ar': 'العروض', 'bn': 'শো', 'ca': 'Programes', 'cs': 'Pořady', 'da': 'Shows',
    'de': 'Shows', 'el': 'Εκπομπές', 'et': 'Saated', 'eu': 'Ikuskizunak',
    'fi': 'Ohjelmat', 'gl': 'Programas', 'he': 'מופעים', 'hi': 'शो', 'hu': 'Műsorok',
    'it': 'Spettacoli', 'ko': '쇼', 'ms': 'Rancangan', 'nl': 'Shows', 'pa': 'ਸ਼ੋਅ',
    'pl': 'Programy', 'ro': 'Emisiuni', 'ru': 'Шоу', 'sv': 'Shower', 'tr': 'Gösteriler'
  },
  'navigation.episodes': {
    'ar': 'الحلقات', 'bn': 'পর্ব', 'ca': 'Episodis', 'cs': 'Epizody', 'da': 'Episoder',
    'de': 'Episoden', 'el': 'Επεισόδια', 'et': 'Episoodid', 'eu': 'Atalak',
    'fi': 'Jaksot', 'gl': 'Episodios', 'he': 'פרקים', 'hi': 'एपिसोड', 'hu': 'Epizódok',
    'it': 'Episodi', 'ko': '에피소드', 'ms': 'Episod', 'nl': 'Afleveringen', 'pa': 'ਐਪੀਸੋਡ',
    'pl': 'Odcinki', 'ro': 'Episoade', 'ru': 'Эпизоды', 'sv': 'Avsnitt', 'tr': 'Bölümler'
  },
  'navigation.chat': {
    'ar': 'انضم إلينا', 'bn': 'আমাদের সাথে যোগ দিন', 'ca': 'Uneix-te a nosaltres',
    'cs': 'Připojte se k nám', 'da': 'Tilslut dig os', 'de': 'Treten Sie uns bei',
    'el': 'Ελάτε μαζί μας', 'et': 'Liitu meiega', 'eu': 'Batu gurekin',
    'fi': 'Liity meihin', 'gl': 'Únete a nós', 'he': 'הצטרף אלינו', 'hi': 'हमसे जुड़ें',
    'hu': 'Csatlakozz hozzánk', 'it': 'Unisciti a noi', 'ko': '우리와 함께하세요',
    'ms': 'Sertai kami', 'nl': 'Doe mee', 'pa': 'ਸਾਡੇ ਨਾਲ ਜੁੜੋ', 'pl': 'Dołącz do nas',
    'ro': 'Alătură-te nouă', 'ru': 'Присоединяйтесь к нам', 'sv': 'Gå med oss', 'tr': 'Bize katılın'
  },
  'navigation.events': {
    'ar': 'الأحداث', 'bn': 'ইভেন্ট', 'ca': 'Esdeveniments', 'cs': 'Události', 'da': 'Begivenheder',
    'de': 'Veranstaltungen', 'el': 'Εκδηλώσεις', 'et': 'Sündmused', 'eu': 'Ekitaldiak',
    'fi': 'Tapahtumat', 'gl': 'Eventos', 'he': 'אירועים', 'hi': 'कार्यक्रम', 'hu': 'Események',
    'it': 'Eventi', 'ko': '이벤트', 'ms': 'Acara', 'nl': 'Evenementen', 'pa': 'ਇਵੈਂਟ',
    'pl': 'Wydarzenia', 'ro': 'Evenimente', 'ru': 'События', 'sv': 'Evenemang', 'tr': 'Etkinlikler'
  },
  'navigation.label': {
    'ar': 'التسمية', 'bn': 'লেবেল', 'ca': 'Etiqueta', 'cs': 'Štítek', 'da': 'Etiket',
    'de': 'Label', 'el': 'Ετικέτα', 'et': 'Silt', 'eu': 'Etiketa', 'fi': 'Otsikko',
    'gl': 'Etiqueta', 'he': 'תגית', 'hi': 'लेबल', 'hu': 'Címke', 'it': 'Etichetta',
    'ko': '라벨', 'ms': 'Label', 'nl': 'Label', 'pa': 'ਲੇਬਲ', 'pl': 'Etykieta',
    'ro': 'Etichetă', 'ru': 'Метка', 'sv': 'Etikett', 'tr': 'Etiket'
  },
  'navigation.supportUs': {
    'ar': 'ادعمنا', 'bn': 'আমাদের সমর্থন করুন', 'ca': 'Suporta\'ns', 'cs': 'Podpořte nás',
    'da': 'Støt os', 'de': 'Unterstützen Sie uns', 'el': 'Υποστηρίξτε μας', 'et': 'Toeta meid',
    'eu': 'Laguntza gaitzazu', 'fi': 'Tue meitä', 'gl': 'Apóyanos', 'he': 'תמוך בנו',
    'hi': 'हमारा समर्थन करें', 'hu': 'Támogass minket', 'it': 'Supportaci', 'ko': '우리를 지원하세요',
    'ms': 'Sokong kami', 'nl': 'Steun ons', 'pa': 'ਸਾਡਾ ਸਮਰਥਨ ਕਰੋ', 'pl': 'Wesprzyj nas',
    'ro': 'Susține-ne', 'ru': 'Поддержите нас', 'sv': 'Stöd oss', 'tr': 'Bizi destekleyin'
  },
  'navigation.about': {
    'ar': 'من نحن', 'bn': 'আমাদের সম্পর্কে', 'ca': 'Qui som', 'cs': 'O nás', 'da': 'Om os',
    'de': 'Über uns', 'el': 'Σχετικά με εμάς', 'et': 'Meist', 'eu': 'Guri buruz',
    'fi': 'Tietoa meistä', 'gl': 'Quen somos', 'he': 'אודותינו', 'hi': 'हमारे बारे में',
    'hu': 'Rólunk', 'it': 'Chi siamo', 'ko': '우리에 대해', 'ms': 'Tentang kami',
    'nl': 'Over ons', 'pa': 'ਸਾਡੇ ਬਾਰੇ', 'pl': 'O nas', 'ro': 'Despre noi',
    'ru': 'О нас', 'sv': 'Om oss', 'tr': 'Hakkımızda'
  },
  'navigation.privacy': {
    'ar': 'سياسة الخصوصية', 'bn': 'গোপনীয়তা নীতি', 'ca': 'Política de privadesa',
    'cs': 'Zásady ochrany osobních údajů', 'da': 'Privatlivspolitik', 'de': 'Datenschutzrichtlinie',
    'el': 'Πολιτική απορρήτου', 'et': 'Privaatsuspoliitika', 'eu': 'Pribatutasun politika',
    'fi': 'Tietosuojakäytäntö', 'gl': 'Política de privacidade', 'he': 'מדיניות פרטיות',
    'hi': 'गोपनीयता नीति', 'hu': 'Adatvédelmi irányelvek', 'it': 'Informativa sulla privacy',
    'ko': '개인정보 처리방침', 'ms': 'Dasar privasi', 'nl': 'Privacybeleid', 'pa': 'ਗੋਪਨੀਯਤਾ ਨੀਤੀ',
    'pl': 'Polityka prywatności', 'ro': 'Politica de confidențialitate', 'ru': 'Политика конфиденциальности',
    'sv': 'Integritetspolicy', 'tr': 'Gizlilik politikası'
  },
  'navigation.locale': {
    'ar': 'اللغة', 'bn': 'ভাষা', 'ca': 'Idioma', 'cs': 'Jazyk', 'da': 'Sprog',
    'de': 'Sprache', 'el': 'Γλώσσα', 'et': 'Keel', 'eu': 'Hizkuntza', 'fi': 'Kieli',
    'gl': 'Idioma', 'he': 'שפה', 'hi': 'भाषा', 'hu': 'Nyelv', 'it': 'Lingua',
    'ko': '언어', 'ms': 'Bahasa', 'nl': 'Taal', 'pa': 'ਭਾਸ਼ਾ', 'pl': 'Język',
    'ro': 'Limba', 'ru': 'Язык', 'sv': 'Språk', 'tr': 'Dil'
  },
  'navigation.blog': {
    'ar': 'المدونة', 'bn': 'ব্লগ', 'ca': 'Blog', 'cs': 'Blog', 'da': 'Blog',
    'de': 'Blog', 'el': 'Ιστολόγιο', 'et': 'Blogi', 'eu': 'Bloga', 'fi': 'Blogi',
    'gl': 'Blog', 'he': 'בלוג', 'hi': 'ब्लॉग', 'hu': 'Blog', 'it': 'Blog',
    'ko': '블로그', 'ms': 'Blog', 'nl': 'Blog', 'pa': 'ਬਲੌਗ', 'pl': 'Blog',
    'ro': 'Blog', 'ru': 'Блог', 'sv': 'Blogg', 'tr': 'Blog'
  },
  'navigation.agenda': {
    'ar': 'الأجندة', 'bn': 'এজেন্ডা', 'ca': 'Agenda', 'cs': 'Program', 'da': 'Dagsorden',
    'de': 'Agenda', 'el': 'Ημερήσια διάταξη', 'et': 'Päevakord', 'eu': 'Agenda',
    'fi': 'Esityslista', 'gl': 'Axenda', 'he': 'סדר יום', 'hi': 'कार्यसूची',
    'hu': 'Napirend', 'it': 'Agenda', 'ko': '의제', 'ms': 'Agenda', 'nl': 'Agenda',
    'pa': 'ਏਜੰਡਾ', 'pl': 'Agenda', 'ro': 'Agendă', 'ru': 'Повестка дня',
    'sv': 'Dagordning', 'tr': 'Gündem'
  },

  // Settings translations
  'settings.title': {
    'ar': 'الإعدادات', 'bn': 'সেটিংস', 'ca': 'Configuració', 'cs': 'Nastavení',
    'da': 'Indstillinger', 'de': 'Einstellungen', 'el': 'Ρυθμίσεις', 'et': 'Seaded',
    'eu': 'Ezarpenak', 'fi': 'Asetukset', 'gl': 'Configuración', 'he': 'הגדרות',
    'hi': 'सेटिंग्स', 'hu': 'Beállítások', 'it': 'Impostazioni', 'ko': '설정',
    'ms': 'Tetapan', 'nl': 'Instellingen', 'pa': 'ਸੈਟਿੰਗਾਂ', 'pl': 'Ustawienia',
    'ro': 'Setări', 'ru': 'Настройки', 'sv': 'Inställningar', 'tr': 'Ayarlar'
  },
  'settings.dailyActions': {
    'ar': 'إجراءاتك اليومية:', 'bn': 'আপনার দৈনিক কর্ম:', 'ca': 'Les teves accions diàries:',
    'cs': 'Vaše denní akce:', 'da': 'Dine daglige handlinger:', 'de': 'Ihre täglichen Aktionen:',
    'el': 'Οι καθημερινές σας ενέργειες:', 'et': 'Teie igapäevased tegevused:', 'eu': 'Zure eguneroko ekintzak:',
    'fi': 'Päivittäiset toimenpiteesi:', 'gl': 'As túas accións diarias:', 'he': 'הפעולות היומיות שלך:',
    'hi': 'आपके दैनिक कार्य:', 'hu': 'Napi tevékenységei:', 'it': 'Le tue azioni quotidiane:',
    'ko': '일일 활동:', 'ms': 'Tindakan harian anda:', 'nl': 'Uw dagelijkse acties:',
    'pa': 'ਤੁਹਾਡੇ ਰੋਜ਼ਾਨਾ ਕੰਮ:', 'pl': 'Twoje codzienne działania:', 'ro': 'Acțiunile tale zilnice:',
    'ru': 'Ваши ежедневные действия:', 'sv': 'Dina dagliga handlingar:', 'tr': 'Günlük eylemleriniz:'
  },
  'settings.weeklyActions': {
    'ar': 'إجراءاتك الأسبوعية:', 'bn': 'আপনার সাপ্তাহিক কর্ম:', 'ca': 'Les teves accions setmanals:',
    'cs': 'Vaše týdenní akce:', 'da': 'Dine ugentlige handlinger:', 'de': 'Ihre wöchentlichen Aktionen:',
    'el': 'Οι εβδομαδιαίες σας ενέργειες:', 'et': 'Teie nädalategevused:', 'eu': 'Zure asteko ekintzak:',
    'fi': 'Viikoittaiset toimenpiteesi:', 'gl': 'As túas accións semanais:', 'he': 'הפעולות השבועיות שלך:',
    'hi': 'आपके साप्ताहिक कार्य:', 'hu': 'Heti tevékenységei:', 'it': 'Le tue azioni settimanali:',
    'ko': '주간 활동:', 'ms': 'Tindakan mingguan anda:', 'nl': 'Uw wekelijkse acties:',
    'pa': 'ਤੁਹਾਡੇ ਹਫ਼ਤਾਵਾਰੀ ਕੰਮ:', 'pl': 'Twoje cotygodniowe działania:', 'ro': 'Acțiunile tale săptămânale:',
    'ru': 'Ваши еженедельные действия:', 'sv': 'Dina veckohandlingar:', 'tr': 'Haftalık eylemleriniz:'
  },

  // Actions translations
  'actions.daily.drankWater': {
    'ar': 'شرب الماء', 'bn': 'পানি পান করেছে', 'ca': 'Ha begut aigua', 'cs': 'Vypil vodu',
    'da': 'Drak vand', 'de': 'Hat Wasser getrunken', 'el': 'Έπινε νερό', 'et': 'Jõi vett',
    'eu': 'Ura edan zuen', 'fi': 'Joi vettä', 'gl': 'Bebeu auga', 'he': 'שתה מים',
    'hi': 'पानी पिया', 'hu': 'Vizet ivott', 'it': 'Ha bevuto acqua', 'ko': '물을 마셨습니다',
    'ms': 'Minum air', 'nl': 'Heeft water gedronken', 'pa': 'ਪਾਣੀ ਪੀਤਾ', 'pl': 'Wypił wodę',
    'ro': 'A băut apă', 'ru': 'Пил воду', 'sv': 'Drack vatten', 'tr': 'Su içti'
  },
  'actions.daily.showered': {
    'ar': 'استحم', 'bn': 'গোসল করেছে', 'ca': 'S\'ha dutxat', 'cs': 'Osvčel se',
    'da': 'Tog brusebad', 'de': 'Hat geduscht', 'el': 'Καλούπισε', 'et': 'Dusšis',
    'eu': 'Dutxa hartu zuen', 'fi': 'Kävi suihkussa', 'gl': 'Duchouse', 'he': 'התקלח',
    'hi': 'नहाया', 'hu': 'Zuhanyozott', 'it': 'Si è fatto la doccia', 'ko': '샤워했습니다',
    'ms': 'Mandi', 'nl': 'Heeft gedoucht', 'pa': 'ਗੁਸਲ ਕੀਤਾ', 'pl': 'Wziął prysznic',
    'ro': 'S-a dus', 'ru': 'Принял душ', 'sv': 'Duschat', 'tr': 'Duş aldı'
  },
  'actions.daily.tookMeds': {
    'ar': 'تناول الدواء', 'bn': 'ওষুধ খেয়েছে', 'ca': 'Ha pres medicació', 'cs': 'Vzal léky',
    'da': 'Tog medicin', 'de': 'Hat Medikamente genommen', 'el': 'Πήρε φάρμακα', 'et': 'Võttis ravimeid',
    'eu': 'Botika hartu zuen', 'fi': 'Otti lääkkeitä', 'gl': 'Tomou medicamentos', 'he': 'לקח תרופות',
    'hi': 'दवा ली', 'hu': 'Gyógyszert szedett', 'it': 'Ha preso i medicinali', 'ko': '약을 복용했습니다',
    'ms': 'Ambil ubat', 'nl': 'Heeft medicijnen genomen', 'pa': 'ਦਵਾਈ ਲਈ', 'pl': 'Wziął leki',
    'ro': 'A luat medicamente', 'ru': 'Принял лекарства', 'sv': 'Tog medicin', 'tr': 'İlaç aldı'
  },
  'actions.daily.loggedMood': {
    'ar': 'سجل المزاج', 'bn': 'মেজাজ লগ করেছে', 'ca': 'Ha registrat l\'estat d\'ànim', 'cs': 'Zaznamenal náladu',
    'da': 'Registrerede humør', 'de': 'Hat Stimmung protokolliert', 'el': 'Κατέγραψε τη διάθεση', 'et': 'Registreeris tuju',
    'eu': 'Humorra erregistratu zuen', 'fi': 'Kirjasi mielialan', 'gl': 'Rexistrou o humor', 'he': 'רשם מצב רוח',
    'hi': 'मूड लॉग किया', 'hu': 'Rögzítette a hangulatot', 'it': 'Ha registrato l\'umore', 'ko': '기분을 기록했습니다',
    'ms': 'Log mood', 'nl': 'Heeft stemming geregistreerd', 'pa': 'ਮੂਡ ਲੌਗ ਕੀਤਾ', 'pl': 'Zarejestrował nastrój',
    'ro': 'A înregistrat starea de spirit', 'ru': 'Записал настроение', 'sv': 'Loggade humör', 'tr': 'Ruh halini kaydetti'
  },
  'actions.daily.ateBreakfast': {
    'ar': 'تناول الإفطار', 'bn': 'সকালের নাস্তা খেয়েছে', 'ca': 'Ha esmorzat', 'cs': 'Snídal',
    'da': 'Spiste morgenmad', 'de': 'Hat gefrühstückt', 'el': 'Πήρε πρωινό', 'et': 'Sõi hommikusööki',
    'eu': 'Gosaria hartu zuen', 'fi': 'Söi aamiaisen', 'gl': 'Tomou o almorzo', 'he': 'אכל ארוחת בוקר',
    'hi': 'नाश्ता किया', 'hu': 'Reggelizett', 'it': 'Ha fatto colazione', 'ko': '아침 식사를 했습니다',
    'ms': 'Makan sarapan', 'nl': 'Heeft ontbeten', 'pa': 'ਨਾਸ਼ਤਾ ਕੀਤਾ', 'pl': 'Zjadł śniadanie',
    'ro': 'A luat micul dejun', 'ru': 'Позавтракал', 'sv': 'Åt frukost', 'tr': 'Kahvaltı yaptı'
  },
  'actions.daily.ateLunch': {
    'ar': 'تناول الغداء', 'bn': 'দুপুরের খাবার খেয়েছে', 'ca': 'Ha dinat', 'cs': 'Obědval',
    'da': 'Spiste frokost', 'de': 'Hat zu Mittag gegessen', 'el': 'Πήρε μεσημεριανό', 'et': 'Sõi lõunasööki',
    'eu': 'Bazkaria hartu zuen', 'fi': 'Söi lounaan', 'gl': 'Almorzou', 'he': 'אכל ארוחת צהריים',
    'hi': 'दोपहर का खाना खाया', 'hu': 'Ebédelt', 'it': 'Ha pranzato', 'ko': '점심 식사를 했습니다',
    'ms': 'Makan tengah hari', 'nl': 'Heeft geluncht', 'pa': 'ਦੁਪਹਿਰ ਦਾ ਖਾਣਾ ਖਾਧਾ', 'pl': 'Zjadł obiad',
    'ro': 'A luat prânzul', 'ru': 'Пообедал', 'sv': 'Åt lunch', 'tr': 'Öğle yemeği yedi'
  },
  'actions.daily.ateDinner': {
    'ar': 'تناول العشاء', 'bn': 'রাতের খাবার খেয়েছে', 'ca': 'Ha sopat', 'cs': 'Večeřel',
    'da': 'Spiste aftensmad', 'de': 'Hat zu Abend gegessen', 'el': 'Πήρε βραδινό', 'et': 'Sõi õhtusööki',
    'eu': 'Afaria hartu zuen', 'fi': 'Söi illallisen', 'gl': 'Cenou', 'he': 'אכל ארוחת ערב',
    'hi': 'रात का खाना खाया', 'hu': 'Vacsorázott', 'it': 'Ha cenato', 'ko': '저녁 식사를 했습니다',
    'ms': 'Makan malam', 'nl': 'Heeft gedineerd', 'pa': 'ਰਾਤ ਦਾ ਖਾਣਾ ਖਾਧਾ', 'pl': 'Zjadł kolację',
    'ro': 'A luat cina', 'ru': 'Поужинал', 'sv': 'Åt middag', 'tr': 'Akşam yemeği yedi'
  },
  'actions.daily.brushedTeeth': {
    'ar': 'فرش أسنانه', 'bn': 'দাঁত ব্রাশ করেছে', 'ca': 'S\'ha rentat les dents', 'cs': 'Čistil si zuby',
    'da': 'Børstede tænder', 'de': 'Hat sich die Zähne geputzt', 'el': 'Βούρτσισε τα δόντια', 'et': 'Hammustas hambaid',
    'eu': 'Hortzak garbitu zituen', 'fi': 'Hampaat harjasi', 'gl': 'Lavou os dentes', 'he': 'צחצח שיניים',
    'hi': 'दांत साफ किए', 'hu': 'Fogat mosott', 'it': 'Si è lavato i denti', 'ko': '양치질을 했습니다',
    'ms': 'Gosok gigi', 'nl': 'Heeft tanden gepoetst', 'pa': 'ਦੰਦ ਸਾਫ਼ ਕੀਤੇ', 'pl': 'Mył zęby',
    'ro': 'S-a spălat pe dinți', 'ru': 'Почистил зубы', 'sv': 'Borstade tänder', 'tr': 'Dişlerini fırçaladı'
  },
  'actions.daily.workedOut': {
    'ar': 'تمرن', 'bn': 'কসরত করেছে', 'ca': 'Ha fet exercici', 'cs': 'Cvičil',
    'da': 'Trænede', 'de': 'Hat trainiert', 'el': 'Έκανε γυμναστική', 'et': 'Trennis',
    'eu': 'Ariketa egin zuen', 'fi': 'Treenasi', 'gl': 'Fixo exercicio', 'he': 'התאמן',
    'hi': 'व्यायाम किया', 'hu': 'Edzett', 'it': 'Ha fatto allenamento', 'ko': '운동을 했습니다',
    'ms': 'Bersenam', 'nl': 'Heeft getraind', 'pa': 'ਕਸਰਤ ਕੀਤੀ', 'pl': 'Ćwiczył',
    'ro': 'A făcut exerciții', 'ru': 'Тренировался', 'sv': 'Tränade', 'tr': 'Egzersiz yaptı'
  },
  'actions.daily.worked': {
    'ar': 'عمل', 'bn': 'কাজ করেছে', 'ca': 'Ha treballat', 'cs': 'Pracoval',
    'da': 'Arbejdede', 'de': 'Hat gearbeitet', 'el': 'Δούλεψε', 'et': 'Töötas',
    'eu': 'Lan egin zuen', 'fi': 'Työskenteli', 'gl': 'Traballou', 'he': 'עבד',
    'hi': 'काम किया', 'hu': 'Dolgozott', 'it': 'Ha lavorato', 'ko': '일했습니다',
    'ms': 'Bekerja', 'nl': 'Heeft gewerkt', 'pa': 'ਕੰਮ ਕੀਤਾ', 'pl': 'Pracował',
    'ro': 'A lucrat', 'ru': 'Работал', 'sv': 'Arbetade', 'tr': 'Çalıştı'
  },
  'actions.daily.washedDishes': {
    'ar': 'غسل الأطباق', 'bn': 'বাসন মাজছে', 'ca': 'Ha rentat els plats', 'cs': 'Myl nádobí',
    'da': 'Vaskede op', 'de': 'Hat Geschirr gespült', 'el': 'Έπλυνε τα πιάτα', 'et': 'Pesin nõusid',
    'eu': 'Platerak garbitu zituen', 'fi': 'Tiskasi', 'gl': 'Lavou os pratos', 'he': 'שטף כלים',
    'hi': 'बर्तन धोए', 'hu': 'Mosogatott', 'it': 'Ha lavato i piatti', 'ko': '설거지를 했습니다',
    'ms': 'Basuh pinggan', 'nl': 'Heeft afgewassen', 'pa': 'ਬਰਤਨ ਧੋਤੇ', 'pl': 'Mył naczynia',
    'ro': 'A spălat vasele', 'ru': 'Мыл посуду', 'sv': 'Diskade', 'tr': 'Bulaşık yıkadı'
  },
  'actions.daily.storedDishes': {
    'ar': 'خزن الأطباق', 'bn': 'বাসন রাখছে', 'ca': 'Ha guardat els plats', 'cs': 'Ukládal nádobí',
    'da': 'Ryddede op', 'de': 'Hat Geschirr weggeräumt', 'el': 'Έβαλε τα πιάτα στη θέση τους', 'et': 'Panesin nõusid ära',
    'eu': 'Platerak gorde zituen', 'fi': 'Siivosi', 'gl': 'Gardou os pratos', 'he': 'אחסן כלים',
    'hi': 'बर्तन रखे', 'hu': 'Elrakta a tányérokat', 'it': 'Ha riordinato i piatti', 'ko': '설거지를 정리했습니다',
    'ms': 'Simpan pinggan', 'nl': 'Heeft opgeruimd', 'pa': 'ਬਰਤਨ ਰੱਖੇ', 'pl': 'Sprzątał naczynia',
    'ro': 'A pus vasele la loc', 'ru': 'Убрал посуду', 'sv': 'Städade', 'tr': 'Bulaşıkları kaldırdı'
  },
  'actions.daily.checkedTrash': {
    'ar': 'فحص القمامة', 'bn': 'আবর্জনা দেখছে', 'ca': 'Ha revisat les escombraries', 'cs': 'Zkontroloval odpadky',
    'da': 'Tjekkede skraldespanden', 'de': 'Hat Müll überprüft', 'el': 'Έλεγξε τα σκουπίδια', 'et': 'Kontrollisin prügi',
    'eu': 'Zaborrak egiaztatu zituen', 'fi': 'Tarkisti roskat', 'gl': 'Revisou o lixo', 'he': 'בדק זבל',
    'hi': 'कचरा देखा', 'hu': 'Ellenőrizte a szemetet', 'it': 'Ha controllato la spazzatura', 'ko': '쓰레기를 확인했습니다',
    'ms': 'Periksa sampah', 'nl': 'Heeft vuilnis gecontroleerd', 'pa': 'ਕੂੜਾ ਚੈਕ ਕੀਤਾ', 'pl': 'Sprawdził śmieci',
    'ro': 'A verificat gunoiul', 'ru': 'Проверил мусор', 'sv': 'Kollade soporna', 'tr': 'Çöpü kontrol etti'
  },
  'actions.daily.brushedFloor': {
    'ar': 'فرش الأرضية', 'bn': 'মেঝে ঝাড়ছে', 'ca': 'Ha escombrat el terra', 'cs': 'Zametl podlahu',
    'da': 'Børstede gulvet', 'de': 'Hat Boden gefegt', 'el': 'Σκούπισε το πάτωμα', 'et': 'Pühkisin põrandat',
    'eu': 'Lurra garbitu zuen', 'fi': 'Lakaisi lattia', 'gl': 'Varreu o chan', 'he': 'סחט רצפה',
    'hi': 'फर्श साफ किया', 'hu': 'Felseperte a padlót', 'it': 'Ha spazzato il pavimento', 'ko': '바닥을 쓸었습니다',
    'ms': 'Sapu lantai', 'nl': 'Heeft vloer geveegd', 'pa': 'ਫਰਸ਼ ਸਾਫ਼ ਕੀਤਾ', 'pl': 'Zamiótł podłogę',
    'ro': 'A măturat podeaua', 'ru': 'Подмел пол', 'sv': 'Sopade golvet', 'tr': 'Yeri süpürdü'
  },
  'actions.daily.madeLove': {
    'ar': 'مارس الحب', 'bn': 'প্রেম করেছে', 'ca': 'Ha fet l\'amor', 'cs': 'Miloval se',
    'da': 'Elskede', 'de': 'Hat Liebe gemacht', 'el': 'Έκανε έρωτα', 'et': 'Armastas',
    'eu': 'Maitasuna egin zuen', 'fi': 'Rakasteli', 'gl': 'Fixo o amor', 'he': 'עשה אהבה',
    'hi': 'प्रेम किया', 'hu': 'Szeretkezett', 'it': 'Ha fatto l\'amore', 'ko': '사랑을 나눴습니다',
    'ms': 'Buat cinta', 'nl': 'Heeft liefde gemaakt', 'pa': 'ਪਿਆਰ ਕੀਤਾ', 'pl': 'Kochał się',
    'ro': 'A făcut dragoste', 'ru': 'Занимался любовью', 'sv': 'Älskade', 'tr': 'Sevişti'
  },
  'actions.daily.wentOut': {
    'ar': 'خرج', 'bn': 'বের হয়েছে', 'ca': 'Ha sortit', 'cs': 'Vyšel ven',
    'da': 'Gik ud', 'de': 'Ist ausgegangen', 'el': 'Βγήκε έξω', 'et': 'Läks välja',
    'eu': 'Kanpora joan zen', 'fi': 'Lähti ulos', 'gl': 'Saeu', 'he': 'יצא',
    'hi': 'बाहर गया', 'hu': 'Kiment', 'it': 'È uscito', 'ko': '외출했습니다',
    'ms': 'Keluar', 'nl': 'Is uitgegaan', 'pa': 'ਬਾਹਰ ਗਿਆ', 'pl': 'Wyszedł',
    'ro': 'A ieșit', 'ru': 'Вышел', 'sv': 'Gick ut', 'tr': 'Dışarı çıktı'
  }
};

// Function to get translation for a key
function getTranslation(key, locale) {
  if (translations[key] && translations[key][locale]) {
    return translations[key][locale];
  }
  return null;
}

// Function to recursively update translations
function updateTranslations(obj, locale) {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        updateTranslations(obj[key], locale);
      } else if (typeof obj[key] === 'string') {
        // Check if this looks like an English placeholder
        const translation = getTranslation(key, locale);
        if (translation) {
          obj[key] = translation;
        }
      }
    }
  }
}

// Process each file
const localesDir = path.join(__dirname, '../src/locales');
const files = fs.readdirSync(localesDir).filter(file => file.endsWith('.json') && file !== 'en.json');

console.log('🌍 Starting comprehensive translation update...\n');

files.forEach(file => {
  const filePath = path.join(localesDir, file);
  const locale = file.replace('.json', '');
  
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Update translations
    updateTranslations(content, locale);
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
    console.log(`✅ Updated translations for ${locale}`);
    
  } catch (error) {
    console.error(`❌ Error processing ${locale}:`, error.message);
  }
});

console.log('\n🎉 Comprehensive translation update complete!');
console.log('\nNote: Some translations may still be in English as placeholders.');
console.log('You may want to manually review and translate the remaining English text.'); 