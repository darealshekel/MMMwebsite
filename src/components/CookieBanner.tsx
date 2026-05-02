import { useState } from "react";
import { Link } from "react-router-dom";

const CONSENT_KEY = "mmm_cookie_consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(CONSENT_KEY));

  if (!visible) return null;

  function accept() {
    localStorage.setItem(CONSENT_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="container flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-pixel text-[8px] leading-[2] text-muted-foreground max-w-2xl">
          We use necessary session cookies for login and localStorage to save your preferences.
          No tracking or advertising cookies are used. By continuing you accept our{" "}
          <Link to="/terms" className="text-primary hover:underline">
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="btn-glow shrink-0 border border-primary/40 bg-primary/10 px-5 py-2 font-pixel text-[8px] text-primary transition-colors hover:bg-primary/20"
        >
          ACCEPT
        </button>
      </div>
    </div>
  );
}
