import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	UserConflictError,
	createUser,
	deleteUser,
	getUserByEmail,
	getUserById,
	getUserByLoginIdentifier,
	getUserByUsername,
	toPublicUser,
	updateUser,
} from "@/lib/services/user-service";

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

const getDb = vi.fn();

vi.mock("@/lib/db", () => ({
	getDb: () => getDb(),
}));

function createFakeD1() {
	const rows: UserRow[] = [];
	let nextId = 1;

	function uniqueOrThrow(username: string, email: string, exceptId?: string) {
		for (const row of rows) {
			if (exceptId && row.id === exceptId) continue;
			if (row.username === username) {
				throw new Error("UNIQUE constraint failed: users.username");
			}
			if (row.email === email) {
				throw new Error("UNIQUE constraint failed: users.email");
			}
		}
	}

	return {
		prepare(sql: string) {
			const normalized = sql.replace(/\s+/g, " ").trim();
			return {
				bind(...params: unknown[]) {
					return {
						async all() {
							if (/insert into users/i.test(normalized)) {
								const [firstName, lastName, username, email, passwordHash] = params as string[];
								uniqueOrThrow(username, email);
								const now = "2026-09-01 12:00:00";
								const row: UserRow = {
									id: `user-${nextId++}`,
									first_name: firstName,
									last_name: lastName,
									username,
									email,
									password_hash: passwordHash,
									created_at: now,
									updated_at: now,
								};
								rows.push(row);
								return { results: [row] };
							}

							if (/delete from users/i.test(normalized)) {
								const id = String(params[0]);
								const index = rows.findIndex((row) => row.id === id);
								if (index === -1) return { results: [] };
								const [removed] = rows.splice(index, 1);
								return { results: [removed] };
							}

							if (/update users/i.test(normalized)) {
								const id = String(params.at(-1));
								const row = rows.find((item) => rowMatchesId(item, id));
								if (!row) return { results: [] };

								let cursor = 0;
								if (/first_name = \?/i.test(normalized)) row.first_name = String(params[cursor++]);
								if (/last_name = \?/i.test(normalized)) row.last_name = String(params[cursor++]);
								if (/username = \?/i.test(normalized)) {
									uniqueOrThrow(String(params[cursor]), row.email, row.id);
									row.username = String(params[cursor++]);
								}
								if (/email = \?/i.test(normalized)) {
									uniqueOrThrow(row.username, String(params[cursor]), row.id);
									row.email = String(params[cursor++]);
								}
								if (/password_hash = \?/i.test(normalized)) row.password_hash = String(params[cursor++]);
								row.updated_at = "2026-09-01 12:30:00";
								return { results: [row] };
							}

							let matches = [...rows];
							if (/where username = \?1 or email = \?2/i.test(normalized)) {
								const username = String(params[0]);
								const email = String(params[1]);
								matches = rows.filter((row) => row.username === username || row.email === email);
							} else if (/where id = \?1/i.test(normalized)) {
								matches = rows.filter((row) => row.id === String(params[0]));
							} else if (/where username = \?1/i.test(normalized)) {
								matches = rows.filter((row) => row.username === String(params[0]));
							} else if (/where email = \?1/i.test(normalized)) {
								matches = rows.filter((row) => row.email === String(params[0]));
							}

							return { results: matches };
						},
					};
				},
			};
		},
	};
}

function rowMatchesId(row: UserRow, id: string) {
	return row.id === id;
}

async function seedAda(overrides: Partial<{
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
}> = {}) {
	return createUser({
		firstName: overrides.firstName ?? "Ada",
		lastName: overrides.lastName ?? "Lovelace",
		username: overrides.username ?? "ada",
		email: overrides.email ?? "ada@school.edu",
		passwordHash: overrides.passwordHash ?? "hashed-secret",
	});
}

