/**
 * Register GSAP plugins once at app entry. Imported from src/main.tsx so the
 * side effect runs before any component animates.
 *
 * Register only the plugins the app actually uses. Each unused plugin is dead
 * weight against the 100 MB static-deploy cap. Today that is:
 *   - useGSAP: the React 19 Strict Mode safe effect hook.
 *   - CustomEase: the registered brand curve used by entrances and count-ups.
 *   - Flip: the Effectiveness re-sort and group transition.
 * ScrollTrigger is intentionally not registered yet; add it when a scroll
 * driven surface lands.
 */
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(useGSAP, CustomEase, Flip);

// Match the fleet's existing entrance curve exactly: [data-rise] in main.css is
// cubic-bezier(0.22, 1, 0.36, 1), so GSAP entrances feel identical to the CSS
// the app already ships. Guard against a double register under Strict Mode and
// test re-imports.
if (!CustomEase.get("brandEase")) {
  CustomEase.create("brandEase", "0.22, 1, 0.36, 1");
}
