import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/lib";
import { Logo } from "@/components/logo";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-ink-950">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/5 bg-ink-900/80 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-4">
          <Logo size={24} />
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-red-400">
            ADMIN
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link href="/dashboard" className="text-slate-400 transition hover:text-white">
            → Dashboard user
          </Link>
          <span className="hidden text-slate-500 sm:inline">{user.username}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
