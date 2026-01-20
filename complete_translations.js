const fs = require('fs');
const path = require('path');

// Translation mappings for missing keys by language
const translations = {
  // Missing keys that need to be added to all locales
  missing: {
    'tasks.edit': {
      ar: 'تعديل',
      bn: 'সম্পাদনা',
      ca: 'Editar',
      cs: 'Upravit',
      da: 'Rediger',
      de: 'Bearbeiten',
      el: 'Επεξεργασία',
      es: 'Editar', // Already done
      et: 'Muuda',
      eu: 'Editatu',
      fi: 'Muokkaa',
      fr: 'Modifier',
      gl: 'Editar',
      ha: 'Gyara',
      he: 'ערוך',
      hi: 'संपादित करें',
      hu: 'Szerkesztés',
      it: 'Modifica',
      ja: '編集',
      ko: '편집',
      ms: 'Sunting',
      nl: 'Bewerken',
      pa: 'ਸੰਪਾਦਿਤ ਕਰੋ',
      pl: 'Edytuj',
      pt: 'Editar',
      ro: 'Editare',
      ru: 'Редактировать',
      sv: 'Redigera',
      sw: 'Hariri',
      tr: 'Düzenle',
      yo: 'Ṣatunkọ',
      zh: '编辑'
    },
    'forms.addTaskForm.editTitle': {
      ar: 'تعديل المهمة',
      bn: 'টাস্ক সম্পাদনা',
      ca: 'Editar tasca',
      cs: 'Upravit úkol',
      da: 'Rediger opgave',
      de: 'Aufgabe bearbeiten',
      el: 'Επεξεργασία εργασίας',
      es: 'Editar tarea', // Already done
      et: 'Muuda ülesannet',
      eu: 'Editatu zeregina',
      fi: 'Muokkaa tehtävää',
      fr: 'Modifier la tâche',
      gl: 'Editar tarefa',
      ha: 'Gyara aiki',
      he: 'ערוך משימה',
      hi: 'कार्य संपादित करें',
      hu: 'Feladat szerkesztése',
      it: 'Modifica attività',
      ja: 'タスクを編集',
      ko: '작업 편집',
      ms: 'Sunting tugas',
      nl: 'Taak bewerken',
      pa: 'ਕੰਮ ਸੰਪਾਦਿਤ ਕਰੋ',
      pl: 'Edytuj zadanie',
      pt: 'Editar tarefa',
      ro: 'Editare sarcină',
      ru: 'Редактировать задачу',
      sv: 'Redigera uppgift',
      sw: 'Hariri kazi',
      tr: 'Görevi düzenle',
      yo: 'Ṣatunkọ iṣẹ',
      zh: '编辑任务'
    },
    'forms.addTaskForm.saveTask': {
      ar: 'حفظ المهمة',
      bn: 'টাস্ক সংরক্ষণ করুন',
      ca: 'Desa la tasca',
      cs: 'Uložit úkol',
      da: 'Gem opgave',
      de: 'Aufgabe speichern',
      el: 'Αποθήκευση εργασίας',
      es: 'Guardar tarea', // Already done
      et: 'Salvesta ülesanne',
      eu: 'Gorde zeregina',
      fi: 'Tallenna tehtävä',
      fr: 'Enregistrer la tâche',
      gl: 'Gardar tarefa',
      ha: 'Ajiye aiki',
      he: 'שמור משימה',
      hi: 'कार्य सहेजें',
      hu: 'Feladat mentése',
      it: 'Salva attività',
      ja: 'タスクを保存',
      ko: '작업 저장',
      ms: 'Simpan tugas',
      nl: 'Taak opslaan',
      pa: 'ਕੰਮ ਸੁਰੱਖਿਅਤ ਕਰੋ',
      pl: 'Zapisz zadanie',
      pt: 'Salvar tarefa',
      ro: 'Salvare sarcină',
      ru: 'Сохранить задачу',
      sv: 'Spara uppgift',
      sw: 'Hifadhi kazi',
      tr: 'Görevi kaydet',
      yo: 'Fi iṣẹ pamọ',
      zh: '保存任务'
    }
  }
};

// Locale codes (excluding English which is the source)
const locales = [
  'ar', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'es', 'et', 'eu',
  'fi', 'fr', 'gl', 'ha', 'he', 'hi', 'hu', 'it', 'ja', 'ko',
  'ms', 'nl', 'pa', 'pl', 'pt', 'ro', 'ru', 'sv', 'sw', 'tr',
  'yo', 'zh'
];

console.log('Translation completion script');
console.log('This script identifies missing keys but translations must be added manually for accuracy.');
console.log('\nMissing keys by locale:\n');

// List missing translations
locales.forEach(locale => {
  const filePath = path.join(__dirname, 'src', 'locales', `${locale}.json`);

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);

    console.log(`\n${locale}.json:`);

    // Check for tasks.edit
    if (!json.tasks || !json.tasks.edit) {
      console.log(`  - Missing: tasks.edit = "${translations.missing['tasks.edit'][locale]}"`);
    }

    // Check for forms.addTaskForm.editTitle
    if (!json.forms || !json.forms.addTaskForm || !json.forms.addTaskForm.editTitle) {
      console.log(`  - Missing: forms.addTaskForm.editTitle = "${translations.missing['forms.addTaskForm.editTitle'][locale]}"`);
    }

    // Check for forms.addTaskForm.saveTask
    if (!json.forms || !json.forms.addTaskForm || !json.forms.addTaskForm.saveTask) {
      console.log(`  - Missing: forms.addTaskForm.saveTask = "${translations.missing['forms.addTaskForm.saveTask'][locale]}"`);
    }

    // Check for recurrencePicker
    if (!json.forms || !json.forms.recurrencePicker) {
      console.log(`  - Missing: entire forms.recurrencePicker section (15 keys)`);
    }

    // Check for error messages in English
    if (json.errors) {
      if (json.errors.failedToFetchNotes && json.errors.failedToFetchNotes.startsWith('Failed')) {
        console.log(`  - Has untranslated error messages`);
      }
    }

    // Check for publicProfile English strings
    if (json.publicProfile) {
      if (json.publicProfile.cloneList && json.publicProfile.cloneList.startsWith('Clone')) {
        console.log(`  - Has untranslated publicProfile entries`);
      }
    }

    // Check for publishing field
    if (json.mood && json.mood.publish && json.mood.publish.publishing && json.mood.publish.publishing.startsWith('Publishing')) {
      console.log(`  - Has untranslated mood.publish.publishing`);
    }
  }
});

console.log('\n\nNote: Manual translation recommended for accuracy and cultural appropriateness.');
