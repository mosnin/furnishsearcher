import { SignUp } from "@clerk/nextjs";
import { AuthFrame } from "@/components/auth-frame";
import { clerkAppearance } from "@/components/ui-system/clerk-appearance";
export default function AuthPage() {
  return (
    <AuthFrame
      title="Make yourself at home."
      description="Create your account, then choose traveler or property owner."
    >
      <SignUp appearance={clerkAppearance} />
    </AuthFrame>
  );
}
