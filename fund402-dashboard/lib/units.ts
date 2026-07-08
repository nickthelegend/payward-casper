// Pure CEP-18 unit math (no deps — safe to import anywhere, incl. tests).

/** Parse a decimal string ("12.5") into CEP-18 base units (bigint). */
export function toBaseUnits(decimal: string, decimals = 9): bigint {
  const [whole, frac = ""] = decimal.replace(/[^0-9.]/g, "").split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}
