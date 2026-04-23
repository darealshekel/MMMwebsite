export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <main className="container py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
