'use client'

import React from 'react'

// Number of modal surfaces (Dialog/AlertDialog contents) currently mounted.
let mountedModalSurfaces = 0

/**
 * Registers a mounted modal surface and returns its cleanup.
 *
 * Radix's DismissableLayer sets `pointer-events: none` on <body> while a modal
 * layer is open, and on close restores the value it captured when it opened.
 * When a modal opens while another layer (e.g. a closing dropdown menu) still
 * has `pointer-events: none` on <body>, it captures that `none` as the
 * "original" value and writes it back on close — freezing the whole page.
 *
 * The cleanup clears that stale write. It is deferred past the same commit's
 * DismissableLayer cleanup so it always wins over Radix's restore.
 */
export function registerModalSurface(): () => void {
  mountedModalSurfaces += 1
  return () => {
    mountedModalSurfaces = Math.max(0, mountedModalSurfaces - 1)
    if (mountedModalSurfaces > 0) return
    setTimeout(() => {
      if (document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = ''
      }
    }, 0)
  }
}

/**
 * Invisible companion rendered next to modal content inside the portal.
 * Heals a stale `pointer-events: none` on <body> (left by a previous modal
 * race) before Radix captures it as the "original" value, and clears the
 * stale value when the last modal surface unmounts.
 */
export function ModalSurfaceGuard(): null {
  React.useEffect(() => {
    // Only heal when no other modal surface is open: clearing <body>
    // pointer-events while a modal is stacked would re-enable interaction
    // behind the remaining modal.
    if (mountedModalSurfaces === 0 && document.body.style.pointerEvents === 'none') {
      document.body.style.pointerEvents = ''
    }
    return registerModalSurface()
  }, [])
  return null
}
