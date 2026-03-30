import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Development utilities
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Currency utilities
export function formatCurrency(
  value: number,
  currency: string = "BRL",
  locale = "pt-BR"
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(value);
}

export function getCurrencyDecimalLength(
  currency: string = "BRL",
  locale = "pt-BR"
) {
  return (
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).resolvedOptions().minimumFractionDigits || 0
  );
}

export function extractCurrencyText(
  value: string,
  currency: string = "BRL",
  locale?: string
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });

  formatter.formatToParts(10000000).forEach((part) => {
    if (["currency", "group", "literal"].includes(part.type))
      value = value.replace(part.value, "");
    else if (part.type === "decimal") value = value.replace(part.value, ".");
  });

  return value || "0";
}

export function extractCurrency(
  value: string,
  currency: string = "BRL",
  locale = "pt-BR"
): number {
  return parseFloat(extractCurrencyText(value, currency, locale));
}

export function extractNumberFromFormattedCurrency(value: string) {
  return (
    value
      .split(" ")
      .map((it) => {
        if (it.includes(",")) it = it.replaceAll(".", "").replaceAll(",", ".");
        return parseFloat(it);
      })
      .find((it) => !Number.isNaN(it)) || 0
  );
}

const currencyMap = new Map([
  ["R$", "BRL"],
  ["$", "USD"],
  ["€", "EUR"],
  ["£", "GBP"],
]);

export function amountToNumber(amount: string): number {
  if (amount.includes(","))
    amount = amount.replace(/\./g, "").replace(",", ".");

  return parseFloat(amount);
}

export function extractCurrencyAndAmount(text: string): {
  amount: number;
  currency?: string;
} {
  const match = text.match(/^\s*([^\d\-.,]*)\s*([-]?\d[\d.,]*)\s*$/);

  if (!match) {
    return {
      amount: parseFloat(text),
    };
  }

  const symbol = match[1]?.trim();
  const rawNumber = match[2];

  const currency = currencyMap.get(symbol);
  if (!currency) {
    return {
      amount: parseFloat(text),
    };
  }

  const amount = amountToNumber(rawNumber);

  return {
    currency,
    amount,
  };
}

// Date utilities
export type DateFormatVariant = "short" | "long";

export function formatDateTime(
  date: Date,
  locale = "pt-BR",
  variant: DateFormatVariant = "short"
) {
  return {
    short:
      formatDate(date, locale, variant) +
      " " +
      formatTime(date, locale, variant),
    long: date.toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  }[variant];
}

