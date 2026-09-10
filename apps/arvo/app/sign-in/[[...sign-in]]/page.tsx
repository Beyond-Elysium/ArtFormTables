import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="page page-center">
      <div className="container container-tight py-4">
        <SignIn path="/arvo/sign-in" routing="path" signUpUrl="/arvo/sign-up" />
      </div>
    </div>
  );
}
