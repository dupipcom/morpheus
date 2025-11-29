const fs = require('fs');
const path = require('path');

// Complete recurrencePicker translations
const recurrencePickerTranslations = {
  ar: {
    frequency: 'تكرار',
    every: 'كل',
    day: 'يوم',
    days: 'أيام',
    week: 'أسبوع',
    weeks: 'أسابيع',
    month: 'شهر',
    months: 'أشهر',
    year: 'سنة',
    years: 'سنوات',
    noRepeat: 'لا يتكرر',
    daily: 'يومياً',
    weekly: 'أسبوعياً',
    monthly: 'شهرياً',
    yearly: 'سنوياً'
  },
  bn: {
    frequency: 'পুনরাবৃত্তি',
    every: 'প্রতি',
    day: 'দিন',
    days: 'দিন',
    week: 'সপ্তাহ',
    weeks: 'সপ্তাহ',
    month: 'মাস',
    months: 'মাস',
    year: 'বছর',
    years: 'বছর',
    noRepeat: 'পুনরাবৃত্তি হয় না',
    daily: 'প্রতিদিন',
    weekly: 'সাপ্তাহিক',
    monthly: 'মাসিক',
    yearly: 'বার্ষিক'
  },
  ca: {
    frequency: 'Repetir',
    every: 'Cada',
    day: 'dia',
    days: 'dies',
    week: 'setmana',
    weeks: 'setmanes',
    month: 'mes',
    months: 'mesos',
    year: 'any',
    years: 'anys',
    noRepeat: 'No es repeteix',
    daily: 'Diàriament',
    weekly: 'Setmanalment',
    monthly: 'Mensualment',
    yearly: 'Anualment'
  },
  cs: {
    frequency: 'Opakovat',
    every: 'Každý',
    day: 'den',
    days: 'dny',
    week: 'týden',
    weeks: 'týdny',
    month: 'měsíc',
    months: 'měsíce',
    year: 'rok',
    years: 'roky',
    noRepeat: 'Neopakuje se',
    daily: 'Denně',
    weekly: 'Týdně',
    monthly: 'Měsíčně',
    yearly: 'Ročně'
  },
  da: {
    frequency: 'Gentag',
    every: 'Hver',
    day: 'dag',
    days: 'dage',
    week: 'uge',
    weeks: 'uger',
    month: 'måned',
    months: 'måneder',
    year: 'år',
    years: 'år',
    noRepeat: 'Gentager ikke',
    daily: 'Dagligt',
    weekly: 'Ugentligt',
    monthly: 'Månedligt',
    yearly: 'Årligt'
  },
  de: {
    frequency: 'Wiederholen',
    every: 'Jede',
    day: 'Tag',
    days: 'Tage',
    week: 'Woche',
    weeks: 'Wochen',
    month: 'Monat',
    months: 'Monate',
    year: 'Jahr',
    years: 'Jahre',
    noRepeat: 'Wiederholt sich nicht',
    daily: 'Täglich',
    weekly: 'Wöchentlich',
    monthly: 'Monatlich',
    yearly: 'Jährlich'
  },
  el: {
    frequency: 'Επανάληψη',
    every: 'Κάθε',
    day: 'ημέρα',
    days: 'ημέρες',
    week: 'εβδομάδα',
    weeks: 'εβδομάδες',
    month: 'μήνας',
    months: 'μήνες',
    year: 'έτος',
    years: 'έτη',
    noRepeat: 'Δεν επαναλαμβάνεται',
    daily: 'Καθημερινά',
    weekly: 'Εβδομαδιαίως',
    monthly: 'Μηνιαίως',
    yearly: 'Ετησίως'
  },
  et: {
    frequency: 'Korda',
    every: 'Iga',
    day: 'päev',
    days: 'päeva',
    week: 'nädal',
    weeks: 'nädalat',
    month: 'kuu',
    months: 'kuud',
    year: 'aasta',
    years: 'aastat',
    noRepeat: 'Ei korda',
    daily: 'Igapäevaselt',
    weekly: 'Iganädalaselt',
    monthly: 'Igakuiselt',
    yearly: 'Igaaastaselt'
  },
  eu: {
    frequency: 'Errepikatu',
    every: 'Guztiak',
    day: 'eguna',
    days: 'egunak',
    week: 'astea',
    weeks: 'asteak',
    month: 'hila',
    months: 'hilak',
    year: 'urtea',
    years: 'urteak',
    noRepeat: 'Ez da errepikatzen',
    daily: 'Egunero',
    weekly: 'Astero',
    monthly: 'Hilero',
    yearly: 'Urtero'
  },
  fi: {
    frequency: 'Toista',
    every: 'Joka',
    day: 'päivä',
    days: 'päivää',
    week: 'viikko',
    weeks: 'viikkoa',
    month: 'kuukausi',
    months: 'kuukautta',
    year: 'vuosi',
    years: 'vuotta',
    noRepeat: 'Ei toistoa',
    daily: 'Päivittäin',
    weekly: 'Viikoittain',
    monthly: 'Kuukausittain',
    yearly: 'Vuosittain'
  },
  fr: {
    frequency: 'Répéter',
    every: 'Tous les',
    day: 'jour',
    days: 'jours',
    week: 'semaine',
    weeks: 'semaines',
    month: 'mois',
    months: 'mois',
    year: 'an',
    years: 'ans',
    noRepeat: 'Ne se répète pas',
    daily: 'Quotidiennement',
    weekly: 'Hebdomadairement',
    monthly: 'Mensuellement',
    yearly: 'Annuellement'
  },
  gl: {
    frequency: 'Repetir',
    every: 'Cada',
    day: 'día',
    days: 'días',
    week: 'semana',
    weeks: 'semanas',
    month: 'mes',
    months: 'meses',
    year: 'ano',
    years: 'anos',
    noRepeat: 'Non se repite',
    daily: 'Diariamente',
    weekly: 'Semanalmente',
    monthly: 'Mensualmente',
    yearly: 'Anualmente'
  },
  ha: {
    frequency: 'Maimaita',
    every: 'Ko  da',
    day: 'rana',
    days: 'ranaku',
    week: 'mako',
    weeks: 'makonni',
    month: 'wata',
    months: 'watanni',
    year: 'shekara',
    years: 'shekaru',
    noRepeat: 'Ba ya maimaituwa',
    daily: 'Kowace rana',
    weekly: 'Kowane mako',
    monthly: 'Kowane wata',
    yearly: 'Kowace shekara'
  },
  he: {
    frequency: 'חזרה',
    every: 'כל',
    day: 'יום',
    days: 'ימים',
    week: 'שבוע',
    weeks: 'שבועות',
    month: 'חודש',
    months: 'חודשים',
    year: 'שנה',
    years: 'שנים',
    noRepeat: 'לא חוזר',
    daily: 'יומי',
    weekly: 'שבועי',
    monthly: 'חודשי',
    yearly: 'שנתי'
  },
  hi: {
    frequency: 'दोहराएं',
    every: 'प्रत्येक',
    day: 'दिन',
    days: 'दिन',
    week: 'सप्ताह',
    weeks: 'सप्ताह',
    month: 'महीना',
    months: 'महीने',
    year: 'वर्ष',
    years: 'वर्ष',
    noRepeat: 'दोहराता नहीं',
    daily: 'दैनिक',
    weekly: 'साप्ताहिक',
    monthly: 'मासिक',
    yearly: 'वार्षिक'
  },
  hu: {
    frequency: 'Ismétlés',
    every: 'Minden',
    day: 'nap',
    days: 'nap',
    week: 'hét',
    weeks: 'hét',
    month: 'hónap',
    months: 'hónap',
    year: 'év',
    years: 'év',
    noRepeat: 'Nem ismétlődik',
    daily: 'Naponta',
    weekly: 'Hetente',
    monthly: 'Havonta',
    yearly: 'Évente'
  },
  it: {
    frequency: 'Ripeti',
    every: 'Ogni',
    day: 'giorno',
    days: 'giorni',
    week: 'settimana',
    weeks: 'settimane',
    month: 'mese',
    months: 'mesi',
    year: 'anno',
    years: 'anni',
    noRepeat: 'Non si ripete',
    daily: 'Giornalmente',
    weekly: 'Settimanalmente',
    monthly: 'Mensilmente',
    yearly: 'Annualmente'
  },
  ja: {
    frequency: '繰り返し',
    every: '毎',
    day: '日',
    days: '日',
    week: '週',
    weeks: '週',
    month: '月',
    months: 'ヶ月',
    year: '年',
    years: '年',
    noRepeat: '繰り返さない',
    daily: '毎日',
    weekly: '毎週',
    monthly: '毎月',
    yearly: '毎年'
  },
  ko: {
    frequency: '반복',
    every: '매',
    day: '일',
    days: '일',
    week: '주',
    weeks: '주',
    month: '월',
    months: '개월',
    year: '년',
    years: '년',
    noRepeat: '반복 안 함',
    daily: '매일',
    weekly: '매주',
    monthly: '매월',
    yearly: '매년'
  },
  ms: {
    frequency: 'Ulang',
    every: 'Setiap',
    day: 'hari',
    days: 'hari',
    week: 'minggu',
    weeks: 'minggu',
    month: 'bulan',
    months: 'bulan',
    year: 'tahun',
    years: 'tahun',
    noRepeat: 'Tidak berulang',
    daily: 'Harian',
    weekly: 'Mingguan',
    monthly: 'Bulanan',
    yearly: 'Tahunan'
  },
  nl: {
    frequency: 'Herhalen',
    every: 'Elke',
    day: 'dag',
    days: 'dagen',
    week: 'week',
    weeks: 'weken',
    month: 'maand',
    months: 'maanden',
    year: 'jaar',
    years: 'jaren',
    noRepeat: 'Herhaalt niet',
    daily: 'Dagelijks',
    weekly: 'Wekelijks',
    monthly: 'Maandelijks',
    yearly: 'Jaarlijks'
  },
  pa: {
    frequency: 'ਦੁਹਰਾਓ',
    every: 'ਹਰ',
    day: 'ਦਿਨ',
    days: 'ਦਿਨ',
    week: 'ਹਫ਼ਤਾ',
    weeks: 'ਹਫ਼ਤੇ',
    month: 'ਮਹੀਨਾ',
    months: 'ਮਹੀਨੇ',
    year: 'ਸਾਲ',
    years: 'ਸਾਲ',
    noRepeat: 'ਦੁਹਰਾਈ ਨਹੀਂ',
    daily: 'ਰੋਜ਼ਾਨਾ',
    weekly: 'ਹਫ਼ਤਾਵਾਰੀ',
    monthly: 'ਮਹੀਨਾਵਾਰੀ',
    yearly: 'ਸਾਲਾਨਾ'
  },
  pl: {
    frequency: 'Powtarzaj',
    every: 'Co',
    day: 'dzień',
    days: 'dni',
    week: 'tydzień',
    weeks: 'tygodnie',
    month: 'miesiąc',
    months: 'miesiące',
    year: 'rok',
    years: 'lata',
    noRepeat: 'Nie powtarza się',
    daily: 'Codziennie',
    weekly: 'Co tydzień',
    monthly: 'Co miesiąc',
    yearly: 'Co rok'
  },
  pt: {
    frequency: 'Repetir',
    every: 'Cada',
    day: 'dia',
    days: 'dias',
    week: 'semana',
    weeks: 'semanas',
    month: 'mês',
    months: 'meses',
    year: 'ano',
    years: 'anos',
    noRepeat: 'Não se repete',
    daily: 'Diariamente',
    weekly: 'Semanalmente',
    monthly: 'Mensalmente',
    yearly: 'Anualmente'
  },
  ro: {
    frequency: 'Repetă',
    every: 'Fiecare',
    day: 'zi',
    days: 'zile',
    week: 'săptămână',
    weeks: 'săptămâni',
    month: 'lună',
    months: 'luni',
    year: 'an',
    years: 'ani',
    noRepeat: 'Nu se repetă',
    daily: 'Zilnic',
    weekly: 'Săptămânal',
    monthly: 'Lunar',
    yearly: 'Anual'
  },
  ru: {
    frequency: 'Повтор',
    every: 'Каждый',
    day: 'день',
    days: 'дни',
    week: 'неделя',
    weeks: 'недели',
    month: 'месяц',
    months: 'месяцы',
    year: 'год',
    years: 'годы',
    noRepeat: 'Не повторяется',
    daily: 'Ежедневно',
    weekly: 'Еженедельно',
    monthly: 'Ежемесячно',
    yearly: 'Ежегодно'
  },
  sv: {
    frequency: 'Upprepa',
    every: 'Varje',
    day: 'dag',
    days: 'dagar',
    week: 'vecka',
    weeks: 'veckor',
    month: 'månad',
    months: 'månader',
    year: 'år',
    years: 'år',
    noRepeat: 'Upprepas inte',
    daily: 'Dagligen',
    weekly: 'Veckovis',
    monthly: 'Månadsvis',
    yearly: 'Årligen'
  },
  sw: {
    frequency: 'Rudia',
    every: 'Kila',
    day: 'siku',
    days: 'siku',
    week: 'wiki',
    weeks: 'wiki',
    month: 'mwezi',
    months: 'miezi',
    year: 'mwaka',
    years: 'miaka',
    noRepeat: 'Hairudii',
    daily: 'Kila siku',
    weekly: 'Kila wiki',
    monthly: 'Kila mwezi',
    yearly: 'Kila mwaka'
  },
  tr: {
    frequency: 'Tekrarla',
    every: 'Her',
    day: 'gün',
    days: 'gün',
    week: 'hafta',
    weeks: 'hafta',
    month: 'ay',
    months: 'ay',
    year: 'yıl',
    years: 'yıl',
    noRepeat: 'Tekrarlanmaz',
    daily: 'Günlük',
    weekly: 'Haftalık',
    monthly: 'Aylık',
    yearly: 'Yıllık'
  },
  yo: {
    frequency: 'Tún ṣe',
    every: 'Gbogbo',
    day: 'ọjọ',
    days: 'ọjọ',
    week: 'ọsẹ',
    weeks: 'ọsẹ',
    month: 'oṣu',
    months: 'oṣu',
    year: 'ọdun',
    years: 'ọdun',
    noRepeat: 'Ko tun ṣe',
    daily: 'Lojoojumọ',
    weekly: 'Lọsẹẹsẹ',
    monthly: 'Loṣooṣu',
    yearly: 'Lọdọọdun'
  },
  zh: {
    frequency: '重复',
    every: '每',
    day: '天',
    days: '天',
    week: '周',
    weeks: '周',
    month: '月',
    months: '个月',
    year: '年',
    years: '年',
    noRepeat: '不重复',
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
    yearly: '每年'
  }
};

