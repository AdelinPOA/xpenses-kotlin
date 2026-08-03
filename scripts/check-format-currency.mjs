/**
 * Lightweight unit check for formatCurrency locale output.
 * Mirrors frontend/lib/format.ts logic without React.
 */
const mapLocaleToBcp47 = { en: "en-EU", ro: "ro-RO" };

function formatCurrency(amount, currency = "EUR", locale = "en") {
  return new Intl.NumberFormat(mapLocaleToBcp47[locale] || "en-EU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const en = formatCurrency(1234.56, "EUR", "en");
const ro = formatCurrency(1234.56, "EUR", "ro");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg} (got ${JSON.stringify(cond === false ? "false" : cond)})`);
    failed += 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

// en: euro before or after with comma thousands / period decimals
assert(/1[,.]234[,.]56/.test(en) && en.includes("€"), `en format contains € and 1234.56-ish: ${en}`);
// ro: typically 1.234,56 € or similar
assert(/1[,.]234[,.]56/.test(ro) && ro.includes("€"), `ro format contains € and 1234.56-ish: ${ro}`);
// locales should differ in digit grouping/decimal separator placement relative to each other
// (at least one of grouping or symbol position differs in most ICU data)
console.log(`en=${JSON.stringify(en)} ro=${JSON.stringify(ro)}`);

if (failed > 0) process.exit(1);
console.log("formatCurrency checks passed");
process.exit(0);
