/**
 * Route-to-experiment-key bindings. Not experiment data — the actual
 * variant/targeting/status config now lives in the platform's DB and is
 * fetched dynamically by @cro-engine/sdk (see src/lib/cro-engine.ts). These
 * are just the fixed keys this app's own hardcoded pages care about:
 * /checkout + /checkout-v2 read CHECKOUT_FLOW_EXPERIMENT_KEY, /pricing reads
 * PRICING_CTA_EXPERIMENT_KEY. They necessarily live in code since these are
 * specific React pages, not a generic per-experiment renderer.
 *
 * To actually create/edit these experiments (or add new ones this app
 * doesn't have a page for), use the platform's admin UI — there is no
 * static config to hand-edit anymore.
 */

export const CHECKOUT_FLOW_EXPERIMENT_KEY = 'checkout-flow-v2';
export const PRICING_CTA_EXPERIMENT_KEY = 'pricing-cta-copy';
export const PRICING_CTA_COLOR_EXPERIMENT_KEY = 'cta-color';
