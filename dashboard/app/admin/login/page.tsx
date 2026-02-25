export default function AdminLoginPage({
  searchParams
}: {
  searchParams: { error?: string };
}) {
  const hasError = searchParams.error === "1";

  return (
    <main className="shell">
      <div className="login-wrap card">
        <h1>Admin Login</h1>
        <p className="muted">Founder-only access for MVP.</p>
        {hasError && (
          <p className="pill warn" role="alert">
            Invalid password. Try again.
          </p>
        )}
        <form action="/api/admin/login" method="post" style={{ marginTop: 16 }}>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required />
          <button type="submit">Sign in</button>
        </form>
      </div>
    </main>
  );
}