// Error message translations
const errorTranslations = {
  ar: {
    failedToFetchNotes: 'فشل في تحميل الملاحظات',
    failedToLoadNotes: 'فشل في تحميل الملاحظات',
    failedToFetchTemplates: 'فشل في تحميل القوالب',
    failedToLoadTemplates: 'فشل في تحميل القوالب'
  },
  bn: {
    failedToFetchNotes: 'নোট লোড করতে ব্যর্থ',
    failedToLoadNotes: 'নোট লোড করতে ব্যর্থ',
    failedToFetchTemplates: 'টেমপ্লেট লোড করতে ব্যর্থ',
    failedToLoadTemplates: 'টেমপ্লেট লোড করতে ব্যর্থ'
  },
  ca: {
    failedToFetchNotes: 'Error en carregar les notes',
    failedToLoadNotes: 'Error en carregar les notes',
    failedToFetchTemplates: 'Error en carregar les plantilles',
    failedToLoadTemplates: 'Error en carregar les plantilles'
  },
  cs: {
    failedToFetchNotes: 'Nepodařilo se načíst poznámky',
    failedToLoadNotes: 'Nepodařilo se načíst poznámky',
    failedToFetchTemplates: 'Nepodařilo se načíst šablony',
    failedToLoadTemplates: 'Nepodařilo se načíst šablony'
  },
  da: {
    failedToFetchNotes: 'Kunne ikke indlæse noter',
    failedToLoadNotes: 'Kunne ikke indlæse noter',
    failedToFetchTemplates: 'Kunne ikke indlæse skabeloner',
    failedToLoadTemplates: 'Kunne ikke indlæse skabeloner'
  },
  de: {
    failedToFetchNotes: 'Notizen konnten nicht geladen werden',
    failedToLoadNotes: 'Notizen konnten nicht geladen werden',
    failedToFetchTemplates: 'Vorlagen konnten nicht geladen werden',
    failedToLoadTemplates: 'Vorlagen konnten nicht geladen werden'
  },
  el: {
    failedToFetchNotes: 'Αποτυχία φόρτωσης σημειώσεων',
    failedToLoadNotes: 'Αποτυχία φόρτωσης σημειώσεων',
    failedToFetchTemplates: 'Αποτυχία φόρτωσης προτύπων',
    failedToLoadTemplates: 'Αποτυχία φόρτωσης προτύπων'
  },
  et: {
    failedToFetchNotes: 'Märkmete laadimine ebaõnnestus',
    failedToLoadNotes: 'Märkmete laadimine ebaõnnestus',
    failedToFetchTemplates: 'Mallide laadimine ebaõnnestus',
    failedToLoadTemplates: 'Mallide laadimine ebaõnnestus'
  },
  eu: {
    failedToFetchNotes: 'Oharrak kargatzeak huts egin du',
    failedToLoadNotes: 'Oharrak kargatzeak huts egin du',
    failedToFetchTemplates: 'Txantiloiak kargatzeak huts egin du',
    failedToLoadTemplates: 'Txantiloiak kargatzeak huts egin du'
  },
  fi: {
    failedToFetchNotes: 'Muistiinpanojen lataaminen epäonnistui',
    failedToLoadNotes: 'Muistiinpanojen lataaminen epäonnistui',
    failedToFetchTemplates: 'Mallien lataaminen epäonnistui',
    failedToLoadTemplates: 'Mallien lataaminen epäonnistui'
  },
  fr: {
    failedToFetchNotes: 'Échec du chargement des notes',
    failedToLoadNotes: 'Échec du chargement des notes',
    failedToFetchTemplates: 'Échec du chargement des modèles',
    failedToLoadTemplates: 'Échec du chargement des modèles'
  },
  gl: {
    failedToFetchNotes: 'Erro ao cargar as notas',
    failedToLoadNotes: 'Erro ao cargar as notas',
    failedToFetchTemplates: 'Erro ao cargar os modelos',
    failedToLoadTemplates: 'Erro ao cargar os modelos'
  },
  ha: {
    failedToFetchNotes: 'Ba a sami bayanin kula ba',
    failedToLoadNotes: 'Ba a sami bayanin kula ba',
    failedToFetchTemplates: 'Ba a sami samfura ba',
    failedToLoadTemplates: 'Ba a sami samfura ba'
  },
  he: {
    failedToFetchNotes: 'טעינת ההערות נכשלה',
    failedToLoadNotes: 'טעינת ההערות נכשלה',
    failedToFetchTemplates: 'טעינת התבניות נכשלה',
    failedToLoadTemplates: 'טעינת התבניות נכשלה'
  },
  hi: {
    failedToFetchNotes: 'नोट्स लोड करने में विफल',
    failedToLoadNotes: 'नोट्स लोड करने में विफल',
    failedToFetchTemplates: 'टेम्पलेट लोड करने में विफल',
    failedToLoadTemplates: 'टेम्पलेट लोड करने में विफल'
  },
  hu: {
    failedToFetchNotes: 'Nem sikerült betölteni a jegyzeteket',
    failedToLoadNotes: 'Nem sikerült betölteni a jegyzeteket',
    failedToFetchTemplates: 'Nem sikerült betölteni a sablonokat',
    failedToLoadTemplates: 'Nem sikerült betölteni a sablonokat'
  },
  it: {
    failedToFetchNotes: 'Caricamento note fallito',
    failedToLoadNotes: 'Caricamento note fallito',
    failedToFetchTemplates: 'Caricamento modelli fallito',
    failedToLoadTemplates: 'Caricamento modelli fallito'
  },
  ja: {
    failedToFetchNotes: 'ノートの読み込みに失敗しました',
    failedToLoadNotes: 'ノートの読み込みに失敗しました',
    failedToFetchTemplates: 'テンプレートの読み込みに失敗しました',
    failedToLoadTemplates: 'テンプレートの読み込みに失敗しました'
  },
  ko: {
    failedToFetchNotes: '노트 로드 실패',
    failedToLoadNotes: '노트 로드 실패',
    failedToFetchTemplates: '템플릿 로드 실패',
    failedToLoadTemplates: '템플릿 로드 실패'
  },
  ms: {
    failedToFetchNotes: 'Gagal memuatkan nota',
    failedToLoadNotes: 'Gagal memuatkan nota',
    failedToFetchTemplates: 'Gagal memuatkan templat',
    failedToLoadTemplates: 'Gagal memuatkan templat'
  },
  nl: {
    failedToFetchNotes: 'Notities laden mislukt',
    failedToLoadNotes: 'Notities laden mislukt',
    failedToFetchTemplates: 'Sjablonen laden mislukt',
    failedToLoadTemplates: 'Sjablonen laden mislukt'
  },
  pa: {
    failedToFetchNotes: 'ਨੋਟਸ ਲੋਡ ਕਰਨ ਵਿੱਚ ਅਸਫਲ',
    failedToLoadNotes: 'ਨੋਟਸ ਲੋਡ ਕਰਨ ਵਿੱਚ ਅਸਫਲ',
    failedToFetchTemplates: 'ਟੈਂਪਲੇਟ ਲੋਡ ਕਰਨ ਵਿੱਚ ਅਸਫਲ',
    failedToLoadTemplates: 'ਟੈਂਪਲੇਟ ਲੋਡ ਕਰਨ ਵਿੱਚ ਅਸਫਲ'
  },
  pl: {
    failedToFetchNotes: 'Nie udało się załadować notatek',
    failedToLoadNotes: 'Nie udało się załadować notatek',
    failedToFetchTemplates: 'Nie udało się załadować szablonów',
    failedToLoadTemplates: 'Nie udało się załadować szablonów'
  },
  pt: {
    failedToFetchNotes: 'Falha ao carregar notas',
    failedToLoadNotes: 'Falha ao carregar notas',
    failedToFetchTemplates: 'Falha ao carregar modelos',
    failedToLoadTemplates: 'Falha ao carregar modelos'
  },
  ro: {
    failedToFetchNotes: 'Eșec la încărcarea notițelor',
    failedToLoadNotes: 'Eșec la încărcarea notițelor',
    failedToFetchTemplates: 'Eșec la încărcarea șabloanelor',
    failedToLoadTemplates: 'Eșec la încărcarea șabloanelor'
  },
  ru: {
    failedToFetchNotes: 'Не удалось загрузить заметки',
    failedToLoadNotes: 'Не удалось загрузить заметки',
    failedToFetchTemplates: 'Не удалось загрузить шаблоны',
    failedToLoadTemplates: 'Не удалось загрузить шаблоны'
  },
  sv: {
    failedToFetchNotes: 'Kunde inte ladda anteckningar',
    failedToLoadNotes: 'Kunde inte ladda anteckningar',
    failedToFetchTemplates: 'Kunde inte ladda mallar',
    failedToLoadTemplates: 'Kunde inte ladda mallar'
  },
  sw: {
    failedToFetchNotes: 'Imeshindwa kupakia vidokezo',
    failedToLoadNotes: 'Imeshindwa kupakia vidokezo',
    failedToFetchTemplates: 'Imeshindwa kupakia violezo',
    failedToLoadTemplates: 'Imeshindwa kupakia violezo'
  },
  tr: {
    failedToFetchNotes: 'Notlar yüklenemedi',
    failedToLoadNotes: 'Notlar yüklenemedi',
    failedToFetchTemplates: 'Şablonlar yüklenemedi',
    failedToLoadTemplates: 'Şablonlar yüklenemedi'
  },
  yo: {
    failedToFetchNotes: 'Kuna lati ṣe akọsilẹ',
    failedToLoadNotes: 'Kuna lati ṣe akọsilẹ',
    failedToFetchTemplates: 'Kuna lati ṣe awoṣe',
    failedToLoadTemplates: 'Kuna lati ṣe awoṣe'
  },
  zh: {
    failedToFetchNotes: '加载笔记失败',
    failedToLoadNotes: '加载笔记失败',
    failedToFetchTemplates: '加载模板失败',
    failedToLoadTemplates: '加载模板失败'
  }
};

