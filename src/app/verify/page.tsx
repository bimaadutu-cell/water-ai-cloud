import { Suspense } from "react";
import { VerifyPage } from "@/components/auth";
export const metadata = { title: "Verify Email" };
export default function Page() {
  return (
    <Suspense>
      <VerifyPage />
    </Suspense>
  );
}
