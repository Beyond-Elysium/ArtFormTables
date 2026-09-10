import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="page page-center">
      <div className="container container-tight py-4">
        <SignUp path="/arvo/sign-up" routing="path" signInUrl="/arvo/sign-in" />
      </div>
    </div>
  );
}
