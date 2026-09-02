"use client";

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { mcqHomeHref } from "@/lib/mcq-paths";

type ChoiceDraft = {
	id?: string;
	body: string;
	isCorrect: boolean;
};

type LoadedMcq = {
	id: string;
	name: string;
	question: string;
	choices: { id: string; body: string; isCorrect: boolean; position: number }[];
};

function emptyChoices(): ChoiceDraft[] {
	return [
		{ body: "", isCorrect: true },
		{ body: "", isCorrect: false },
	];
}

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

export function McqForm({
	mode,
	createdByUserId,
	mcqId,
}: {
	mode: "create" | "edit";
	createdByUserId?: string;
	mcqId?: string;
}) {
	const router = useRouter();
	const [name, setName] = useState("");
	const [question, setQuestion] = useState("");
	const [choices, setChoices] = useState<ChoiceDraft[]>(emptyChoices);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [loadState, setLoadState] = useState<"idle" | "loading" | "missing" | "ready">(
		mode === "edit" ? "loading" : "ready",
	);

	useEffect(() => {
		if (mode !== "edit" || !mcqId) {
			return;
		}

		let cancelled = false;

		async function load() {
			try {
				const response = await fetch(`/api/mcqs/${mcqId}`);
				const payload = (await response.json().catch(() => null)) as
					| { mcq?: LoadedMcq; error?: unknown }
					| null;
				if (!response.ok || !payload?.mcq) {
					if (!cancelled) {
						setLoadState("missing");
					}
					return;
				}
				if (!cancelled) {
					const loaded = payload.mcq;
					setName(loaded.name);
					setQuestion(loaded.question);
					setChoices(
						[...loaded.choices]
							.sort((a, b) => a.position - b.position)
							.map((choice) => ({
								id: choice.id,
								body: choice.body,
								isCorrect: choice.isCorrect,
							})),
					);
					setLoadState("ready");
				}
			} catch {
				if (!cancelled) {
					setLoadState("missing");
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [mode, mcqId]);

	function markCorrect(index: number) {
		setChoices((current) =>
			current.map((choice, choiceIndex) => ({
				...choice,
				isCorrect: choiceIndex === index,
			})),
		);
	}

	function updateChoiceBody(index: number, body: string) {
		setChoices((current) =>
			current.map((choice, choiceIndex) =>
				choiceIndex === index ? { ...choice, body } : choice,
			),
		);
	}

	function addChoice() {
		setChoices((current) => {
			if (current.length >= 6) {
				return current;
			}
			return [...current, { body: "", isCorrect: false }];
		});
	}

	function removeChoice(index: number) {
		setChoices((current) => {
			if (current.length <= 2) {
				return current;
			}
			const next = current.filter((_, choiceIndex) => choiceIndex !== index);
			if (!next.some((choice) => choice.isCorrect) && next[0]) {
				next[0] = { ...next[0], isCorrect: true };
			}
			return next;
		});
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const trimmedName = name.trim();
		const trimmedQuestion = question.trim();
		if (!trimmedName) {
			setError("Name is required");
			return;
		}
		if (!trimmedQuestion) {
			setError("Question is required");
			return;
		}
		if (choices.some((choice) => choice.body.trim().length === 0)) {
			setError("Choice text is required");
			return;
		}
		if (mode === "create" && !createdByUserId) {
			setError("Created by user is required to save this MCQ.");
			return;
		}

		const payloadChoices = choices.map((choice, index) => ({
			...(choice.id ? { id: choice.id } : {}),
			body: choice.body.trim(),
			isCorrect: choice.isCorrect,
			position: index + 1,
		}));

		setPending(true);
		try {
			const response = await fetch(mode === "create" ? "/api/mcqs" : `/api/mcqs/${mcqId}`, {
				method: mode === "create" ? "POST" : "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					mode === "create"
						? {
								name: trimmedName,
								question: trimmedQuestion,
								createdByUserId,
								choices: payloadChoices,
							}
						: {
								name: trimmedName,
								question: trimmedQuestion,
								choices: payloadChoices,
							},
				),
			});
			const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
			if (!response.ok) {
				setError(
					errorMessage(
						payload,
						mode === "create" ? "Unable to create question" : "Unable to update question",
					),
				);
				return;
			}
			router.push(mcqHomeHref(createdByUserId));
		} catch {
			setError(mode === "create" ? "Unable to create question" : "Unable to update question");
		} finally {
			setPending(false);
		}
	}

	if (mode === "edit" && loadState === "loading") {
		return (
			<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
				<p className="text-sm text-muted-foreground">Loading question…</p>
			</div>
		);
	}

	if (mode === "edit" && loadState === "missing") {
		return (
			<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
				<div className="flex w-full max-w-md flex-col gap-4">
					<p>Question not found</p>
					<Button type="button" variant="outline" onClick={() => router.push(mcqHomeHref(createdByUserId))}>
						Back
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-svh w-full justify-center p-6 md:p-10">
			<div className="w-full max-w-2xl">
				<Card>
					<CardHeader>
						<CardTitle>{mode === "create" ? "Create MCQ" : "Edit MCQ"}</CardTitle>
						<CardDescription>
							{mode === "create"
								? "Add a named question and 2 to 6 choices to the shared test-bank."
								: "Update this question. The original author is not changed."}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={onSubmit} noValidate>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="mcq-name">Name</FieldLabel>
									<Input
										id="mcq-name"
										name="name"
										value={name}
										onChange={(event) => setName(event.currentTarget.value)}
										maxLength={200}
										required
									/>
									<FieldDescription>A short name for this MCQ in the table.</FieldDescription>
								</Field>
								<Field>
									<FieldLabel htmlFor="mcq-question">Question</FieldLabel>
									<Textarea
										id="mcq-question"
										name="question"
										value={question}
										onChange={(event) => setQuestion(event.currentTarget.value)}
										maxLength={2000}
										required
									/>
									<FieldDescription>
										This is the question text shown in preview.
									</FieldDescription>
								</Field>
								<Field>
									<FieldLabel>Choices</FieldLabel>
									<FieldDescription>
										2 to 6 choices. Exactly one must be marked correct.
									</FieldDescription>
									<div className="flex flex-col gap-3">
										{choices.map((choice, index) => (
											<div key={choice.id ?? `new-${index}`} className="flex items-end gap-2">
												<Field className="flex-1">
													<FieldLabel htmlFor={`choice-body-${index}`}>
														Choice {index + 1}
													</FieldLabel>
													<Input
														id={`choice-body-${index}`}
														value={choice.body}
														onChange={(event) =>
															updateChoiceBody(index, event.currentTarget.value)
														}
														maxLength={500}
														required
													/>
												</Field>
												<label className="flex items-center gap-2 pb-2 text-sm whitespace-nowrap">
													<input
														type="radio"
														name="correct-choice"
														checked={choice.isCorrect}
														onChange={() => markCorrect(index)}
														aria-label={`Mark choice ${index + 1} as correct`}
													/>
													Correct
												</label>
												{choices.length > 2 ? (
													<Button
														type="button"
														variant="outline"
														className="mb-0.5"
														onClick={() => removeChoice(index)}
														aria-label={`Remove choice ${index + 1}`}
													>
														Remove
													</Button>
												) : null}
											</div>
										))}
									</div>
									<Button
										type="button"
										variant="outline"
										onClick={addChoice}
										disabled={choices.length >= 6}
									>
										Add choice
									</Button>
								</Field>
								{error ? <FieldError>{error}</FieldError> : null}
								<Field orientation="horizontal" className="flex-wrap gap-4 pt-2">
									<Button type="submit" disabled={pending}>
										Save
									</Button>
									<Button
										type="button"
										variant="outline"
										onClick={() => router.push(mcqHomeHref(createdByUserId))}
										disabled={pending}
									>
										Cancel
									</Button>
								</Field>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
