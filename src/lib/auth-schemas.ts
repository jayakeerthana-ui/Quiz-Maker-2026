import { z } from "zod";

export const registerBodySchema = z.object({
	firstName: z.string().trim().min(1, "First name is required").max(100),
	lastName: z.string().trim().min(1, "Last name is required").max(100),
	username: z.string().trim().min(3, "Username is required").max(255),
	email: z
		.string()
		.trim()
		.email("Email must be a valid email")
		.transform((value) => value.toLowerCase()),
	password: z.string().min(1, "Password is required"),
});

export const loginBodySchema = z.object({
	identifier: z.string().trim().min(1, "Username or email is required"),
	password: z.string().min(1, "Password is required"),
});

export function firstZodError(error: z.ZodError): string {
	return error.issues[0]?.message ?? "Invalid request";
}
