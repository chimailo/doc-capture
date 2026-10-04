/** Time source in milliseconds. Injected so timing logic can be tested. */
export type Clock = () => number;

export const performanceClock: Clock = () => performance.now();
