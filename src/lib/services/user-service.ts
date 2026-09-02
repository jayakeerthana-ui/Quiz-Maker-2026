import { getDb } from "@/lib/db";

export type UserConflictField = "username" | "email";

export class UserConflictError extends Error {
	readonly field: UserConflictField;

	constructor(field: UserConflictField) {
		super(field === "username" ? "Username is already taken" : "Email is already taken");
		this.name = "UserConflictError";
		this.field = field;
	}
}

export type UserRecord = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
	createdAt: string;
	updatedAt: string;
};

export type PublicUser = Omit<UserRecord, "passwordHash">;

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
};

export type UpdateUserFields = {
	firstName?: string;
	lastName?: string;
	username?: string;
	email?: string;
	passwordHash?: string;
};

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
	created_at: string;
	updated_at: string;
};

const USER_COLUMNS =
	"id, first_name, last_name, username, email, password_hash, created_at, updated_at";

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function mapUser(row: UserRow): UserRecord {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
		passwordHash: row.password_hash,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function toPublicUser(user: UserRecord): PublicUser {
	return {
		id: user.id,
		firstName: user.firstName,
		lastName: user.lastName,
		username: user.username,
		email: user.email,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	};
}

function conflictFromUnknown(error: unknown): UserConflictError | null {
	const message = error instanceof Error ? error.message : String(error);
	if (!/UNIQUE constraint failed/i.test(message)) {
		return null;
	}
	if (/users\.email/i.test(message)) {
		return new UserConflictError("email");
	}
	return new UserConflictError("username");
}

async function firstUser(sql: string, ...params: string[]): Promise<UserRecord | null> {
	const db = await getDb();
	const { results } = await db.prepare(sql).bind(...params).all<UserRow>();
	const row = results[0];
	return row ? mapUser(row) : null;
}

async function assertIdentifierAvailable(input: {
	username: string;
	email: string;
	exceptId?: string;
}): Promise<void> {
	const emailOwner = await getUserByEmail(input.username);
	if (emailOwner && emailOwner.id !== input.exceptId) {
		throw new UserConflictError("username");
	}

	const usernameOwner = await getUserByUsername(input.email);
	if (usernameOwner && usernameOwner.id !== input.exceptId) {
		throw new UserConflictError("email");
	}
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
	const firstName = input.firstName.trim();
	const lastName = input.lastName.trim();
	const username = input.username.trim();
	const email = normalizeEmail(input.email);

	await assertIdentifierAvailable({ username, email });

	const db = await getDb();
	try {
		const { results } = await db
			.prepare(
				`INSERT INTO users (first_name, last_name, username, email, password_hash)
VALUES (?1, ?2, ?3, ?4, ?5)
RETURNING ${USER_COLUMNS}`,
			)
			.bind(firstName, lastName, username, email, input.passwordHash)
			.all<UserRow>();
		const row = results[0];
		if (!row) {
			throw new Error("Failed to create user");
		}
		return mapUser(row);
	} catch (error) {
		const conflict = conflictFromUnknown(error);
		if (conflict) {
			throw conflict;
		}
		throw error;
	}
}

export async function getUserById(id: string): Promise<UserRecord | null> {
	return firstUser(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?1`, id);
}

export async function getUserByUsername(username: string): Promise<UserRecord | null> {
	return firstUser(
		`SELECT ${USER_COLUMNS} FROM users WHERE username = ?1`,
		username.trim(),
	);
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
	return firstUser(
		`SELECT ${USER_COLUMNS} FROM users WHERE email = ?1`,
		normalizeEmail(email),
	);
}

export async function getUserByLoginIdentifier(identifier: string): Promise<UserRecord | null> {
	const trimmed = identifier.trim();
	return firstUser(
		`SELECT ${USER_COLUMNS} FROM users WHERE username = ?1 OR email = ?2`,
		trimmed,
		normalizeEmail(identifier),
	);
}

export async function updateUser(
	id: string,
	fields: UpdateUserFields,
): Promise<UserRecord | null> {
	const existing = await getUserById(id);
	if (!existing) {
		return null;
	}

	const nextUsername = fields.username !== undefined ? fields.username.trim() : existing.username;
	const nextEmail = fields.email !== undefined ? normalizeEmail(fields.email) : existing.email;
	await assertIdentifierAvailable({ username: nextUsername, email: nextEmail, exceptId: id });

	const assignments: string[] = [];
	const params: string[] = [];
	let index = 1;

	if (fields.firstName !== undefined) {
		assignments.push(`first_name = ?${index++}`);
		params.push(fields.firstName.trim());
	}
	if (fields.lastName !== undefined) {
		assignments.push(`last_name = ?${index++}`);
		params.push(fields.lastName.trim());
	}
	if (fields.username !== undefined) {
		assignments.push(`username = ?${index++}`);
		params.push(nextUsername);
	}
	if (fields.email !== undefined) {
		assignments.push(`email = ?${index++}`);
		params.push(nextEmail);
	}
	if (fields.passwordHash !== undefined) {
		assignments.push(`password_hash = ?${index++}`);
		params.push(fields.passwordHash);
	}

	assignments.push("updated_at = datetime('now')");
	params.push(id);

	const db = await getDb();
	try {
		const { results } = await db
			.prepare(
				`UPDATE users SET ${assignments.join(", ")} WHERE id = ?${index} RETURNING ${USER_COLUMNS}`,
			)
			.bind(...params)
			.all<UserRow>();
		const row = results[0];
		return row ? mapUser(row) : null;
	} catch (error) {
		const conflict = conflictFromUnknown(error);
		if (conflict) {
			throw conflict;
		}
		throw error;
	}
}

export async function deleteUser(id: string): Promise<boolean> {
	const db = await getDb();
	const { results } = await db
		.prepare("DELETE FROM users WHERE id = ?1 RETURNING id")
		.bind(id)
		.all<{ id: string }>();
	return results.length > 0;
}
