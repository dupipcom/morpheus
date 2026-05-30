/**
 * Mobile navigation layout constants.
 *
 * The bottom navigation stack consists of two fixed bars:
 *   - Main nav:         bottom-0,       height 80 px
 *   - Secondary toolbar: bottom-[80px], height 50 px
 *
 * Total stack height = 130 px.  Any element that must sit above both bars
 * (e.g. the collapsible chat composer) should use `MOBILE_NAV_OFFSET_CLASS`.
 * Scrollable content areas need `MOBILE_NAV_CONTENT_PADDING_CLASS` as their
 * bottom padding so the last item remains visible above the entire stack.
 */

/** Tailwind class: position the element's bottom edge above the full nav stack (130 px). */
export const MOBILE_NAV_OFFSET_CLASS = 'bottom-[130px]'

/**
 * Tailwind class: bottom padding for scrollable content areas on mobile.
 * 160 px = 130 px nav stack + ~30 px buffer for the collapsed composer bar.
 */
export const MOBILE_CONTENT_BOTTOM_PADDING_CLASS = 'pb-[160px]'
