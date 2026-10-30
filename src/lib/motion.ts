/** Motion must acknowledge a real state transition, never a render of existing state. */
export function shouldPlayCompletionMotion(previous: boolean, next: boolean): boolean {
  return previous === false && next === true;
}

export function motionItemKey(parentId: string | undefined, itemId: string | undefined, index: number): string {
  return itemId || `${parentId || 'item'}-${index}`;
}
