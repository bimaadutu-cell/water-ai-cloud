import { Suspense } from "react";
import { ResetForm } from "@/components/auth";
export const metadata = { title: "Reset Password" };
export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
