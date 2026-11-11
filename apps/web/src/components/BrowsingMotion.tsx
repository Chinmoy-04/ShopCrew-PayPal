import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

const positions = new Map<string, number>();

/** Only browsing routes own a Lenis instance; all operational scroll stays native. */
export function BrowsingMotion() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const eligible = location.pathname === "/" || /^\/shop(?:\/[^/]+)?$/.test(location.pathname);

  useLayoutEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const hashTarget = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (hashTarget) hashTarget.scrollIntoView();
    else window.scrollTo(0, navigationType === "POP" ? positions.get(location.key) ?? 0 : 0);
    return () => {
      positions.set(location.key, window.scrollY);
      history.scrollRestoration = previous;
    };
  }, [location.key]);

  useEffect(() => {
    if (!eligible) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let lenis: Lenis | undefined;
    const configure = () => {
      lenis?.destroy();
      lenis = preference.matches ? undefined : new Lenis({
        autoRaf: true, lerp: 0.14, anchors: true, syncTouch: false,
        prevent: (node) => Boolean(node.closest('[data-lenis-prevent], [role="dialog"], dialog')),
      });
    };
    configure();
    preference.addEventListener("change", configure);
    return () => { preference.removeEventListener("change", configure); lenis?.destroy(); };
  }, [eligible, location.key]);
  return null;
}

/** Visible by default, so failed scripts never hide content. */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let animation: Animation | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      animation = node.animate([{ opacity: 0.55, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], {
        duration: 250, easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
      observer.disconnect();
    }, { threshold: 0.12 });
    observer.observe(node);
    return () => { observer.disconnect(); animation?.cancel(); };
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
