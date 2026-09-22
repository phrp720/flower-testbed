"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { signIn, useSession } from "next-auth/react";
import { Button, Callout, Card, Icon, Input, Spinner } from "@/app/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.push("/testbed/dashboard");
  }, [status, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const result = await signIn("credentials", { username, password, redirect: false });

    if (result?.ok) {
      router.push("/testbed/dashboard");
      return;
    }

    setError("Invalid username or password.");
    setSubmitting(false);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={18} />
      </div>
    );
  }

  if (status === "authenticated") return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <Image src="/mark.svg" alt="" width={140} height={140} priority />
          <h1 className="text-xl font-semibold text-ink mt-2">Flower Testbed</h1>
          <p className="text-sm text-ink-muted mt-1">
            Federated learning experiment platform
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Callout tone="danger">{error}</Callout>}

            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />

            {/* Not the shared Input, because the reveal toggle has to sit
                inside the control's own box. */}
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-ink-muted mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full h-9 pl-3 pr-10 rounded-[var(--radius)] border border-line-strong bg-surface text-ink text-sm placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded text-ink-subtle hover:text-ink transition-colors"
                >
                  <Icon name={showPassword ? "hide" : "view"} size={15} />
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              icon="login"
              loading={submitting}
              className="w-full"
            >
              {submitting ? "Signing in" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