// publicProfile translations
const publicProfileTranslations = {
  ar: {
    cloneList: 'نسخ القائمة',
    cloneListSuccess: 'تم نسخ القائمة بنجاح!',
    cloneListFailed: 'فشل نسخ القائمة',
    createProfile: 'إنشاء ملف شخصي'
  },
  bn: {
    cloneList: 'তালিকা ক্লোন করুন',
    cloneListSuccess: 'তালিকা সফলভাবে ক্লোন করা হয়েছে!',
    cloneListFailed: 'তালিকা ক্লোন করতে ব্যর্থ',
    createProfile: 'প্রোফাইল তৈরি করুন'
  },
  ca: {
    cloneList: 'Clonar llista',
    cloneListSuccess: 'Llista clonada correctament!',
    cloneListFailed: 'Error al clonar la llista',
    createProfile: 'Crear perfil'
  },
  cs: {
    cloneList: 'Klonovat seznam',
    cloneListSuccess: 'Seznam úspěšně naklonován!',
    cloneListFailed: 'Klonování seznamu se nezdařilo',
    createProfile: 'Vytvořit profil'
  },
  da: {
    cloneList: 'Klon liste',
    cloneListSuccess: 'Liste klonet med succes!',
    cloneListFailed: 'Kloning af liste mislykkedes',
    createProfile: 'Opret profil'
  },
  de: {
    cloneList: 'Liste klonen',
    cloneListSuccess: 'Liste erfolgreich geklont!',
    cloneListFailed: 'Liste konnte nicht geklont werden',
    createProfile: 'Profil erstellen'
  },
  el: {
    cloneList: 'Κλωνοποίηση λίστας',
    cloneListSuccess: 'Η λίστα κλωνοποιήθηκε επιτυχώς!',
    cloneListFailed: 'Αποτυχία κλωνοποίησης λίστας',
    createProfile: 'Δημιουργία προφίλ'
  },
  et: {
    cloneList: 'Klooni loend',
    cloneListSuccess: 'Loend kloonitud edukalt!',
    cloneListFailed: 'Loendi kloonimineepäon nestus',
    createProfile: 'Loo profiil'
  },
  eu: {
    cloneList: 'Klonatu zerrenda',
    cloneListSuccess: 'Zerrenda ondo klonatu da!',
    cloneListFailed: 'Zerrenda klonatzeak huts egin du',
    createProfile: 'Sortu profila'
  },
  fi: {
    cloneList: 'Kloonaa luettelo',
    cloneListSuccess: 'Luettelo kloonattu onnistuneesti!',
    cloneListFailed: 'Luettelon kloonaus epäonnistui',
    createProfile: 'Luo profiili'
  },
  fr: {
    cloneList: 'Cloner la liste',
    cloneListSuccess: 'Liste clonée avec succès!',
    cloneListFailed: 'Échec du clonage de la liste',
    createProfile: 'Créer un profil'
  },
  gl: {
    cloneList: 'Clonar lista',
    cloneListSuccess: 'Lista clonada correctamente!',
    cloneListFailed: 'Erro ao clonar a lista',
    createProfile: 'Crear perfil'
  },
  ha: {
    cloneList: 'Kwafi jerin',
    cloneListSuccess: 'An sami nasarar kwafi jerin!',
    cloneListFailed: 'An kasa kwafi jerin',
    createProfile: 'Ƙirƙiri bayanan martaba'
  },
  he: {
    cloneList: 'שכפל רשימה',
    cloneListSuccess: 'הרשימה שוכפלה בהצלחה!',
    cloneListFailed: 'שכפול הרשימה נכשל',
    createProfile: 'צור פרופיל'
  },
  hi: {
    cloneList: 'सूची क्लोन करें',
    cloneListSuccess: 'सूची सफलतापूर्वक क्लोन की गई!',
    cloneListFailed: 'सूची क्लोन करने में विफल',
    createProfile: 'प्रोफाइल बनाएं'
  },
  hu: {
    cloneList: 'Lista klónozása',
    cloneListSuccess: 'Lista sikeresen klónozva!',
    cloneListFailed: 'A lista klónozása sikertelen',
    createProfile: 'Profil létrehozása'
  },
  it: {
    cloneList: 'Clona lista',
    cloneListSuccess: 'Lista clonata con successo!',
    cloneListFailed: 'Clonazione lista fallita',
    createProfile: 'Crea profilo'
  },
  ja: {
    cloneList: 'リストをクローン',
    cloneListSuccess: 'リストのクローンに成功しました!',
    cloneListFailed: 'リストのクローンに失敗しました',
    createProfile: 'プロフィールを作成'
  },
  ko: {
    cloneList: '목록 복제',
    cloneListSuccess: '목록이 성공적으로 복제되었습니다!',
    cloneListFailed: '목록 복제 실패',
    createProfile: '프로필 생성'
  },
  ms: {
    cloneList: 'Klon senarai',
    cloneListSuccess: 'Senarai berjaya diklon!',
    cloneListFailed: 'Gagal mengklon senarai',
    createProfile: 'Cipta profil'
  },
  nl: {
    cloneList: 'Lijst klonen',
    cloneListSuccess: 'Lijst succesvol gekloond!',
    cloneListFailed: 'Lijst klonen mislukt',
    createProfile: 'Profiel aanmaken'
  },
  pa: {
    cloneList: 'ਸੂਚੀ ਕਲੋਨ ਕਰੋ',
    cloneListSuccess: 'ਸੂਚੀ ਸਫਲਤਾਪੂਰਵਕ ਕਲੋਨ ਕੀਤੀ ਗਈ!',
    cloneListFailed: 'ਸੂਚੀ ਕਲੋਨ ਕਰਨ ਵਿੱਚ ਅਸਫਲ',
    createProfile: 'ਪ੍ਰੋਫਾਈਲ ਬਣਾਓ'
  },
  pl: {
    cloneList: 'Klonuj listę',
    cloneListSuccess: 'Lista sklonowana pomyślnie!',
    cloneListFailed: 'Klonowanie listy nie powiodło się',
    createProfile: 'Utwórz profil'
  },
  pt: {
    cloneList: 'Clonar lista',
    cloneListSuccess: 'Lista clonada com sucesso!',
    cloneListFailed: 'Falha ao clonar lista',
    createProfile: 'Criar perfil'
  },
  ro: {
    cloneList: 'Clonează lista',
    cloneListSuccess: 'Listă clonată cu succes!',
    cloneListFailed: 'Eșec la clonarea listei',
    createProfile: 'Creează profil'
  },
  ru: {
    cloneList: 'Клонировать список',
    cloneListSuccess: 'Список успешно клонирован!',
    cloneListFailed: 'Не удалось клонировать список',
    createProfile: 'Создать профиль'
  },
  sv: {
    cloneList: 'Klona lista',
    cloneListSuccess: 'Lista klonad framgångsrikt!',
    cloneListFailed: 'Kunde inte klona lista',
    createProfile: 'Skapa profil'
  },
  sw: {
    cloneList: 'Nakili orodha',
    cloneListSuccess: 'Orodha imenakiliwa kwa mafanikio!',
    cloneListFailed: 'Imeshindwa kunakili orodha',
    createProfile: 'Unda wasifu'
  },
  tr: {
    cloneList: 'Listeyi kopyala',
    cloneListSuccess: 'Liste başarıyla kopyalandı!',
    cloneListFailed: 'Liste kopyalama başarısız',
    createProfile: 'Profil oluştur'
  },
  yo: {
    cloneList: 'Ṣẹda atokọ',
    cloneListSuccess: 'Atokọ ti ṣẹda daadaa!',
    cloneListFailed: 'Kuna lati ṣẹda atokọ',
    createProfile: 'Ṣẹda profaili'
  },
  zh: {
    cloneList: '克隆列表',
    cloneListSuccess: '列表克隆成功!',
    cloneListFailed: '克隆列表失败',
    createProfile: '创建个人资料'
  }
};

