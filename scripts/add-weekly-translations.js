const fs = require('fs');
const path = require('path');

// Weekly action translations (flattened structure)
const weeklyTranslations = {
  'createdContent': {
    'ar': 'أنشأ محتوى لوسائل التواصل الاجتماعي', 'bn': 'সামাজিক মিডিয়ার জন্য কন্টেন্ট তৈরি করেছে', 'ca': 'Ha creat contingut per a xarxes socials',
    'cs': 'Vytvořil obsah pro sociální sítě', 'da': 'Oprettede indhold til sociale medier', 'de': 'Hat Inhalte für soziale Medien erstellt',
    'el': 'Δημιούργησε περιεχόμενο για τα κοινωνικά μέσα', 'et': 'Lõi sotsiaalmeedia sisu', 'eu': 'Sare sozialetarako eduki sortu zuen',
    'fi': 'Loi sisältöä sosiaaliseen mediaan', 'gl': 'Creou contido para redes sociais', 'he': 'יצר תוכן לרשתות חברתיות',
    'hi': 'सोशल मीडिया के लिए सामग्री बनाई', 'hu': 'Tartalmat készített a közösségi médiához', 'it': 'Ha creato contenuti per i social media',
    'ko': '소셜 미디어용 콘텐츠를 만들었습니다', 'ms': 'Mencipta kandungan untuk media sosial', 'nl': 'Heeft content gemaakt voor sociale media',
    'pa': 'ਸੋਸ਼ਲ ਮੀਡੀਆ ਲਈ ਸਮੱਗਰੀ ਬਣਾਈ', 'pl': 'Stworzył treść dla mediów społecznościowych', 'ro': 'A creat conținut pentru rețelele sociale',
    'ru': 'Создал контент для социальных сетей', 'sv': 'Skapade innehåll för sociala medier', 'tr': 'Sosyal medya için içerik oluşturdu'
  },
  'flirted': {
    'ar': 'غازل شخصاً', 'bn': 'কারও সাথে ফ্লার্ট করেছে', 'ca': 'Ha coquetejat amb algú',
    'cs': 'Flirtoval s někým', 'da': 'Flirtede med nogen', 'de': 'Hat mit jemandem geflirtet',
    'el': 'Φλερτάρισε με κάποιον', 'et': 'Flirdis kellegagi', 'eu': 'Norbaiti flirteatu zion',
    'fi': 'Flirttaili jonkun kanssa', 'gl': 'Coqueteou con alguén', 'he': 'פלרט עם מישהו',
    'hi': 'किसी के साथ फ्लर्ट किया', 'hu': 'Flörtölt valakivel', 'it': 'Ha flirtato con qualcuno',
    'ko': '누군가와 플러팅했습니다', 'ms': 'Bercinta dengan seseorang', 'nl': 'Heeft geflirt met iemand',
    'pa': 'ਕਿਸੇ ਨਾਲ ਫਲਰਟ ਕੀਤਾ', 'pl': 'Flirtował z kimś', 'ro': 'A flirtat cu cineva',
    'ru': 'Флиртовал с кем-то', 'sv': 'Flörtade med någon', 'tr': 'Biriyle flört etti'
  },
  'actions.weekly.talkedToFriend': {
    'ar': 'تحدث مع صديق', 'bn': 'বন্ধুর সাথে কথা বলেছে', 'ca': 'Ha parlat amb un amic',
    'cs': 'Mluvil s přítelem', 'da': 'Talte med en ven', 'de': 'Hat mit einem Freund gesprochen',
    'el': 'Μίλησε με έναν φίλο', 'et': 'Rääkis sõbraga', 'eu': 'Lagun batekin hitz egin zuen',
    'fi': 'Puhui ystävän kanssa', 'gl': 'Falou cun amigo', 'he': 'דיבר עם חבר',
    'hi': 'दोस्त से बात की', 'hu': 'Beszélt egy baráttal', 'it': 'Ha parlato con un amico',
    'ko': '친구와 대화했습니다', 'ms': 'Bercakap dengan rakan', 'nl': 'Heeft met een vriend gepraat',
    'pa': 'ਦੋਸਤ ਨਾਲ ਗੱਲ ਕੀਤੀ', 'pl': 'Rozmawiał z przyjacielem', 'ro': 'A vorbit cu un prieten',
    'ru': 'Поговорил с другом', 'sv': 'Pratade med en vän', 'tr': 'Bir arkadaşla konuştu'
  },
  'actions.weekly.navigatedSocialMedia': {
    'ar': 'تصفح وسائل التواصل الاجتماعي', 'bn': 'সামাজিক মিডিয়ায় নেভিগেট করেছে', 'ca': 'Ha navegat per xarxes socials',
    'cs': 'Procházel sociální sítě', 'da': 'Navigerede på sociale medier', 'de': 'Hat soziale Medien durchstöbert',
    'el': 'Πλοήγησε στα κοινωνικά μέσα', 'et': 'Navigeeris sotsiaalmeedias', 'eu': 'Sare sozialetan nabigatu zuen',
    'fi': 'Selasi sosiaalista mediaa', 'gl': 'Navegou polas redes sociais', 'he': 'נווט ברשתות חברתיות',
    'hi': 'सोशल मीडिया में नेविगेट किया', 'hu': 'Böngészett a közösségi médiában', 'it': 'Ha navigato sui social media',
    'ko': '소셜 미디어를 탐색했습니다', 'ms': 'Melayari media sosial', 'nl': 'Heeft sociale media doorzocht',
    'pa': 'ਸੋਸ਼ਲ ਮੀਡੀਆ ਵਿੱਚ ਨੈਵੀਗੇਟ ਕੀਤਾ', 'pl': 'Przeglądał media społecznościowe', 'ro': 'A navigat pe rețelele sociale',
    'ru': 'Просматривал социальные сети', 'sv': 'Navigerade på sociala medier', 'tr': 'Sosyal medyada gezinme yaptı'
  },
  'actions.weekly.talkedToFamily': {
    'ar': 'تحدث مع العائلة', 'bn': 'পরিবারের সাথে কথা বলেছে', 'ca': 'Ha parlat amb la família',
    'cs': 'Mluvil s rodinou', 'da': 'Talte med familien', 'de': 'Hat mit der Familie gesprochen',
    'el': 'Μίλησε με την οικογένεια', 'et': 'Rääkis perega', 'eu': 'Familiarekin hitz egin zuen',
    'fi': 'Puhui perheen kanssa', 'gl': 'Falou coa familia', 'he': 'דיבר עם המשפחה',
    'hi': 'परिवार से बात की', 'hu': 'Beszélt a családdal', 'it': 'Ha parlato con la famiglia',
    'ko': '가족과 대화했습니다', 'ms': 'Bercakap dengan keluarga', 'nl': 'Heeft met de familie gepraat',
    'pa': 'ਪਰਿਵਾਰ ਨਾਲ ਗੱਲ ਕੀਤੀ', 'pl': 'Rozmawiał z rodziną', 'ro': 'A vorbit cu familia',
    'ru': 'Поговорил с семьей', 'sv': 'Pratade med familjen', 'tr': 'Aileyle konuştu'
  },
  'actions.weekly.madeMusic': {
    'ar': 'صنع موسيقى', 'bn': 'সঙ্গীত তৈরি করেছে', 'ca': 'Ha fet música',
    'cs': 'Vytvořil hudbu', 'da': 'Lavede musik', 'de': 'Hat Musik gemacht',
    'el': 'Έκανε μουσική', 'et': 'Teges muusikat', 'eu': 'Musika egin zuen',
    'fi': 'Teki musiikkia', 'gl': 'Fixo música', 'he': 'עשה מוזיקה',
    'hi': 'संगीत बनाया', 'hu': 'Zenét készített', 'it': 'Ha fatto musica',
    'ko': '음악을 만들었습니다', 'ms': 'Membuat muzik', 'nl': 'Heeft muziek gemaakt',
    'pa': 'ਸੰਗੀਤ ਬਣਾਇਆ', 'pl': 'Tworzył muzykę', 'ro': 'A făcut muzică',
    'ru': 'Создавал музыку', 'sv': 'Skapade musik', 'tr': 'Müzik yaptı'
  },
  'actions.weekly.meditated': {
    'ar': 'تأمل', 'bn': 'ধ্যান করেছে', 'ca': 'Ha meditat',
    'cs': 'Meditoval', 'da': 'Mediterede', 'de': 'Hat meditiert',
    'el': 'Διαλογίστηκε', 'et': 'Mediteeris', 'eu': 'Meditatu zuen',
    'fi': 'Meditoi', 'gl': 'Meditou', 'he': 'התבונן',
    'hi': 'ध्यान किया', 'hu': 'Meditált', 'it': 'Ha meditato',
    'ko': '명상을 했습니다', 'ms': 'Bertafakur', 'nl': 'Heeft gemediteerd',
    'pa': 'ਧਿਆਨ ਕੀਤਾ', 'pl': 'Medytował', 'ro': 'A meditat',
    'ru': 'Медитировал', 'sv': 'Mediterade', 'tr': 'Meditasyon yaptı'
  },
  'actions.weekly.spokeToHoly': {
    'ar': 'تحدث مع المقدس', 'bn': 'পবিত্রের সাথে কথা বলেছে', 'ca': 'Ha parlat amb el sagrat',
    'cs': 'Mluvil s posvátným', 'da': 'Talte med det hellige', 'de': 'Hat mit dem Heiligen gesprochen',
    'el': 'Μίλησε με το ιερό', 'et': 'Rääkis pühaga', 'eu': 'Santuarekin hitz egin zuen',
    'fi': 'Puhui pyhän kanssa', 'gl': 'Falou co sagrado', 'he': 'דיבר עם הקדוש',
    'hi': 'पवित्र से बात की', 'hu': 'Beszélt a szenttel', 'it': 'Ha parlato con il sacro',
    'ko': '신성한 것과 대화했습니다', 'ms': 'Bercakap dengan yang suci', 'nl': 'Heeft met het heilige gesproken',
    'pa': 'ਪਵਿੱਤਰ ਨਾਲ ਗੱਲ ਕੀਤੀ', 'pl': 'Rozmawiał ze świętym', 'ro': 'A vorbit cu sfântul',
    'ru': 'Говорил со святым', 'sv': 'Pratade med det heliga', 'tr': 'Kutsalla konuştu'
  },
  'actions.weekly.readMysticBook': {
    'ar': 'قرأ كتاباً صوفياً', 'bn': 'রহস্যময় বই পড়েছে', 'ca': 'Ha llegit un llibre místic',
    'cs': 'Četl mystickou knihu', 'da': 'Læste en mystisk bog', 'de': 'Hat ein mystisches Buch gelesen',
    'el': 'Διάβασε ένα μυστικό βιβλίο', 'et': 'Luges müstilist raamatut', 'eu': 'Liburu mistiko bat irakurri zuen',
    'fi': 'Luki mystisen kirjan', 'gl': 'Leu un libro místico', 'he': 'קרא ספר מיסטי',
    'hi': 'रहस्यमय किताब पढ़ी', 'hu': 'Misztikus könyvet olvasott', 'it': 'Ha letto un libro mistico',
    'ko': '신비로운 책을 읽었습니다', 'ms': 'Membaca buku mistik', 'nl': 'Heeft een mystiek boek gelezen',
    'pa': 'ਰਹੱਸਮਈ ਕਿਤਾਬ ਪੜ੍ਹੀ', 'pl': 'Czytał mistyczną książkę', 'ro': 'A citit o carte mistică',
    'ru': 'Читал мистическую книгу', 'sv': 'Läste en mystisk bok', 'tr': 'Mistik bir kitap okudu'
  },
  'actions.weekly.sharedLearnings': {
    'ar': 'شارك التعلم', 'bn': 'শিক্ষা ভাগ করেছে', 'ca': 'Ha compartit aprenentatges',
    'cs': 'Sdílel poznatky', 'da': 'Delte læringer', 'de': 'Hat Erkenntnisse geteilt',
    'el': 'Μοιράστηκε μαθήματα', 'et': 'Jagas õppetunde', 'eu': 'Ikaskuntzak partekatu zituen',
    'fi': 'Jaoi oppeja', 'gl': 'Compartiu aprendizaxes', 'he': 'שיתף למידות',
    'hi': 'सीख साझा की', 'hu': 'Megosztotta tanulságait', 'it': 'Ha condiviso apprendimenti',
    'ko': '학습을 공유했습니다', 'ms': 'Berkongsi pembelajaran', 'nl': 'Heeft inzichten gedeeld',
    'pa': 'ਸਿੱਖਿਆ ਸਾਂਝੀ ਕੀਤੀ', 'pl': 'Dzielił się naukami', 'ro': 'A împărtășit învățături',
    'ru': 'Поделился знаниями', 'sv': 'Delade lärdomar', 'tr': 'Öğrenimleri paylaştı'
  },
  'actions.weekly.studiedSubject': {
    'ar': 'درس موضوعاً', 'bn': 'একটি বিষয় অধ্যয়ন করেছে', 'ca': 'Ha estudiat una matèria',
    'cs': 'Studoval předmět', 'da': 'Studerede et emne', 'de': 'Hat ein Fach studiert',
    'el': 'Μελέτησε ένα θέμα', 'et': 'Õppis ainet', 'eu': 'Gai bat ikasi zuen',
    'fi': 'Opiskeli aihetta', 'gl': 'Estudou unha materia', 'he': 'למד נושא',
    'hi': 'एक विषय का अध्ययन किया', 'hu': 'Tantárgyat tanult', 'it': 'Ha studiato una materia',
    'ko': '주제를 공부했습니다', 'ms': 'Belajar subjek', 'nl': 'Heeft een vak gestudeerd',
    'pa': 'ਇੱਕ ਵਿਸ਼ਾ ਦਾ ਅਧਿਐਨ ਕੀਤਾ', 'pl': 'Studiował przedmiot', 'ro': 'A studiat o materie',
    'ru': 'Изучал предмет', 'sv': 'Studerade ett ämne', 'tr': 'Bir konu çalıştı'
  },
  'actions.weekly.watchedEducational': {
    'ar': 'شاهد محتوى تعليمي', 'bn': 'শিক্ষামূলক বিষয়বস্তু দেখেছে', 'ca': 'Ha vist contingut educatiu',
    'cs': 'Sledoval vzdělávací obsah', 'da': 'Så pædagogisk indhold', 'de': 'Hat Bildungsinhalte angesehen',
    'el': 'Παρακολούθησε εκπαιδευτικό περιεχόμενο', 'et': 'Vaatas hariduslikku sisu', 'eu': 'Edukazio-eduki ikusi zuen',
    'fi': 'Katsoi opetussisältöä', 'gl': 'Viu contido educativo', 'he': 'צפה בתוכן חינוכי',
    'hi': 'शैक्षिक सामग्री देखी', 'hu': 'Oktatási tartalmat nézett', 'it': 'Ha guardato contenuti educativi',
    'ko': '교육 콘텐츠를 시청했습니다', 'ms': 'Menonton kandungan pendidikan', 'nl': 'Heeft educatieve inhoud bekeken',
    'pa': 'ਵਿੱਦਿਅਕ ਸਮੱਗਰੀ ਦੇਖੀ', 'pl': 'Oglądał treści edukacyjne', 'ro': 'A urmărit conținut educațional',
    'ru': 'Смотрел образовательный контент', 'sv': 'Tittade på pedagogiskt innehåll', 'tr': 'Eğitici içerik izledi'
  },
  'actions.weekly.playedGame': {
    'ar': 'لعب لعبة', 'bn': 'খেলা খেলেছে', 'ca': 'Ha jugat a un joc',
    'cs': 'Hrál hru', 'da': 'Spillede et spil', 'de': 'Hat ein Spiel gespielt',
    'el': 'Έπαιξε παιχνίδι', 'et': 'Mängis mängu', 'eu': 'Joko bat jokatu zuen',
    'fi': 'Pelasi peliä', 'gl': 'Xogou un xogo', 'he': 'שיחק משחק',
    'hi': 'खेल खेला', 'hu': 'Játékot játszott', 'it': 'Ha giocato a un gioco',
    'ko': '게임을 했습니다', 'ms': 'Bermain permainan', 'nl': 'Heeft een spel gespeeld',
    'pa': 'ਖੇਡ ਖੇਡੀ', 'pl': 'Grał w grę', 'ro': 'A jucat un joc',
    'ru': 'Играл в игру', 'sv': 'Spelade ett spel', 'tr': 'Oyun oynadı'
  },
  'actions.weekly.watchedSeries': {
    'ar': 'شاهد مسلسل أو فيلم', 'bn': 'সিরিজ বা সিনেমা দেখেছে', 'ca': 'Ha vist sèries o pel·lícula',
    'cs': 'Sledoval seriál nebo film', 'da': 'Så serie eller film', 'de': 'Hat Serie oder Film gesehen',
    'el': 'Παρακολούθησε σειρά ή ταινία', 'et': 'Vaatas sarja või filmi', 'eu': 'Telesaila edo filma ikusi zuen',
    'fi': 'Katsoi sarjaa tai elokuvaa', 'gl': 'Viu serie ou película', 'he': 'צפה בסדרה או סרט',
    'hi': 'सीरीज या फिल्म देखी', 'hu': 'Sorozatot vagy filmet nézett', 'it': 'Ha guardato serie o film',
    'ko': '시리즈나 영화를 봤습니다', 'ms': 'Menonton siri atau filem', 'nl': 'Heeft serie of film gekeken',
    'pa': 'ਸੀਰੀਜ਼ ਜਾਂ ਫਿਲਮ ਦੇਖੀ', 'pl': 'Oglądał serial lub film', 'ro': 'A urmărit serial sau film',
    'ru': 'Смотрел сериал или фильм', 'sv': 'Tittade på serie eller film', 'tr': 'Dizi veya film izledi'
  },
  'actions.weekly.readNews': {
    'ar': 'قرأ الأخبار', 'bn': 'খবর পড়েছে', 'ca': 'Ha llegit notícies',
    'cs': 'Četl zprávy', 'da': 'Læste nyheder', 'de': 'Hat Nachrichten gelesen',
    'el': 'Διάβασε ειδήσεις', 'et': 'Luges uudiseid', 'eu': 'Albisteak irakurri zituen',
    'fi': 'Luki uutisia', 'gl': 'Leu noticias', 'he': 'קרא חדשות',
    'hi': 'समाचार पढ़े', 'hu': 'Híreket olvasott', 'it': 'Ha letto notizie',
    'ko': '뉴스를 읽었습니다', 'ms': 'Membaca berita', 'nl': 'Heeft nieuws gelezen',
    'pa': 'ਖਬਰਾਂ ਪੜ੍ਹੀਆਂ', 'pl': 'Czytał wiadomości', 'ro': 'A citit știri',
    'ru': 'Читал новости', 'sv': 'Läste nyheter', 'tr': 'Haber okudu'
  },
  'actions.weekly.wroteOpinion': {
    'ar': 'كتب رأياً', 'bn': 'মতামত লিখেছে', 'ca': 'Ha escrit una opinió',
    'cs': 'Napsal názor', 'da': 'Skrev en mening', 'de': 'Hat eine Meinung geschrieben',
    'el': 'Έγραψε γνώμη', 'et': 'Kirjutas arvamuse', 'eu': 'Iritzia idatzi zuen',
    'fi': 'Kirjoitti mielipiteen', 'gl': 'Escribiu unha opinión', 'he': 'כתב דעה',
    'hi': 'राय लिखी', 'hu': 'Véleményt írt', 'it': 'Ha scritto un\'opinione',
    'ko': '의견을 썼습니다', 'ms': 'Menulis pendapat', 'nl': 'Heeft een mening geschreven',
    'pa': 'ਰਾਏ ਲਿਖੀ', 'pl': 'Napisał opinię', 'ro': 'A scris o opinie',
    'ru': 'Написал мнение', 'sv': 'Skrev en åsikt', 'tr': 'Görüş yazdı'
  },
  'actions.weekly.cleanedBed': {
    'ar': 'نظف السرير', 'bn': 'বিছানা পরিষ্কার করেছে', 'ca': 'Ha netejat el llit',
    'cs': 'Uklízel postel', 'da': 'Rengjorde sengen', 'de': 'Hat das Bett gemacht',
    'el': 'Καθάρισε το κρεβάτι', 'et': 'Koristas voodi', 'eu': 'Ohea garbitu zuen',
    'fi': 'Siivosi sängyn', 'gl': 'Limpu a cama', 'he': 'ניקה את המיטה',
    'hi': 'बिस्तर साफ किया', 'hu': 'Kitakarította az ágyat', 'it': 'Ha fatto il letto',
    'ko': '침대를 정리했습니다', 'ms': 'Membersihkan katil', 'nl': 'Heeft het bed opgemaakt',
    'pa': 'ਬਿਸਤਰਾ ਸਾਫ਼ ਕੀਤਾ', 'pl': 'Posprzątał łóżko', 'ro': 'A făcut patul',
    'ru': 'Застелил кровать', 'sv': 'Städade sängen', 'tr': 'Yatağı temizledi'
  },
  'actions.weekly.orderedBedroom': {
    'ar': 'أمر غرفة النوم', 'bn': 'শোবার ঘর সাজিয়েছে', 'ca': 'Ha ordenat la cambra',
    'cs': 'Uklízel ložnici', 'da': 'Ryddede soveværelset', 'de': 'Hat das Schlafzimmer aufgeräumt',
    'el': 'Τακτοποίησε το υπνοδωμάτιο', 'et': 'Koristas magamistoa', 'eu': 'Logelakoa antolatu zuen',
    'fi': 'Siivosi makuuhuoneen', 'gl': 'Ordenou o dormitorio', 'he': 'סידר את חדר השינה',
    'hi': 'शयनकक्ष सजाया', 'hu': 'Rendezette a hálószobát', 'it': 'Ha riordinato la camera da letto',
    'ko': '침실을 정리했습니다', 'ms': 'Mengatur bilik tidur', 'nl': 'Heeft de slaapkamer opgeruimd',
    'pa': 'ਸੌਣ ਦਾ ਕਮਰਾ ਸਜਾਇਆ', 'pl': 'Posprzątał sypialnię', 'ro': 'A aranjat dormitorul',
    'ru': 'Привел в порядок спальню', 'sv': 'Städade sovrummet', 'tr': 'Yatak odasını düzenledi'
  },
  'actions.weekly.shavedBody': {
    'ar': 'حلق الجسم', 'bn': 'শরীর কামিয়েছে', 'ca': 'S\'ha afaitat el cos',
    'cs': 'Oholil tělo', 'da': 'Barberede kroppen', 'de': 'Hat sich den Körper rasiert',
    'el': 'Ξύρισε το σώμα', 'et': 'Aitas keha', 'eu': 'Gorputza bizarra kendu zion',
    'fi': 'Ajoi kehon', 'gl': 'Afeitou o corpo', 'he': 'גילח את הגוף',
    'hi': 'शरीर की दाढ़ी बनाई', 'hu': 'Megborotválkozott', 'it': 'Si è rasato il corpo',
    'ko': '몸을 면도했습니다', 'ms': 'Mencukur badan', 'nl': 'Heeft zich geschoren',
    'pa': 'ਸਰੀਰ ਦੀ ਦਾੜ੍ਹੀ ਬਣਾਈ', 'pl': 'Ogolił ciało', 'ro': 'S-a bărbierit',
    'ru': 'Побрился', 'sv': 'Rakade sig', 'tr': 'Vücudunu tıraş etti'
  },
  'actions.weekly.shavedFace': {
    'ar': 'حلق الوجه', 'bn': 'মুখ কামিয়েছে', 'ca': 'S\'ha afaitat la cara',
    'cs': 'Oholil obličej', 'da': 'Barberede ansigtet', 'de': 'Hat sich das Gesicht rasiert',
    'el': 'Ξύρισε το πρόσωπο', 'et': 'Aitas nägu', 'eu': 'Aurpegia bizarra kendu zion',
    'fi': 'Ajoi kasvot', 'gl': 'Afeitou a cara', 'he': 'גילח את הפנים',
    'hi': 'चेहरे की दाढ़ी बनाई', 'hu': 'Megborotválkozott', 'it': 'Si è rasato la faccia',
    'ko': '얼굴을 면도했습니다', 'ms': 'Mencukur muka', 'nl': 'Heeft zich geschoren',
    'pa': 'ਚਿਹਰੇ ਦੀ ਦਾੜ੍ਹੀ ਬਣਾਈ', 'pl': 'Ogolił twarz', 'ro': 'S-a bărbierit',
    'ru': 'Побрился', 'sv': 'Rakade sig', 'tr': 'Yüzünü tıraş etti'
  },
  'actions.weekly.cutNails': {
    'ar': 'قص الأظافر', 'bn': 'নখ কাটেছে', 'ca': 'S\'ha tallat les ungles',
    'cs': 'Stříhal nehty', 'da': 'Klippede negle', 'de': 'Hat sich die Nägel geschnitten',
    'el': 'Κόβει τα νύχια', 'et': 'Lõikas küüsi', 'eu': 'Azazkalak moztu zituen',
    'fi': 'Leikkasi kynnet', 'gl': 'Cortou as uñas', 'he': 'גזר ציפורניים',
    'hi': 'नाखून काटे', 'hu': 'Vágott körmöt', 'it': 'Si è tagliato le unghie',
    'ko': '손톱을 깎았습니다', 'ms': 'Memotong kuku', 'nl': 'Heeft nagels geknipt',
    'pa': 'ਨਹੁੰ ਕੱਟੇ', 'pl': 'Obciął paznokcie', 'ro': 'S-a tăiat unghiile',
    'ru': 'Подстриг ногти', 'sv': 'Klippte naglar', 'tr': 'Tırnaklarını kesti'
  },
  'actions.weekly.brushedSurfaces': {
    'ar': 'فرش الأسطح', 'bn': 'পৃষ্ঠতল ব্রাশ করেছে', 'ca': 'Ha escombrat superfícies',
    'cs': 'Zametl povrchy', 'da': 'Børstede overflader', 'de': 'Hat Oberflächen gefegt',
    'el': 'Σκούπισε επιφάνειες', 'et': 'Pühkis pindu', 'eu': 'Gainazalak garbitu zituen',
    'fi': 'Lakaisi pintoja', 'gl': 'Varreu superficies', 'he': 'סחט משטחים',
    'hi': 'सतहें साफ कीं', 'hu': 'Felseperte felületeket', 'it': 'Ha spazzato superfici',
    'ko': '표면을 쓸었습니다', 'ms': 'Menyapu permukaan', 'nl': 'Heeft oppervlakken geveegd',
    'pa': 'ਸਤਹਾਂ ਸਾਫ਼ ਕੀਤੀਆਂ', 'pl': 'Zamiótł powierzchnie', 'ro': 'A măturat suprafețe',
    'ru': 'Подмел поверхности', 'sv': 'Sopade ytor', 'tr': 'Yüzeyleri süpürdü'
  },
  'actions.weekly.moppedFloors': {
    'ar': 'مسح الأرضيات', 'bn': 'মেঝে মোছা হয়েছে', 'ca': 'Ha fregat els terra',
    'cs': 'Myl podlahy', 'da': 'Vaskede gulve', 'de': 'Hat Böden gewischt',
    'el': 'Πλύνει τα πάτωμα', 'et': 'Pesin põrandaid', 'eu': 'Lurrak garbitu zituen',
    'fi': 'Moi lattiaa', 'gl': 'Fregou os chans', 'he': 'שטף רצפות',
    'hi': 'फर्श पोंछे', 'hu': 'Felmosott padlót', 'it': 'Ha lavato i pavimenti',
    'ko': '바닥을 닦았습니다', 'ms': 'Mengelap lantai', 'nl': 'Heeft vloeren gedweild',
    'pa': 'ਫਰਸ਼ ਪੂੰਝੇ', 'pl': 'Mył podłogi', 'ro': 'A spălat podelele',
    'ru': 'Мыл полы', 'sv': 'Moppade golv', 'tr': 'Yerleri paspasladı'
  },
  'actions.weekly.washedClothes': {
    'ar': 'غسل الملابس', 'bn': 'কাপড় ধোয়েছে', 'ca': 'Ha rentat roba',
    'cs': 'Pral prádlo', 'da': 'Vaskede tøj', 'de': 'Hat Wäsche gewaschen',
    'el': 'Έπλυνε ρούχα', 'et': 'Pesin riideid', 'eu': 'Arropak garbitu zituen',
    'fi': 'Pesi vaatteita', 'gl': 'Lavou roupa', 'he': 'כבס בגדים',
    'hi': 'कपड़े धोए', 'hu': 'Mosott ruhát', 'it': 'Ha lavato i vestiti',
    'ko': '옷을 빨았습니다', 'ms': 'Membasuh pakaian', 'nl': 'Heeft kleding gewassen',
    'pa': 'ਕੱਪੜੇ ਧੋਤੇ', 'pl': 'Prał ubrania', 'ro': 'A spălat haine',
    'ru': 'Стирал одежду', 'sv': 'Tvättade kläder', 'tr': 'Çamaşır yıkadı'
  },
  'actions.weekly.cleanedBathroom': {
    'ar': 'نظف الحمام', 'bn': 'স্নানঘর পরিষ্কার করেছে', 'ca': 'Ha netejat el bany',
    'cs': 'Uklízel koupelnu', 'da': 'Rengjorde badeværelset', 'de': 'Hat das Badezimmer geputzt',
    'el': 'Καθάρισε το μπάνιο', 'et': 'Koristas vannituba', 'eu': 'Komunak garbitu zuen',
    'fi': 'Siivosi kylpyhuoneen', 'gl': 'Limpu o baño', 'he': 'ניקה את האמבטיה',
    'hi': 'स्नानघर साफ किया', 'hu': 'Kitakarította a fürdőszobát', 'it': 'Ha pulito il bagno',
    'ko': '욕실을 청소했습니다', 'ms': 'Membersihkan bilik mandi', 'nl': 'Heeft de badkamer schoongemaakt',
    'pa': 'ਸਨਾਨਘਰ ਸਾਫ਼ ਕੀਤਾ', 'pl': 'Posprzątał łazienkę', 'ro': 'A curățat baia',
    'ru': 'Убрал ванную', 'sv': 'Städade badrummet', 'tr': 'Banyoyu temizledi'
  },
  'actions.weekly.cleanedKitchen': {
    'ar': 'نظف المطبخ', 'bn': 'রান্নাঘর পরিষ্কার করেছে', 'ca': 'Ha netejat la cuina',
    'cs': 'Uklízel kuchyňu', 'da': 'Rengjorde køkkenet', 'de': 'Hat die Küche geputzt',
    'el': 'Καθάρισε την κουζίνα', 'et': 'Koristas kööki', 'eu': 'Sukaldea garbitu zuen',
    'fi': 'Siivosi keittiön', 'gl': 'Limpu a cociña', 'he': 'ניקה את המטבח',
    'hi': 'रसोई साफ की', 'hu': 'Kitakarította a konyhát', 'it': 'Ha pulito la cucina',
    'ko': '부엌을 청소했습니다', 'ms': 'Membersihkan dapur', 'nl': 'Heeft de keuken schoongemaakt',
    'pa': 'ਰਸੋਈ ਸਾਫ਼ ਕੀਤੀ', 'pl': 'Posprzątał kuchnię', 'ro': 'A curățat bucătăria',
    'ru': 'Убрал кухню', 'sv': 'Städade köket', 'tr': 'Mutfak temizledi'
  },
  'actions.weekly.personalProject': {
    'ar': 'عمل على مشروع شخصي', 'bn': 'ব্যক্তিগত প্রকল্পে কাজ করেছে', 'ca': 'Ha treballat en un projecte personal',
    'cs': 'Pracoval na osobním projektu', 'da': 'Arbejdede på personligt projekt', 'de': 'Hat an einem persönlichen Projekt gearbeitet',
    'el': 'Δούλεψε σε προσωπικό έργο', 'et': 'Töötas isiklikul projektil', 'eu': 'Proiektu pertsonal batean lan egin zuen',
    'fi': 'Työskenteli henkilökohtaisessa projektissa', 'gl': 'Traballou nun proxecto persoal', 'he': 'עבד על פרויקט אישי',
    'hi': 'व्यक्तिगत परियोजना पर काम किया', 'hu': 'Személyes projekten dolgozott', 'it': 'Ha lavorato a un progetto personale',
    'ko': '개인 프로젝트에 작업했습니다', 'ms': 'Bekerja pada projek peribadi', 'nl': 'Heeft aan een persoonlijk project gewerkt',
    'pa': 'ਨਿੱਜੀ ਪ੍ਰੋਜੈਕਟ ਤੇ ਕੰਮ ਕੀਤਾ', 'pl': 'Pracował nad projektem osobistym', 'ro': 'A lucrat la un proiect personal',
    'ru': 'Работал над личным проектом', 'sv': 'Arbetade på personligt projekt', 'tr': 'Kişisel proje üzerinde çalıştı'
  },
  'actions.weekly.helpedSomeone': {
    'ar': 'ساعد شخصاً', 'bn': 'কারও সাহায্য করেছে', 'ca': 'Ha ajudat algú',
    'cs': 'Pomohl někomu', 'da': 'Hjalp nogen', 'de': 'Hat jemandem geholfen',
    'el': 'Βοήθησε κάποιον', 'et': 'Aitas kedagi', 'eu': 'Norbaiti lagundu zion',
    'fi': 'Auttoi jotakuta', 'gl': 'Axudou a alguén', 'he': 'עזר למישהו',
    'hi': 'किसी की मदद की', 'hu': 'Segített valakinek', 'it': 'Ha aiutato qualcuno',
    'ko': '누군가를 도왔습니다', 'ms': 'Membantu seseorang', 'nl': 'Heeft iemand geholpen',
    'pa': 'ਕਿਸੇ ਦੀ ਮਦਦ ਕੀਤੀ', 'pl': 'Pomógł komuś', 'ro': 'A ajutat pe cineva',
    'ru': 'Помог кому-то', 'sv': 'Hjälpte någon', 'tr': 'Birine yardım etti'
  },
  'actions.weekly.boughtGroceries': {
    'ar': 'اشترى البقالة', 'bn': 'কেনাকাটা করেছে', 'ca': 'Ha comprat queviures',
    'cs': 'Nakoupil potraviny', 'da': 'Købte ind', 'de': 'Hat Lebensmittel eingekauft',
    'el': 'Αγόρασε ψώνια', 'et': 'Ostis toiduaineid', 'eu': 'Janariak erosi zituen',
    'fi': 'Osti ruokakauppoja', 'gl': 'Mercou comestibles', 'he': 'קנה מצרכים',
    'hi': 'किराने खरीदी', 'hu': 'Bevásárolt', 'it': 'Ha fatto la spesa',
    'ko': '식료품을 샀습니다', 'ms': 'Membeli barangan runcit', 'nl': 'Heeft boodschappen gedaan',
    'pa': 'ਕਿਰਾਨਾ ਖਰੀਦੀ', 'pl': 'Zrobił zakupy', 'ro': 'A cumpărat alimente',
    'ru': 'Купил продукты', 'sv': 'Handlade matvaror', 'tr': 'Market alışverişi yaptı'
  }
};

// Function to update specific keys in the content (flattened structure)
function updateSpecificKeys(content, locale) {
  // Check if actions object exists
  if (!content.actions) {
    content.actions = {};
  }

  for (const [key, translations] of Object.entries(weeklyTranslations)) {
    if (translations[locale]) {
      // Set the translation directly in the flat actions object
      content.actions[key] = translations[locale];
    }
  }
}

// Process each file
const localesDir = path.join(__dirname, '../src/locales');
const files = fs.readdirSync(localesDir).filter(file => file.endsWith('.json') && file !== 'en.json');

console.log('🌍 Adding weekly action translations...\n');

files.forEach(file => {
  const filePath = path.join(localesDir, file);
  const locale = file.replace('.json', '');
  
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Update specific translations
    updateSpecificKeys(content, locale);
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
    console.log(`✅ Added weekly translations for ${locale}`);
    
  } catch (error) {
    console.error(`❌ Error processing ${locale}:`, error.message);
  }
});

console.log('\n🎉 Weekly action translations added!'); 