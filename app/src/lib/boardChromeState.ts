export type BoardChromeState = {
  balanceSol: number | null;
  historyNotice: number;
};

const EMPTY: BoardChromeState = { balanceSol: null, historyNotice: 0 };

let snapshot: BoardChromeState = EMPTY;
const listeners = new Set<() => void>();

export function getBoardChromeState(): BoardChromeState {
  return snapshot;
}

export function getBoardChromeServerState(): BoardChromeState {
  return EMPTY;
}

export function subscribeBoardChrome(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setBoardChromeState(patch: Partial<BoardChromeState>) {
  const next = { ...snapshot, ...patch };
  if (
    next.balanceSol === snapshot.balanceSol &&
    next.historyNotice === snapshot.historyNotice
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((listener) => listener());
}
