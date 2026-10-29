import { SignIn } from "@clerk/nextjs";
import { AuthFrame } from "@/components/auth-frame";
import { clerkAppearance } from "@/components/ui-system/clerk-appearance";
export default function AuthPage() {
  return (
    <AuthFrame
      title="Welcome back."
      description="Sign in to your rental workspace."
    >
      <SignIn appearance={clerkAppearance} />
    </AuthFrame>
  );
}
