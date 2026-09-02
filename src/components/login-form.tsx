"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sha256Hex } from "@/lib/password";

export function LoginForm({
	className,
	...props
}: React.ComponentProps<"div">) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const form = event.currentTarget;
		const data = new FormData(form);
		const identifier = String(data.get("identifier") ?? "").trim();
		const password = String(data.get("password") ?? "");

		if (!identifier || !password) {
			setError("Username or email and password are required");
			return;
		}

		setPending(true);
		try {
			const hashedPassword = await sha256Hex(password);
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ identifier, password: hashedPassword }),
			});
			const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

			if (!response.ok) {
				setError(
					typeof payload?.error === "string" && payload.error.length > 0
						? payload.error
						: "Unable to log in",
				);
				return;
			}

			router.push("/mcq");
		} catch {
			setError("Unable to log in");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader>
					<CardTitle>Login to your account</CardTitle>
					<CardDescription>
						Enter your username or email below to login to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} noValidate>
						<FieldGroup>
							<Field data-invalid={error ? true : undefined}>
								<FieldLabel htmlFor="identifier">Username or email</FieldLabel>
								<Input
									id="identifier"
									name="identifier"
									type="text"
									autoComplete="username"
									placeholder="ada or m@example.com"
									required
								/>
							</Field>
							<Field data-invalid={error ? true : undefined}>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									name="password"
									type="password"
									autoComplete="current-password"
									required
								/>
							</Field>
							{error ? <FieldError>{error}</FieldError> : null}
							<Field>
								<Button type="submit" disabled={pending}>
									Login
								</Button>
								<FieldDescription className="text-center">
									Don&apos;t have an account? <Link href="/register">Sign up</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
