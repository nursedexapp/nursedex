import confetti from "canvas-confetti";

/**
 * Brand-tinted confetti burst from three angles so it spans the viewport.
 * Client-side only (canvas-confetti touches the DOM).
 */
export function fireBrandConfetti() {
  const colors = ["#1f7a5a", "#3a9c7a", "#f1c84b", "#ffffff"];
  const fire = (originX: number, angle: number) => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { x: originX, y: 0.7 },
      angle,
      colors,
      scalar: 1.1,
      gravity: 0.9,
      ticks: 200,
    });
  };
  fire(0.2, 60);
  fire(0.8, 120);
  setTimeout(() => fire(0.5, 90), 250);
}
