"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { mcqHomeHref } from "@/lib/mcq-paths";

type LoadedMcq = {
	id: string;
	name: string;
	question: string;
	choices: { id: string; body: string; isCorrect: boolean; position: number }[];
};

type CheckResult = "correct" | "incorrect";

export function McqPreview({
	mcqId,
	createdByUserId,
}: {
	mcqId: string;
	createdByUserId?: string;
}) {
	const router = useRouter();
	const [mcq, setMcq] = useState<LoadedMcq | null>(null);
	const [loadState, setLoadState] = useState<"loading" | "missing" | "ready">("loading");
	const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
	const [result, setResult] = useState<CheckResult | null>(null);
	const [selectionError, setSelectionError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const response = await fetch(`/api/mcqs/${mcqId}`);
				const payload = (await response.json().catch(() => null)) as
					| { mcq?: LoadedMcq }
					| null;
				if (!response.ok || !payload?.mcq) {
					if (!cancelled) {
						setLoadState("missing");
					}
					return;
				}
				if (!cancelled) {
					setMcq({
						...payload.mcq,
						choices: [...payload.mcq.choices].sort((a, b) => a.position - b.position),
					});
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
	}, [mcqId]);

	function checkAnswer() {
		if (!mcq || !selectedChoiceId) {
			setResult(null);
			setSelectionError("Select an answer first");
			return;
		}

		const selected = mcq.choices.find((choice) => choice.id === selectedChoiceId);
		setSelectionError(null);
		setResult(selected?.isCorrect ? "correct" : "incorrect");
	}

	if (loadState === "loading") {
		return (
			<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
				<p className="text-sm text-muted-foreground">Loading question…</p>
			</div>
		);
	}

	if (loadState === "missing" || !mcq) {
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
			<div className="flex w-full max-w-2xl flex-col gap-6">
				<div className="flex items-center justify-between gap-3">
					<p className="text-sm text-muted-foreground">Preview</p>
					<Button type="button" variant="outline" onClick={() => router.push(mcqHomeHref(createdByUserId))}>
						Back
					</Button>
				</div>
				<h1 className="font-heading text-2xl font-medium">{mcq.name}</h1>
				<p className="text-base">{mcq.question}</p>
				<fieldset className="flex flex-col gap-3 border-0 p-0">
					<legend className="sr-only">Choices</legend>
					<ol className="flex flex-col gap-3">
						{mcq.choices.map((choice) => (
							<li key={choice.id}>
								<label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border p-3">
									<span className="flex items-start gap-3">
										<input
											type="radio"
											name="preview-choice"
											value={choice.id}
											checked={selectedChoiceId === choice.id}
											onChange={() => {
												setSelectedChoiceId(choice.id);
												setSelectionError(null);
											}}
											className="mt-1"
										/>
										<span>{choice.body}</span>
									</span>
									{result && choice.isCorrect ? <Badge>Correct</Badge> : null}
								</label>
							</li>
						))}
					</ol>
				</fieldset>
				{selectionError ? <FieldError>{selectionError}</FieldError> : null}
				{result === "correct" ? (
					<p role="alert" className="text-sm font-medium">
						Correct
					</p>
				) : null}
				{result === "incorrect" ? (
					<p role="alert" className="text-sm font-medium text-destructive">
						Incorrect
					</p>
				) : null}
				<Button type="button" onClick={checkAnswer}>
					Check answer
				</Button>
			</div>
		</div>
	);
}
