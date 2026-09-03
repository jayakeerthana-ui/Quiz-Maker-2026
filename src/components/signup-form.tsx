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
import { sha256Hex } from "@/lib/password";

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const data = new FormData(event.currentTarget);
		const firstName = String(data.get("firstName") ?? "").trim();
		const lastName = String(data.get("lastName") ?? "").trim();
		const username = String(data.get("username") ?? "").trim();
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");

		if (!firstName || !lastName || !username || !email || !password) {
			setError("All fields are required");
			return;
		}

		if (password.length < 8) {
			setError("Password must be at least 8 characters long");
			return;
		}

		setPending(true);
		try {
			const hashedPassword = await sha256Hex(password);
			const response = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					firstName,
					lastName,
					username,
					email,
					password: hashedPassword,
				}),
			});
			const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

			if (!response.ok) {
				setError(
					typeof payload?.error === "string" && payload.error.length > 0
						? payload.error
						: "Unable to register",
				);
				return;
			}

			router.push("/login");
		} catch {
			setError("Unable to register");
		} finally {
			setPending(false);
		}
	}

	return (
		<Card {...props}>
			<CardHeader>
				<CardTitle>Create an account</CardTitle>
				<CardDescription>
					Enter your information below to create your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} noValidate>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="firstName">First name</FieldLabel>
							<Input
								id="firstName"
								name="firstName"
								type="text"
								autoComplete="given-name"
								placeholder="Ada"
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="lastName">Last name</FieldLabel>
							<Input
								id="lastName"
								name="lastName"
								type="text"
								autoComplete="family-name"
								placeholder="Lovelace"
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="username">Username</FieldLabel>
							<Input
								id="username"
								name="username"
								type="text"
								autoComplete="username"
								placeholder="ada"
								required
							/>
							<FieldDescription>
								Required and unique. May also be an email address. Can be used
								later to log in.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								name="email"
								type="email"
								autoComplete="email"
								placeholder="m@example.com"
								required
							/>
							<FieldDescription>
								This address is required, must be unique, and can be used later
								to log in.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="new-password"
								minLength={8}
								required
							/>
							<FieldDescription>
								Must be at least 8 characters long.
							</FieldDescription>
						</Field>
						{error ? <FieldError>{error}</FieldError> : null}
						<Field>
							<Button type="submit" disabled={pending}>
								Create Account
							</Button>
							<FieldDescription className="px-6 text-center">
								Already have an account? <Link href="/login">Sign in</Link>
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
