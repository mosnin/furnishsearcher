"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/** The semantic state changes immediately; only its duplicate visual label transitions. */
export function MotionText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(text);
  const [phase, setPhase] = useState("settled");
  const current = useRef(text);
  useEffect(() => {
    if (current.current === text) return;
    current.current = text;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(text);
      setPhase("settled");
      return;
    }
    setPhase("exit");
    let frame = 0;
    const timer = window.setTimeout(() => {
      setVisible(text);
      setPhase("enter");
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => setPhase("settled"));
      });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [text]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (media.matches) {
        setVisible(current.current);
        setPhase("settled");
      }
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="t-text-swap" data-phase={phase}>
        {visible}
      </span>
    </span>
  );
}

export function NumberPop({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) {
  return (
    <span className={cn("t-digit-group", className)}>
      <span className="sr-only">{value}</span>
      <span key={String(value)} aria-hidden="true" className="t-digit-visual">
        {String(value)
          .split("")
          .map((digit, index) => (
            <span
              key={index}
              className="t-digit"
              style={{ "--digit-index": Math.min(index, 5) } as CSSProperties}
            >
              {digit}
            </span>
          ))}
      </span>
    </span>
  );
}

export function SuccessCheck({
  label = "Saved",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("t-success-check", className)}
      role="img"
      aria-label={label}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="m5 12 4 4L19 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("t-content-reveal", className)}>{children}</div>;
}

/** Counter animation is a visual reel. Its accessible value always reads the actual current number. */
export function SpinningCounter({ value }: { value: number }) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span className="t-reel">
      <span className="sr-only">{value}</span>
      <span className="t-reel-visual" aria-hidden="true" key={value}>
        {digits.map((digit, index) => (
          <span className="t-reel-col" key={index}>
            <span
              className="t-reel-strip"
              style={
                {
                  "--reel-target": Number(digit),
                  "--digit-index": index,
                } as CSSProperties
              }
            >
              {Array.from({ length: Number(digit) + 1 }, (_, n) => (
                <span className="t-reel-digit" key={n}>
                  {n}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

/** Explicitly labeled specimens for effects that have no truthful product data surface yet. */
export function MotionSamples() {
  const [expanded, setExpanded] = useState(false),
    [count, setCount] = useState(12),
    [success, setSuccess] = useState(false),
    [error, setError] = useState(0),
    [stacked, setStacked] = useState(false),
    [morph, setMorph] = useState(false);
  return (
    <section className="ds-motion-workshop" aria-label="Motion specimens">
      <header>
        <h2>Motion specimens</h2>
        <p>
          These controls affect only this component workshop. They do not create
          messages, payments or rental activity.
        </p>
      </header>
      <div className="ds-motion-grid">
        <article>
          <h3>Card resize & panel reveal</h3>
          <button
            className="ds-button ds-button--secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            Resize specimen
          </button>
          <div className="t-resize ds-motion-resize" data-expanded={expanded}>
            <span>Sample card</span>
            {expanded && (
              <Reveal>
                <p>Additional sample details are revealed.</p>
              </Reveal>
            )}
          </div>
        </article>
        <article>
          <h3>Text swap & number feedback</h3>
          <button
            className="ds-button ds-button--secondary"
            onClick={() => setCount((n) => n + 1)}
          >
            Change sample value
          </button>
          <p>
            <MotionText
              text={count % 2 ? "Updated sample" : "Current sample"}
            />{" "}
            <NumberPop value={count} />
          </p>
          <SpinningCounter value={count} />
        </article>
        <article>
          <h3>Success & error feedback</h3>
          <button
            className="ds-button ds-button--secondary"
            onClick={() => setSuccess((v) => !v)}
          >
            Toggle sample success
          </button>
          {success && (
            <p>
              <SuccessCheck label="Sample succeeded" /> Sample succeeded
            </p>
          )}
          <button
            className="ds-button ds-button--secondary"
            onClick={() => setError((n) => n + 1)}
          >
            Show sample error
          </button>
          {error > 0 && (
            <p key={error} className="t-error-shake" role="status">
              Sample validation message
            </p>
          )}
        </article>
        <article>
          <h3>Banner stacking</h3>
          <button
            className="ds-button ds-button--secondary"
            aria-expanded={stacked}
            onClick={() => setStacked((v) => !v)}
          >
            Spread sample banners
          </button>
          <div className="t-stack ds-motion-stack" data-spread={stacked}>
            {[0, 1, 2].map((n) => (
              <div
                key={n}
                className="t-stack-banner"
                style={{ "--stack-index": n } as CSSProperties}
              >
                Sample banner {n + 1}
              </div>
            ))}
          </div>
        </article>
        <article>
          <h3>Avatar group hover</h3>
          <p>Sample initials, not team or support availability.</p>
          <div className="t-avatar-group">
            {["A", "B", "C"].map((initial) => (
              <button
                key={initial}
                className="t-avatar"
                aria-label={`Sample avatar ${initial}`}
              >
                {initial}
              </button>
            ))}
          </div>
        </article>
        <article>
          <h3>Learn more hover</h3>
          <a href="#dashboard-main" className="ds-button ds-button--ghost">
            Return to library top <span className="t-learn-arrow" aria-hidden="true">→</span>
          </a>
        </article>
        <article>
          <h3>Dropdown menu morph</h3>
          <div className="ds-motion-morph-anchor">
            <div className="t-morph" data-open={morph}>
              <div className="t-morph-menu" inert={!morph}>
                <button
                  className="ds-button ds-button--ghost"
                  onClick={() => setMorph(false)}
                >
                  Close sample menu
                </button>
                <p>Sample menu surface</p>
              </div>
              <button
                className="t-morph-plus"
                aria-expanded={morph}
                aria-label="Open sample morph menu"
                onClick={() => setMorph(true)}
                tabIndex={morph ? -1 : 0}
              >
                +
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
