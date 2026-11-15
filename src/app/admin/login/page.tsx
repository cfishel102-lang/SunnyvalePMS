import { loginAction } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={loginAction} className="card w-full max-w-sm p-7">
        <h1 className="h1">Staff sign in</h1>
        {error && <p className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">That email and password don't match.</p>}
        <div className="mt-5 space-y-4">
          <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required autoFocus /></div>
          <div><label className="label" htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" required /></div>
        </div>
        <button className="btn btn-primary mt-6 w-full">Sign in</button>
      </form>
    </main>
  );
}
