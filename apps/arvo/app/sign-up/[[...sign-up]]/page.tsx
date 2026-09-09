import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="page page-center">
      <div className="container container-tight py-4">
        <SignUp />
      </div>
    </div>
  );
}