// Publishing translations
const publishingTranslations = {
  ar: 'جاري النشر...',
  bn: 'প্রকাশ করা হচ্ছে...',
  ca: 'Publicant...',
  cs: 'Zveřejňování...',
  da: 'Udgiver...',
  de: 'Veröffentlichen...',
  el: 'Δημοσίευση...',
  et: 'Avaldamine...',
  eu: 'Argitaratzen...',
  fi: 'Julkaistaan...',
  fr: 'Publication...',
  gl: 'Publicando...',
  ha: 'Ana bugawa...',
  he: 'מפרסם...',
  hi: 'प्रकाशन...',
  hu: 'Közzététel...',
  it: 'Pubblicazione...',
  ja: '公開中...',
  ko: '게시 중...',
  ms: 'Menerbitkan...',
  nl: 'Publiceren...',
  pa: 'ਪ੍ਰਕਾਸ਼ਿਤ ਕੀਤਾ ਜਾ ਰਿਹਾ ਹੈ...',
  pl: 'Publikowanie...',
  pt: 'Publicando...',
  ro: 'Publicare...',
  ru: 'Публикация...',
  sv: 'Publicerar...',
  sw: 'Inachapisha...',
  tr: 'Yayınlanıyor...',
  yo: 'Nigbagbọgbọ...',
  zh: '发布中...'
};

