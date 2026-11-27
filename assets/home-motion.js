/* Decorative transport choreography, not an experimental simulation. */
(() => {
  const ribbon = document.getElementById("swarm-ribbon");
  if (!ribbon) return;
  const button = ribbon.querySelector(".swarm-motion-toggle");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia("(max-width: 600px)");
  const scene = document.getElementById("swarm-motion-scene");
  const layout = () => scene.setAttribute("viewBox", compact.matches ? "0 0 600 144" : "0 0 1120 144");
  compact.addEventListener("change", layout);
  layout();
  let paused = false;
  let inView = false;
  const sync = () => {
    const running = !paused && !reduced.matches && inView && !document.hidden;
    ribbon.dataset.motion = running ? "running" : "paused";
    button.hidden = reduced.matches;
    button.textContent = paused ? "Play animation" : "Pause animation";
  };
  button.addEventListener("click", () => { paused = !paused; sync(); });
  reduced.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
    observer.observe(ribbon);
  } else { inView = true; }
  sync();
})();
