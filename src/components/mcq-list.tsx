"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError } from "@/components/ui/field";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { mcqEditHref, mcqNewHref, mcqPreviewHref } from "@/lib/mcq-paths";

type McqSummary = {
	id: string;
	name: string;
	question: string;
};

function errorMessage(payload: unknown, fallback: string) {
	if (
		payload &&
		typeof payload === "object" &&
		"error" in payload &&
		typeof payload.error === "string" &&
		payload.error.length > 0
	) {
		return payload.error;
	}
	return fallback;
}

export function McqList({ createdByUserId }: { createdByUserId?: string }) {
	const router = useRouter();
	const [mcqs, setMcqs] = useState<McqSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [logoutPending, setLogoutPending] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<McqSummary | null>(null);
	const [deletePending, setDeletePending] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError(null);
			try {
				const response = await fetch("/api/mcqs");
				const payload = (await response.json().catch(() => null)) as
					| { mcqs?: McqSummary[]; error?: unknown }
					| null;
				if (!response.ok) {
					if (!cancelled) {
						setError(errorMessage(payload, "Unable to load questions"));
					}
					return;
				}
				if (!cancelled) {
					setMcqs(Array.isArray(payload?.mcqs) ? payload.mcqs : []);
				}
			} catch {
				if (!cancelled) {
					setError("Unable to load questions");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	async function onLogout() {
		setLogoutPending(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} catch {
			// Logout is best-effort; still return the teacher to login.
		} finally {
			router.push("/login");
			setLogoutPending(false);
		}
	}

	async function confirmDelete() {
		if (!deleteTarget) {
			return;
		}
		setDeletePending(true);
		setError(null);
		try {
			const response = await fetch(`/api/mcqs/${deleteTarget.id}`, { method: "DELETE" });
			const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
			if (!response.ok) {
				setError(errorMessage(payload, "Unable to delete question"));
				return;
			}
			setMcqs((current) => current.filter((mcq) => mcq.id !== deleteTarget.id));
			setDeleteTarget(null);
		} catch {
			setError("Unable to delete question");
		} finally {
			setDeletePending(false);
		}
	}

	return (
		<div className="flex min-h-svh w-full justify-center p-6 md:p-10">
			<div className="flex w-full max-w-5xl flex-col gap-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h1 className="font-heading text-2xl font-medium">MCQ Management</h1>
					<div className="flex items-center gap-2">
						<Button type="button" onClick={() => router.push(mcqNewHref(createdByUserId))}>
							Create MCQ
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={onLogout}
							disabled={logoutPending}
						>
							Log out
						</Button>
					</div>
				</div>

				{error ? <FieldError>{error}</FieldError> : null}

				{loading ? (
					<p className="text-sm text-muted-foreground">Loading questions…</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Question</TableHead>
								<TableHead>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{mcqs.length === 0 ? (
								<TableRow>
									<TableCell colSpan={3} className="whitespace-normal text-muted-foreground">
										No questions yet. Create an MCQ to start the shared test-bank.
									</TableCell>
								</TableRow>
							) : (
								mcqs.map((mcq) => (
									<TableRow key={mcq.id}>
										<TableCell className="font-medium">{mcq.name}</TableCell>
										<TableCell className="max-w-xl whitespace-normal">
											<span className="line-clamp-2">{mcq.question}</span>
										</TableCell>
										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger
													render={
														<Button
															variant="ghost"
															size="icon"
															aria-label={`Actions for ${mcq.name}`}
														/>
													}
												>
													<EllipsisVertical />
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														onClick={() =>
															router.push(mcqEditHref(mcq.id, createdByUserId))
														}
													>
														Edit
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() =>
															router.push(mcqPreviewHref(mcq.id, createdByUserId))
														}
													>
														Preview
													</DropdownMenuItem>
													<DropdownMenuItem
														variant="destructive"
														onClick={() => setDeleteTarget(mcq)}
													>
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				)}

				<Dialog
					open={deleteTarget !== null}
					onOpenChange={(open) => {
						if (!open && !deletePending) {
							setDeleteTarget(null);
						}
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Delete question?</DialogTitle>
							<DialogDescription>
								This will remove <strong>{deleteTarget?.name}</strong> from the
								shared test-bank.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setDeleteTarget(null)}
								disabled={deletePending}
							>
								Cancel
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={confirmDelete}
								disabled={deletePending}
							>
								Delete
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	);
}
