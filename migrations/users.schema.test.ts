import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "migrations");

function readAllMigrationSql(): string {
	if (!existsSync(migrationsDir)) {
		throw new Error("migrations directory is missing");
	}

	const files = readdirSync(migrationsDir)
		.filter((name) => name.endsWith(".sql"))
		.sort();

	if (files.length === 0) {
		throw new Error("no SQL migration files found");
	}

	return files.map((name) => readFileSync(join(migrationsDir, name), "utf8")).join("\n");
}

function usersTableDefinition(sql: string): string {
	const match = sql.match(/create\s+table\s+users\s*\(([\s\S]*?)\)\s*;/i);
	if (!match) {
		throw new Error("CREATE TABLE users statement not found");
	}
	return match[1];
}

describe("users table migration", () => {
	it("creates a users table", () => {
		const sql = readAllMigrationSql();
		expect(sql).toMatch(/create\s+table\s+users/i);
	});

	it("defines the required user columns", () => {
		const columns = usersTableDefinition(readAllMigrationSql()).toLowerCase();
		const required = [
			"id",
			"first_name",
			"last_name",
			"username",
			"email",
			"password_hash",
			"created_at",
			"updated_at",
		];

		for (const column of required) {
			expect(columns, `missing column ${column}`).toMatch(new RegExp(`\\b${column}\\b`));
		}
	});

	it("does not store a plaintext password column", () => {
		const columns = usersTableDefinition(readAllMigrationSql());
		const columnNames = columns
			.split(",")
			.map((part) => part.trim().split(/\s+/)[0]?.toLowerCase())
			.filter(Boolean);

		expect(columnNames).toContain("password_hash");
		expect(columnNames).not.toContain("password");
	});

	it("enforces unique username and unique email", () => {
		const sql = readAllMigrationSql().toLowerCase();
		expect(sql).toMatch(/unique\s+index\s+\w+\s+on\s+users\s*\(\s*username\s*\)/);
		expect(sql).toMatch(/unique\s+index\s+\w+\s+on\s+users\s*\(\s*email\s*\)/);
	});
});