// Task edit translations
const taskEditTranslations = {
  ar: { edit: 'تعديل', editTitle: 'تعديل المهمة', saveTask: 'حفظ المهمة' },
  bn: { edit: 'সম্পাদনা', editTitle: 'টাস্ক সম্পাদনা', saveTask: 'টাস্ক সংরক্ষণ করুন' },
  ca: { edit: 'Editar', editTitle: 'Editar tasca', saveTask: 'Desa la tasca' },
  cs: { edit: 'Upravit', editTitle: 'Upravit úkol', saveTask: 'Uložit úkol' },
  da: { edit: 'Rediger', editTitle: 'Rediger opgave', saveTask: 'Gem opgave' },
  de: { edit: 'Bearbeiten', editTitle: 'Aufgabe bearbeiten', saveTask: 'Aufgabe speichern' },
  el: { edit: 'Επεξεργασία', editTitle: 'Επεξεργασία εργασίας', saveTask: 'Αποθήκευση εργασίας' },
  et: { edit: 'Muuda', editTitle: 'Muuda ülesannet', saveTask: 'Salvesta ülesanne' },
  eu: { edit: 'Editatu', editTitle: 'Editatu zeregina', saveTask: 'Gorde zeregina' },
  fi: { edit: 'Muokkaa', editTitle: 'Muokkaa tehtävää', saveTask: 'Tallenna tehtävä' },
  fr: { edit: 'Modifier', editTitle: 'Modifier la tâche', saveTask: 'Enregistrer la tâche' },
  gl: { edit: 'Editar', editTitle: 'Editar tarefa', saveTask: 'Gardar tarefa' },
  ha: { edit: 'Gyara', editTitle: 'Gyara aiki', saveTask: 'Ajiye aiki' },
  he: { edit: 'ערוך', editTitle: 'ערוך משימה', saveTask: 'שמור משימה' },
  hi: { edit: 'संपादित करें', editTitle: 'कार्य संपादित करें', saveTask: 'कार्य सहेजें' },
  hu: { edit: 'Szerkesztés', editTitle: 'Feladat szerkesztése', saveTask: 'Feladat mentése' },
  it: { edit: 'Modifica', editTitle: 'Modifica attività', saveTask: 'Salva attività' },
  ja: { edit: '編集', editTitle: 'タスクを編集', saveTask: 'タスクを保存' },
  ko: { edit: '편집', editTitle: '작업 편집', saveTask: '작업 저장' },
  ms: { edit: 'Sunting', editTitle: 'Sunting tugas', saveTask: 'Simpan tugas' },
  nl: { edit: 'Bewerken', editTitle: 'Taak bewerken', saveTask: 'Taak opslaan' },
  pa: { edit: 'ਸੰਪਾਦਿਤ ਕਰੋ', editTitle: 'ਕੰਮ ਸੰਪਾਦਿਤ ਕਰੋ', saveTask: 'ਕੰਮ ਸੁਰੱਖਿਅਤ ਕਰੋ' },
  pl: { edit: 'Edytuj', editTitle: 'Edytuj zadanie', saveTask: 'Zapisz zadanie' },
  pt: { edit: 'Editar', editTitle: 'Editar tarefa', saveTask: 'Salvar tarefa' },
  ro: { edit: 'Editare', editTitle: 'Editare sarcină', saveTask: 'Salvare sarcină' },
  ru: { edit: 'Редактировать', editTitle: 'Редактировать задачу', saveTask: 'Сохранить задачу' },
  sv: { edit: 'Redigera', editTitle: 'Redigera uppgift', saveTask: 'Spara uppgift' },
  sw: { edit: 'Hariri', editTitle: 'Hariri kazi', saveTask: 'Hifadhi kazi' },
  tr: { edit: 'Düzenle', editTitle: 'Görevi düzenle', saveTask: 'Görevi kaydet' },
  yo: { edit: 'Ṣatunkọ', editTitle: 'Ṣatunkọ iṣẹ', saveTask: 'Fi iṣẹ pamọ' },
  zh: { edit: '编辑', editTitle: '编辑任务', saveTask: '保存任务' }
};