export function formatDate(
  date: Date,
  locale = "pt-BR",
  variant: DateFormatVariant = "short"
) {
  return {
    short: date.toLocaleDateString(locale),
    long: date.toLocaleDateString(locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  }[variant];
}

export function formatTime(
  date: Date,
  locale = "pt-BR",
  variant: DateFormatVariant = "short"
) {
  return {
    short: date.toLocaleTimeString(locale),
    long: date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  }[variant];
}

export function dateTimeToString(date: Date): string {
  return date.toISOString().split("T").join(" ").split(".")[0];
}

export function dateToString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function dmyStringToDate(dateText: string): Date {
  return injectTimezone(
    new Date(
      `${dateText.substring(6, 10)}-${dateText.substring(
        3,
        5
      )}-${dateText.substring(0, 2)}`
    )
  );
}

/* 20240502000000[-3:BRT] => Date() */
export function ofxDateTextToDate(dateText: string): Date {
  const date = dateNumbersToDateString(dateText.substring(0, 8));
  const time = dateNumbersToTimeString(dateText.substring(8, 14));
  const timezone = dateText.substring(
    dateText.indexOf("[") + 1,
    dateText.lastIndexOf(":")
  );
  return new Date(`${date} ${time} UTC${timezone}`);
}

export function dateNumbersToDateString(dateNumbersText: string): string {
  return dateNumbersText
    .padEnd(8, "0")
    .replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
}

export function dateNumbersToTimeString(dateNumbersText: string): string {
  return dateNumbersText
    .padEnd(6, "0")
    .replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3");
}

export function injectTimezone(dateUTC: Date): Date {
  return new Date(
    dateUTC.getUTCFullYear(),
    dateUTC.getUTCMonth(),
    dateUTC.getUTCDate(),
    dateUTC.getUTCHours(),
    dateUTC.getUTCMinutes(),
    dateUTC.getUTCSeconds()
  );
}

// String utilities
export function capitalize(str: string, lower = false): string {
  return (lower ? str.toLowerCase() : str).replace(
    /(?:^|\s|["'([{])+\S/g,
    (match) => match.toUpperCase()
  );
}

export function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function nameInitials(
  name: string,
  count: number | "first_last" = 2
): string {
  const initials = name.split(" ").map((n) => n[0].toLocaleUpperCase());

  if (count === "first_last") {
    return (
      initials[0] + (initials.length > 1 ? initials[initials.length - 1] : "")
    );
  }

  return initials.join("").substring(0, count);
}

// Number utilities
export function floatLimitDecimals(
  value: number,
  decimals: number = 2
): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// Component utilities
export function removeObjectAttributes<O extends object>(
  obJ?: O,
  ...attributes: Array<keyof O>
): O {
  if (!obJ) return undefined as unknown as O;

  const newObj = { ...obJ };
  // @ts-ignore
  attributes.forEach((attr) => {
    delete newObj[attr];
  });
  return newObj;
}

export function formatPhoneNumber(value: string) {
  value = value.trim();
  const formatters = {
    "+55": (value: string) =>
      "🇧🇷" +
      value
        .replace(/\D/g, "")
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(value.length >= 11 ? /(\d{5})(\d)/ : /(\d{4})(\d)/, "$1-$2"),
    "+1": (value: string) =>
      "🇺🇸" +
      value
        .replace(/\D/g, "")
        .replace(/(\d{3})(\d)/, "($1) $2")
        .replace(/(\d{3})(\d)/, "$1-$2"),
  };

  const formatterCode = Object.keys(formatters).find((code) =>
    value.startsWith(code)
  );
  if (!formatterCode || !Object.hasOwn(formatters, formatterCode)) return value;

  const formatter = formatters[formatterCode as keyof typeof formatters];

  return formatter(value.trim().substring(formatterCode.length));

  // const formats = {
  //   'BR': '+55 (##) #####-####',
  //   'US': '+1 (###) ###-####',
  // }
  // return value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '+$1 $2').replace(/(\d{5})(\d)/, '$1-$2');
}

// Object utilities
export function exclude<O extends object, KA extends Array<keyof O>>(
  obJ?: O,
  ...attributes: KA
) {
  if (!obJ) return undefined as unknown as O;
  const newObj = { ...obJ };
  attributes.forEach((attr) => {
    delete newObj[attr];
  });
  // Return the new object without the excluded attributes
  return newObj as Omit<O, KA[number]>;
}

// Array utilities
export const distinct =
  <A extends Array<O>, O>(...keys: Array<keyof O>) =>
  (it: O, i: keyof A, a: A) =>
    a.findIndex((ait) =>
      typeof it === "object" && typeof it === "object" && it && keys.length > 0
        ? keys.every((key) => ait[key] === it[key])
        : ait === it
    ) === i;

export const RADIAN = Math.PI / 180;

// File utilities
export function bytesToString(bytes: number) {
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  if (bytes <= 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function getFilenameExtension(filename: string) {
  return (filename.includes(".") && filename.split(".").slice(-1)[0]) || "";
}

// Data conversion
export function csvToObjectList<T>(
  csv: string,
  columnDelimiter?: string,
  rowDelimiter = "\n"
): Array<T> | undefined {
  if (!columnDelimiter)
    columnDelimiter = getCsvColumnDelimiter(csv, rowDelimiter);
  if (!columnDelimiter) return;

  const data = csv
    .split(rowDelimiter)
    .filter((line) => line && line.trim() !== "")
    .map((row) => row.split(columnDelimiter));
  const columns = data.splice(0, 1)[0];

  return data.map(
    (row) =>
      columns.reduce((ac, column, index) => {
        return { ...ac, [column.trim()]: row[index].trim() };
      }, {}) as T
  );
}

export function getCsvColumnDelimiter(
  csv: string,
  rowDelimiter = "\n"
): string | undefined {
  let [head, ...body] = csv.split(rowDelimiter);
  body = body.filter((line) => line && line.trim() !== "");

  for (let delimiter of [",", ";", "|"]) {
    const countOnHead = head.split(delimiter).length;

    if (countOnHead <= 1) continue;
    else if (
      body.every((line) => {
        const countOnLine = line.split(delimiter).length;
        return countOnLine === countOnHead;
      })
    ) {
      return delimiter;
    }
  }

  return undefined;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD") // remove accents
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ") // remove special chars
    .replace(/\s+/g, " ")
    .trim();
}
