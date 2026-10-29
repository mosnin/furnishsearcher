"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth, useSignIn } from "@clerk/nextjs";

export function LocalPreviewEntry({
  expectedUserId,
}: {
  expectedUserId: string;
}) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: authLoaded, userId } = useAuth();
  const started = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isLoaded || !authLoaded || !signIn || !setActive || started.current)
      return;
    started.current = true;
    if (userId === expectedUserId) {
      window.location.replace("/dashboard");
      return;
    }
    if (userId) {
      setError(
        "A different account is already signed in. Open this local preview in a private window to use the preview account.",
      );
      return;
    }
    void (async () => {
      try {
        const response = await fetch("/api/local-preview", {
          method: "POST",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Preview authentication unavailable");
        const payload = await response.json();
        if (payload.userId !== expectedUserId)
          throw new Error("Preview account mismatch");
        const result = await signIn.create({
          strategy: "ticket",
          ticket: payload.ticket,
        });
        if (result.status !== "complete" || !result.createdSessionId)
          throw new Error("Preview session incomplete");
        await setActive({ session: result.createdSessionId });
        window.location.replace("/dashboard");
      } catch {
        setError(
          "Could not start the local preview. Reload to retry, or restart npm run dev:preview.",
        );
      }
    })();
  }, [isLoaded, authLoaded, signIn, setActive, userId, expectedUserId]);
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <p className="text-sm text-slate-500">Local development preview</p>
      <h1 className="mt-3 text-2xl font-semibold">Opening your dashboard</h1>
      <p className="mt-4 text-slate-600" role="status">
        {error ||
          "Starting the reserved preview account. No login form is needed."}
      </p>
    </main>
  );
}
