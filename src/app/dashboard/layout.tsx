import { redirect } from "next/navigation";
import { getSessionUser, isMaintenanceActive } from "@/server/lib";
import DashboardShell from "@/components/DashboardShell";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

function MaintenanceScreen() {
  return (
    <div className="grid-bg flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo size={44} />
      <div className="glass mt-8 max-w-md rounded-2xl p-8">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
          </svg>
        </span>
        <h1 className="font-display text-xl font-bold text-white">Mode Maintenance</h1>
        <p className="mt-2 text-sm text-slate-400">
          WATER AI CLOUD sedang dalam perawatan. Semua bot tetap berjalan di engine kami —
          dashboard akan kembali dalam waktu singkat.
        </p>
        <p className="mt-4 text-[11px] text-slate-600">Admin tetap dapat mengakses panel.</p>
      </div>
    </div>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.suspended) redirect("/login?suspended=1");

  const maint = await isMaintenanceActive();
  if (maint && user.role !== "ADMIN") return <MaintenanceScreen />;

  return (
    <DashboardShell
      user={{
        username: user.username,
        email: user.email,
        role: user.role,
        plan: user.plan,
      }}
    >
      {children}
    </DashboardShell>
  );
}
