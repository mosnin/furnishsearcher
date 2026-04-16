import { SignUp } from "@clerk/nextjs";
import { CheckCircle2 } from "lucide-react";

const features = [
  {
    title: "List your property",
    description: "Create a beautiful listing in minutes with photos and details.",
  },
  {
    title: "Connect with tenants",
    description: "Reach thousands of pre-vetted renters looking right now.",
  },
  {
    title: "No platform fees",
    description: "Keep 100% of your rent. We never take a cut.",
  },
];

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — visible on desktop only */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative flex-col justify-between p-12 overflow-hidden">
        {/* Background image with overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1400&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f2044]/90 via-[#0f2044]/75 to-[#1a3360]/60" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-[#0f2044] font-bold text-sm">FF</span>
            </div>
            <span className="text-white font-semibold text-xl tracking-tight">
              FurnishFinder
            </span>
          </div>
        </div>

        {/* Feature list */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight mb-3">
              Start earning with
              <br />
              your property.
            </h1>
            <p className="text-blue-200 text-lg">
              Join thousands of landlords on FurnishFinder today.
            </p>
          </div>

          <ul className="space-y-5">
            {features.map((f) => (
              <li key={f.title} className="flex items-start gap-4">
                <div className="mt-0.5 shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <p className="text-white font-semibold text-base">{f.title}</p>
                  <p className="text-blue-200 text-sm mt-0.5">{f.description}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-blue-300/70 text-xs">
            Join 15,000+ property owners already using FurnishFinder.
          </p>
        </div>
      </div>

      {/* Right panel — sign-up form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-[#0f2044] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">FF</span>
            </div>
            <span className="text-[#0f2044] font-semibold text-xl tracking-tight">
              FurnishFinder
            </span>
          </div>

          <SignUp
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border-0 p-0 w-full",
                headerTitle: "text-2xl font-bold text-[#0f2044]",
                headerSubtitle: "text-muted-foreground",
                socialButtonsBlockButton:
                  "border border-input hover:bg-accent transition-colors font-medium",
                dividerLine: "bg-border",
                dividerText: "text-muted-foreground text-xs",
                formFieldLabel: "text-sm font-medium text-foreground",
                formFieldInput:
                  "border-input focus:ring-2 focus:ring-ring rounded-md h-10 px-3 text-sm w-full",
                formButtonPrimary:
                  "bg-[#0f2044] hover:bg-[#1a3360] text-white font-medium h-10 rounded-md transition-colors w-full",
                footerActionLink: "text-[#0f2044] hover:underline font-medium",
                identityPreviewEditButton: "text-[#0f2044]",
                formResendCodeLink: "text-[#0f2044]",
                otpCodeFieldInput: "border-input focus:ring-ring",
                alertText: "text-sm",
                formFieldErrorText: "text-destructive text-xs mt-1",
              },
              layout: {
                showOptionalFields: false,
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
