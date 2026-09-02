import { z } from "zod";

const choiceSchema = z.object({
	body: z.string().trim().min(1, "Choice text is required").max(500),
	isCorrect: z.boolean(),
	position: z.number().int().min(1),
});

const updateChoiceSchema = choiceSchema.extend({
	id: z.string().trim().min(1).optional(),
});

function exactlyOneCorrect(choices: { isCorrect: boolean }[]) {
	return choices.filter((choice) => choice.isCorrect).length === 1;
}

function contiguousPositions(choices: { position: number }[]) {
	const positions = [...choices.map((choice) => choice.position)].sort((a, b) => a - b);
	return positions.every((position, index) => position === index + 1);
}

const choicesSchema = z
	.array(choiceSchema)
	.min(2, "A question must have between 2 and 6 choices")
	.max(6, "A question must have between 2 and 6 choices")
	.refine(exactlyOneCorrect, { message: "Exactly one choice must be marked correct" })
	.refine(contiguousPositions, {
		message: "Choice positions must be unique and contiguous starting at 1",
	});

const updateChoicesSchema = z
	.array(updateChoiceSchema)
	.min(2, "A question must have between 2 and 6 choices")
	.max(6, "A question must have between 2 and 6 choices")
	.refine(exactlyOneCorrect, { message: "Exactly one choice must be marked correct" })
	.refine(contiguousPositions, {
		message: "Choice positions must be unique and contiguous starting at 1",
	});

export const createMcqBodySchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(200),
	question: z.string().trim().min(1, "Question is required").max(2000),
	createdByUserId: z.string().trim().min(1, "createdByUserId is required"),
	choices: choicesSchema,
});

export const updateMcqBodySchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(200),
	question: z.string().trim().min(1, "Question is required").max(2000),
	choices: updateChoicesSchema,
});

export const createAttemptBodySchema = z.object({
	mcqId: z.string().trim().min(1, "mcqId is required"),
	userId: z.string().trim().min(1, "userId is required"),
	choiceId: z.string().trim().min(1, "choiceId is required"),
});
