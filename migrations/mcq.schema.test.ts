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

function tableDefinition(sql: string, tableName: string): string {
	const start = sql.search(new RegExp(`create\\s+table\\s+${tableName}\\s*\\(`, "i"));
	if (start === -1) {
		throw new Error(`CREATE TABLE ${tableName} statement not found`);
	}

	const openParen = sql.indexOf("(", start);
	let depth = 0;
	for (let i = openParen; i < sql.length; i++) {
		if (sql[i] === "(") {
			depth += 1;
		} else if (sql[i] === ")") {
			depth -= 1;
			if (depth === 0) {
				return sql.slice(openParen + 1, i);
			}
		}
	}

	throw new Error(`unclosed CREATE TABLE ${tableName}`);
}

function columnNames(definition: string): string[] {
	return definition
		.split(",")
		.map((part) => part.trim().split(/\s+/)[0]?.toLowerCase())
		.filter(
			(name): name is string =>
				Boolean(name) && !["foreign", "primary", "unique", "constraint", "check"].includes(name),
		);
}

describe("mcq tables migration", () => {
	it("creates mcqs, mcq_choices, and mcq_attempts tables", () => {
		const sql = readAllMigrationSql();
		expect(sql).toMatch(/create\s+table\s+mcqs/i);
		expect(sql).toMatch(/create\s+table\s+mcq_choices/i);
		expect(sql).toMatch(/create\s+table\s+mcq_attempts/i);
	});

	it("defines the required mcqs columns and has no description column", () => {
		const names = columnNames(tableDefinition(readAllMigrationSql(), "mcqs"));
		const required = ["id", "name", "question", "created_by_user_id", "created_at", "updated_at"];

		for (const column of required) {
			expect(names, `missing column ${column}`).toContain(column);
		}

		expect(names).not.toContain("description");
	});

	it("defines the required mcq_choices columns", () => {
		const names = columnNames(tableDefinition(readAllMigrationSql(), "mcq_choices"));
		const required = [
			"id",
			"mcq_id",
			"body",
			"is_correct",
			"position",
			"created_at",
			"updated_at",
		];

		for (const column of required) {
			expect(names, `missing column ${column}`).toContain(column);
		}
	});

	it("defines the required mcq_attempts columns and has no updated_at", () => {
		const names = columnNames(tableDefinition(readAllMigrationSql(), "mcq_attempts"));
		const required = ["id", "mcq_id", "user_id", "choice_id", "is_correct", "created_at"];

		for (const column of required) {
			expect(names, `missing column ${column}`).toContain(column);
		}

		expect(names).not.toContain("updated_at");
	});

	it("declares foreign keys from mcqs, choices, and attempts", () => {
		const sql = readAllMigrationSql().toLowerCase();

		expect(sql).toMatch(
			/foreign\s+key\s*\(\s*created_by_user_id\s*\)\s*references\s+users\s*\(\s*id\s*\)/,
		);
		expect(sql).toMatch(/foreign\s+key\s*\(\s*mcq_id\s*\)\s*references\s+mcqs\s*\(\s*id\s*\)/);
		expect(sql).toMatch(/foreign\s+key\s*\(\s*user_id\s*\)\s*references\s+users\s*\(\s*id\s*\)/);
		expect(sql).toMatch(
			/foreign\s+key\s*\(\s*choice_id\s*\)\s*references\s+mcq_choices\s*\(\s*id\s*\)/,
		);
	});

	it("indexes creator, choice parent, unique choice position, and attempt lookups", () => {
		const sql = readAllMigrationSql().toLowerCase();

		expect(sql).toMatch(/index\s+\w+\s+on\s+mcqs\s*\(\s*created_by_user_id\s*\)/);
		expect(sql).toMatch(/index\s+\w+\s+on\s+mcq_choices\s*\(\s*mcq_id\s*\)/);
		expect(sql).toMatch(
			/unique\s+index\s+\w+\s+on\s+mcq_choices\s*\(\s*mcq_id\s*,\s*position\s*\)/,
		);
		expect(sql).toMatch(/index\s+\w+\s+on\s+mcq_attempts\s*\(\s*mcq_id\s*\)/);
		expect(sql).toMatch(/index\s+\w+\s+on\s+mcq_attempts\s*\(\s*user_id\s*\)/);
	});
});