describe("user service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getDb.mockResolvedValue(createFakeD1());
	});

	it("createUser persists names, username, email, and passwordHash, never plaintext", async () => {
		const user = await seedAda({ passwordHash: "hashed-secret" });

		expect(user.firstName).toBe("Ada");
		expect(user.lastName).toBe("Lovelace");
		expect(user.username).toBe("ada");
		expect(user.email).toBe("ada@school.edu");
		expect(user.passwordHash).toBe("hashed-secret");
		expect(user.passwordHash).not.toBe("secret");

		const stored = await getUserByUsername("ada");
		expect(stored?.passwordHash).toBe("hashed-secret");
		expect(stored?.passwordHash).not.toBe("secret");
	});

	it("toPublicUser omits passwordHash", async () => {
		const user = await seedAda();
		const publicUser = toPublicUser(user);

		expect(publicUser).toEqual({
			id: user.id,
			firstName: user.firstName,
			lastName: user.lastName,
			username: user.username,
			email: user.email,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		});
		expect(publicUser).not.toHaveProperty("passwordHash");
	});

	it("getUserById, getUserByUsername, and getUserByEmail return the row or null", async () => {
		const user = await seedAda();

		expect(await getUserById(user.id)).toEqual(user);
		expect(await getUserByUsername("ada")).toEqual(user);
		expect(await getUserByEmail("ada@school.edu")).toEqual(user);

		expect(await getUserById("missing")).toBeNull();
		expect(await getUserByUsername("missing")).toBeNull();
		expect(await getUserByEmail("missing@school.edu")).toBeNull();
	});

	it("getUserByLoginIdentifier matches username or email", async () => {
		const user = await seedAda();

		expect(await getUserByLoginIdentifier("ada")).toEqual(user);
		expect(await getUserByLoginIdentifier("  ADA@SCHOOL.EDU  ")).toEqual(user);
		expect(await getUserByLoginIdentifier("nobody")).toBeNull();
	});

	it("updateUser and deleteUser succeed for an existing id", async () => {
		const user = await seedAda();

		const updated = await updateUser(user.id, { firstName: "Augusta" });
		expect(updated?.firstName).toBe("Augusta");
		expect(updated?.username).toBe("ada");
		expect((await getUserById(user.id))?.firstName).toBe("Augusta");

		expect(await deleteUser(user.id)).toBe(true);
		expect(await getUserById(user.id)).toBeNull();
		expect(await deleteUser(user.id)).toBe(false);
	});

	it("duplicate username and duplicate email throw a typed conflict", async () => {
		await seedAda();

		await expect(
			createUser({
				firstName: "Grace",
				lastName: "Hopper",
				username: "ada",
				email: "grace@school.edu",
				passwordHash: "hashed",
			}),
		).rejects.toMatchObject({
			name: "UserConflictError",
			field: "username",
		});

		await expect(
			createUser({
				firstName: "Grace",
				lastName: "Hopper",
				username: "grace",
				email: "ada@school.edu",
				passwordHash: "hashed",
			}),
		).rejects.toMatchObject({
			name: "UserConflictError",
			field: "email",
		});

		await expect(
			createUser({
				firstName: "Grace",
				lastName: "Hopper",
				username: "ada",
				email: "grace@school.edu",
				passwordHash: "hashed",
			}),
		).rejects.toBeInstanceOf(UserConflictError);
	});

	it("rejects a username that collides with another user's email and an email that collides with another user's username", async () => {
		await seedAda({ username: "ada", email: "ada@school.edu" });

		await expect(
			createUser({
				firstName: "Other",
				lastName: "Teacher",
				username: "ada@school.edu",
				email: "other@school.edu",
				passwordHash: "hashed",
			}),
		).rejects.toMatchObject({
			name: "UserConflictError",
			field: "username",
		});

		await expect(
			createUser({
				firstName: "Other",
				lastName: "Teacher",
				username: "other",
				email: "ada",
				passwordHash: "hashed",
			}),
		).rejects.toMatchObject({
			name: "UserConflictError",
			field: "email",
		});
	});
});
