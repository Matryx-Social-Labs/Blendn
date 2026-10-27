/**
 * Who is told when a link is about to close what is open (lib/pendingRoute `dismissModals`). Its own module, with no
 * imports: the Modals that register (lib/modalTurn) are loaded by code that never loads the router.
 */

/** Told before a link closes the modals (`onClosingForLink`). */
const linkClosers = new Set<() => void>()

/**
 * Be told, synchronously, the moment a link is about to close the modals (`dismissModals`), before the pop is dispatched
 * and before any screen unmounts. For what must close or know a link closed it, not the person: every open dismissible
 * DS Sheet and ⋯ menu (closed by their own close request, so a confirm resolves as its cancel), the Blend'n overlay
 * (not a route: a tab link would switch the tab under it), the check-in's intent question (abandoned, so its room is
 * not pushed over the link) and Make a crew (its draft kept). Returns the unsubscribe.
 *
 * It replaced a flag read in the closing screen's unmount (RC drive 6): the flag was cleared on the pop's first state
 * event, before the screen unmounted, so the check-in read "closed" and pushed the room over the link.
 */
export function onClosingForLink(listener: () => void): () => void {
  linkClosers.add(listener)
  return () => {
    linkClosers.delete(listener)
  }
}

/** `dismissModals` only: tell every listener, each once, before anything is popped or unmounts. */
export function tellLinkClosers(): void {
  ;[...linkClosers].forEach((listener) => listener())
}
