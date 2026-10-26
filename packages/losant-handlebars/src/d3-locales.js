import * as d3Format from 'd3-format';

// this is the data from the individual JSON files in d3-format, all together
// because it was a pain to actually deal with all the individual files
// in such a way that it would work both in Node and Webpack
export const d3localeData = {
  'ar-001': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ''],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-ae': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u062f\u002e\u0625\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-bh': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u062f\u002e\u0628\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-dj': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['\u200f\u0046\u0064\u006a ', ''],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-dz': {
    decimal: '\u002c',
    thousands: '\u002e',
    grouping: [3],
    currency: ['\u062f\u002e\u062c\u002e ', '']
  },
  'ar-eg': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u062c\u002e\u0645\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-eh': {
    decimal: '\u002e',
    thousands: '\u002c',
    grouping: [3],
    currency: ['\u062f\u002e\u0645\u002e ', '']
  },
  'ar-er': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['\u004e\u0066\u006b ', ''],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-il': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['\u20aa ', ''],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-iq': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u062f\u002e\u0639\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-jo': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u062f\u002e\u0623\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-km': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u0641\u002e\u062c\u002e\u0642\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-kw': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u062f\u002e\u0643\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-lb': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u0644\u002e\u0644\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-ly': {
    decimal: '\u002c',
    thousands: '\u002e',
    grouping: [3],
    currency: ['\u062f\u002e\u0644\u002e ', '']
  },
  'ar-ma': {
    decimal: '\u002c',
    thousands: '\u002e',
    grouping: [3],
    currency: ['\u062f\u002e\u0645\u002e ', '']
  },
  'ar-mr': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u0623\u002e\u0645\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-om': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u0631\u002e\u0639\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-ps': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['\u20aa ', ''],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-qa': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u0631\u002e\u0642\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-sa': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u0631\u002e\u0633\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-sd': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u062c\u002e\u0633\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-so': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['\u200f\u0053 ', ''],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-ss': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['\u00a3 ', ''],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-sy': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u0644\u002e\u0633\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-td': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['\u200f\u0046\u0043\u0046\u0041 ', ''],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ar-tn': {
    decimal: '\u002c',
    thousands: '\u002e',
    grouping: [3],
    currency: ['\u062f\u002e\u062a\u002e ', '']
  },
  'ar-ye': {
    decimal: '\u066b',
    thousands: '\u066c',
    grouping: [3],
    currency: ['', ' \u0631\u002e\u0649\u002e'],
    numerals: ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']
  },
  'ca-es': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['', '\u00a0€']
  },
  'cs-cz': {
    decimal: ',',
    thousands: '\u00a0',
    grouping: [3],
    currency: ['', '\u00a0Kč']
  },
  'da-dk': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['', ' kr']
  },
  'de-ch': {
    decimal: ',',
    thousands: "'",
    grouping: [3],
    currency: ['', '\u00a0CHF']
  },
  'de-de': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['', '\u00a0€']
  },
  'en-ca': {
    decimal: '.',
    thousands: ',',
    grouping: [3],
    currency: ['$', '']
  },
  'en-gb': {
    decimal: '.',
    thousands: ',',
    grouping: [3],
    currency: ['£', '']
  },
  'en-ie': {
    decimal: '.',
    thousands: ',',
    grouping: [3],
    currency: ['€', '']
  },
  'en-in': {
    decimal: '.',
    thousands: ',',
    grouping: [3, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    currency: ['₹', '']
  },
  'en-us': {
    decimal: '.',
    thousands: ',',
    grouping: [3],
    currency: ['$', '']
  },
  'es-bo': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['Bs\u00a0', ''],
    percent: '\u202f%'
  },
  'es-es': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['', '\u00a0€']
  },
  'es-mx': {
    decimal: '.',
    thousands: ',',
    grouping: [3],
    currency: ['$', '']
  },
  'fi-fi': {
    decimal: ',',
    thousands: '\u00a0',
    grouping: [3],
    currency: ['', '\u00a0€']
  },
  'fr-ca': {
    decimal: ',',
    thousands: '\u00a0',
    grouping: [3],
    currency: ['', '$']
  },
  'fr-fr': {
    decimal: ',',
    thousands: '\u00a0',
    grouping: [3],
    currency: ['', '\u00a0€'],
    percent: '\u202f%'
  },
  'he-il': {
    decimal: '.',
    thousands: ',',
    grouping: [3],
    currency: ['₪', '']
  },
  'hu-hu': {
    decimal: ',',
    thousands: '\u00a0',
    grouping: [3],
    currency: ['', '\u00a0Ft']
  },
  'it-it': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['€', '']
  },
  'ja-jp': {
    decimal: '.',
    thousands: ',',
    grouping: [3],
    currency: ['', '円']
  },
  'ko-kr': {
    decimal: '.',
    thousands: ',',
    grouping: [3],
    currency: ['₩', '']
  },
  'mk-mk': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['', '\u00a0ден.']
  },
  'nl-nl': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['€\u00a0', '']
  },
  'pl-pl': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['', 'zł']
  },
  'pt-br': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['R$', '']
  },
  'pt-pt': {
    decimal: ',',
    thousands: '\u00a0',
    grouping: [3],
    currency: ['', '\u00a0€']
  },
  'ru-ru': {
    decimal: ',',
    thousands: '\u00a0',
    grouping: [3],
    currency: ['', '\u00a0руб.']
  },
  'sl-si': {
    decimal: ',',
    thousands: '.',
    grouping: [3],
    currency: ['', '\u00a0€']
  },
  'sv-se': {
    decimal: ',',
    thousands: '\u00a0',
    grouping: [3],
    currency: ['', ' kr']
  },
  'uk-ua': {
    decimal: ',',
    thousands: '\u00a0',
    grouping: [3],
    currency: ['', '\u00a0₴.']
  },
  'zh-cn': {
    decimal: '.',
    thousands: ',',
    grouping: [3],
    currency: ['¥', '']
  }
};

export const d3ByLocale = {
  default: d3Format.format
};

Object.keys(d3localeData).forEach((locale) => {
  const formatter = d3Format.formatLocale(d3localeData[locale]).format;
  d3ByLocale[locale] = formatter;

  const lang = locale.split('-')[0];
  if (!d3localeData[lang]) {
    d3localeData[lang] = d3localeData[locale];
    d3ByLocale[lang] = formatter;
  }
});
