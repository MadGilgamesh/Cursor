/** Warstwy dryfującej mgły w tle (czysto dekoracyjne, wyłączane przy ograniczonym ruchu). */
export function Fog() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -inset-x-1/4 top-1/4 h-1/2 animate-drift rounded-[50%] bg-verdigris-700/10 blur-3xl" />
      <div className="absolute -inset-x-1/4 bottom-0 h-1/3 animate-drift rounded-[50%] bg-ichor-600/10 blur-3xl [animation-delay:-14s]" />
    </div>
  );
}
