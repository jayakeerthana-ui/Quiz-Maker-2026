"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export function McqStub() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function onLogout() {
		setPending(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} catch {
			// Logout is best-effort; still return the teacher to login.
		} finally {
			router.push("/login");
			setPending(false);
		}
	}

	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-sm">
				<Card>
					<CardHeader>
						<CardTitle>MCQ Management</CardTitle>
						<CardDescription>
							This is the future shared test-bank workspace. Question CRUD is
							not available yet.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button type="button" variant="outline" onClick={onLogout} disabled={pending}>
							Log out
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
