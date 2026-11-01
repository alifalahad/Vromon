/**
 * Date and time formatters, made once per language and options. Hermes builds a new
 * Intl.DateTimeFormat on every toLocaleDateString / toLocaleTimeString call, which cost
 * milliseconds per chat bubble and per chat in the list (friends and chat step 10).
 * `dateFormat(lang, options).format(date)` gives the same text as `date.toLocale…String(lang, options)`
 * whenever the options name the fields to show, as every caller here does.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

export function dateFormat(lang: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${lang}|${JSON.stringify(options)}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(lang, options);
    formatters.set(key, format);
  }
  return format;
}