const locales = [
  'ar', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'et', 'eu',
  'fi', 'fr', 'gl', 'ha', 'he', 'hi', 'hu', 'it', 'ja', 'ko',
  'ms', 'nl', 'pa', 'pl', 'pt', 'ro', 'ru', 'sv', 'sw', 'tr',
  'yo', 'zh'
];

let updateCount = 0;

locales.forEach(locale => {
  const filePath = path.join(__dirname, 'src', 'locales', `${locale}.json`);

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    let json = JSON.parse(content);
    let updated = false;

    // Add tasks.edit if missing
    if (!json.tasks) json.tasks = {};
    if (!json.tasks.edit) {
      json.tasks.edit = taskEditTranslations[locale].edit;
      updated = true;
    }

    // Add forms sections if missing
    if (!json.forms) json.forms = {};
    if (!json.forms.addTaskForm) json.forms.addTaskForm = {};
    if (!json.forms.addTaskForm.editTitle) {
      json.forms.addTaskForm.editTitle = taskEditTranslations[locale].editTitle;
      updated = true;
    }
    if (!json.forms.addTaskForm.saveTask) {
      json.forms.addTaskForm.saveTask = taskEditTranslations[locale].saveTask;
      updated = true;
    }

    // Add recurrencePicker if missing
    if (!json.forms.recurrencePicker) {
      json.forms.recurrencePicker = recurrencePickerTranslations[locale];
      updated = true;
    }

    // Update error messages
    if (json.errors) {
      if (json.errors.failedToFetchNotes && json.errors.failedToFetchNotes.startsWith('Failed')) {
        json.errors.failedToFetchNotes = errorTranslations[locale].failedToFetchNotes;
        json.errors.failedToLoadNotes = errorTranslations[locale].failedToLoadNotes;
        json.errors.failedToFetchTemplates = errorTranslations[locale].failedToFetchTemplates;
        json.errors.failedToLoadTemplates = errorTranslations[locale].failedToLoadTemplates;
        updated = true;
      }
    }

    // Update publicProfile strings
    if (json.publicProfile) {
      if (json.publicProfile.cloneList && json.publicProfile.cloneList.startsWith('Clone')) {
        json.publicProfile.cloneList = publicProfileTranslations[locale].cloneList;
        json.publicProfile.cloneListSuccess = publicProfileTranslations[locale].cloneListSuccess;
        json.publicProfile.cloneListFailed = publicProfileTranslations[locale].cloneListFailed;
        updated = true;
      }
    }

    // Add createProfile if missing
    if (json.profile && !json.profile.createProfile) {
      json.profile.createProfile = publicProfileTranslations[locale].createProfile;
      updated = true;
    }

    // Update publishing string
    if (json.mood && json.mood.publish && json.mood.publish.publishing && json.mood.publish.publishing.startsWith('Publishing')) {
      json.mood.publish.publishing = publishingTranslations[locale];
      updated = true;
    }

    if (updated) {
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
      console.log(`✓ Updated ${locale}.json`);
      updateCount++;
    }
  }
});

console.log(`\nCompleted! Updated ${updateCount} locale files.`);
