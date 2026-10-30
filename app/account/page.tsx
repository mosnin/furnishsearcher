"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  AirplaneTilt,
  UserCircle,
  Heart,
  ChatCircle,
  BookmarkSimple,
  Buildings,
  SquaresFour,
  FileText,
  ShieldCheck,
  SignOut,
} from "@phosphor-icons/react";
import { Modal } from "@/components/ui-system/primitives";
import { dashboardHome } from "@/lib/dashboard-access";
import {
  usePublicAccount,
  AccountSignIn,
  AccountEmpty,
  AccountLoading,
} from "@/components/public-experience/account-state";
export default function AccountPage() {
  const { account, loading, signedIn } = usePublicAccount(),
    clerk = useClerk();
  const update = useMutation(api.users.updateProfile);
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  if (loading) return <AccountLoading />;
  if (!signedIn) return <AccountSignIn />;
  if (!account || account.accountTypePending)
    return (
      <AccountEmpty
        title="Finish setting up your account"
        description="Choose how you’ll use globe before opening your workspace."
        action="Continue setup"
        href="/onboarding"
      />
    );
  const displayName = account.displayName || account.name,
    isTraveler = account.role === "tenant";
  return (
    <main className="w-account-page">
      <header className="w-account-identity">
        <span className="w-account-initial" aria-hidden="true">
          {displayName.trim().slice(0, 1).toUpperCase() || "A"}
        </span>
        <div>
          <h1>{displayName}</h1>
          <p>
            {account.role === "landlord"
              ? "Property owner account"
              : account.role === "admin"
                ? "Platform admin account"
                : "Traveler account"}
          </p>
        </div>
      </header>
      <section className="w-account-group" aria-labelledby="account-heading">
        <h2 id="account-heading">Your account</h2>
        <div className="w-account-grid">
          <Link
            className="w-account-card"
            href={isTraveler ? "/account/stays" : dashboardHome(account.role)}
          >
            {isTraveler ? <AirplaneTilt /> : <Buildings />}
            <h3>{isTraveler ? "See your stays" : "Your dashboard"}</h3>
            <p>
              {isTraveler
                ? "Check your requests and agreed stays."
                : "Open your account’s workspace and tools."}
            </p>
          </Link>
          <button
            className="w-account-card"
            onClick={(e) => {
              opener.current = e.currentTarget;
              setName(displayName);
              setError("");
              setOpen(true);
            }}
          >
            <UserCircle />
            <h3>Personal information</h3>
            <p>Edit your profile</p>
          </button>
          <Link
            className="w-account-card"
            href={
              isTraveler ? "/dashboard/tenant/searches" : "/dashboard/messages"
            }
          >
            {isTraveler ? <BookmarkSimple /> : <ChatCircle />}
            <h3>{isTraveler ? "Saved searches" : "Your conversations"}</h3>
            <p>
              {isTraveler
                ? "Return to your search preferences."
                : "Keep your rental conversations together."}
            </p>
          </Link>
          <Link
            className="w-account-card"
            href={isTraveler ? "/account/saved" : "/dashboard/profile"}
          >
            {isTraveler ? <Heart /> : <SquaresFour />}
            <h3>{isTraveler ? "Your wishlist" : "Profile & account"}</h3>
            <p>
              {isTraveler
                ? "See all properties on your wishlist."
                : "Manage your account details and preferences."}
            </p>
          </Link>
          <Link className="w-account-card" href="/dashboard/support">
            <ChatCircle />
            <h3>Contact support</h3>
            <p>View your cases and replies.</p>
          </Link>
        </div>
      </section>
      <section className="w-account-group" aria-labelledby="legal-heading">
        <h2 id="legal-heading">Legal</h2>
        <div className="w-account-grid">
          <Link className="w-account-card w-account-card--short" href="/terms">
            <FileText />
            <h3>Terms of service</h3>
          </Link>
          <Link
            className="w-account-card w-account-card--short"
            href="/privacy"
          >
            <ShieldCheck />
            <h3>Privacy policy</h3>
          </Link>
        </div>
      </section>
      <button
        className="w-account-logout"
        onClick={() => void clerk.signOut({ redirectUrl: "/" })}
      >
        <SignOut size={18} />
        Log out
      </button>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
        finalFocus={() => opener.current}
        title="Personal information"
        className="w-personal-dialog"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const value = name.trim();
            if (!value || busy) return;
            setBusy(true);
            setError("");
            try {
              await update({ userId: account._id, displayName: value });
              setOpen(false);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not save your name.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="account-display-name">Name</label>
          <div className="w-personal-name">
            <input
              id="account-display-name"
              autoFocus
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !name.trim() || name.trim() === displayName}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
          <label htmlFor="account-email">Email address</label>
          <input
            id="account-email"
            type="email"
            value={account.email}
            readOnly
            aria-describedby="account-email-help"
          />
          <p id="account-email-help" className="w-personal-help">
            Manage your sign in email and account security in account settings.
          </p>
          {error && (
            <p role="alert" className="w-personal-error">
              {error}
            </p>
          )}
          <div className="w-personal-footer">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                clerk.openUserProfile();
              }}
            >
              Account settings
            </button>
            <button
              type="button"
              onClick={() => void clerk.signOut({ redirectUrl: "/" })}
            >
              <SignOut size={18} />
              Log out
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
