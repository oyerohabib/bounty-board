/** Coordinates Phantom "Switch account" so the board can skip refresh on no-op. */

let switching = false;
let switchFrom: string | null = null;

export function beginAccountSwitch(from: string | null) {
  switching = true;
  switchFrom = from;
}

export function endAccountSwitch(
  to: string | null
): "same" | "changed" | "aborted" {
  const from = switchFrom;
  switching = false;
  switchFrom = null;
  if (!from || !to) return "aborted";
  return from === to ? "same" : "changed";
}

export function isAccountSwitching() {
  return switching;
}

export function accountSwitchFrom() {
  return switchFrom;
}
