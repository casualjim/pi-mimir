/**
 * Ambient declaration for an omp-only subpath: `@earendil-works/pi-tui`
 * remaps to omp's bundled `@oh-my-pi/pi-tui` under omp, which exports the
 * host's transcript renderers at `./tools`. Pi's published pi-tui has no such
 * subpath, so this module exists only when running under omp and is imported
 * dynamically there.
 */
declare module "@earendil-works/pi-tui/tools" {
 export interface ToolRendererLike {
  renderCall: (args: unknown, options: unknown, theme: unknown) => unknown;
  renderResult: (
   result: unknown,
   options: unknown,
   theme: unknown,
   args?: unknown,
  ) => unknown;
 }
 export const toolRenderers: Record<string, ToolRendererLike>;
}
