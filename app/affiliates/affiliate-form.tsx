"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { toast } from "sonner";

export default function AffiliateForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    website: "",
    promotion: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const submitContact = useMutation(api.support.submitContact);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.promotion) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const reference = await submitContact({
        name: form.name.trim(),
        email: form.email.trim(),
        subject: "Partnership",
        message: `Partnership inquiry\nWebsite: ${form.website.trim() || "Not provided"}\n\n${form.promotion.trim()}`,
      });
      setSubmitted(reference);
      toast.success("Your partnership inquiry has been saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save your inquiry. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-white border border-green-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">
          Partnership inquiry saved
        </h3>
        <p className="text-slate-600 text-sm">
          Thanks, <strong>{form.name}</strong>. Keep this reference:{" "}
          <strong>{submitted}</strong>. If you submitted while signed in, you
          can follow your case and replies in your account.
        </p>
        <Link className="inline-block mt-4 underline" href="/dashboard/support">
          View support cases
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-6"
    >
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-semibold text-slate-700 mb-1.5"
        >
          Full Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          maxLength={100}
          disabled={submitting}
          required
          value={form.name}
          onChange={handleChange}
          placeholder="Jane Smith"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent"
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-semibold text-slate-700 mb-1.5"
        >
          Email Address <span className="text-red-500">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          maxLength={254}
          disabled={submitting}
          required
          value={form.email}
          onChange={handleChange}
          placeholder="jane@example.com"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent"
        />
      </div>

      <div>
        <label
          htmlFor="website"
          className="block text-sm font-semibold text-slate-700 mb-1.5"
        >
          Website or Social Profile{" "}
          <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <input
          id="website"
          name="website"
          type="url"
          maxLength={500}
          disabled={submitting}
          value={form.website}
          onChange={handleChange}
          placeholder="https://your-site.com"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent"
        />
      </div>

      <div>
        <label
          htmlFor="promotion"
          className="block text-sm font-semibold text-slate-700 mb-1.5"
        >
          Describe your partnership idea <span className="text-red-500">*</span>
        </label>
        <textarea
          id="promotion"
          name="promotion"
          minLength={10}
          maxLength={3800}
          disabled={submitting}
          required
          rows={4}
          value={form.promotion}
          onChange={handleChange}
          placeholder="Tell us about the collaboration you have in mind."
          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] disabled:bg-[#1e3a8a]/60 text-white font-bold py-3 rounded-lg transition-colors text-sm"
      >
        {submitting ? "Submitting..." : "Send partnership inquiry"}
      </button>

      <p className="text-xs text-slate-400 text-center">
        Read our{" "}
        <a href="/terms" className="underline hover:text-slate-600">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline hover:text-slate-600">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
