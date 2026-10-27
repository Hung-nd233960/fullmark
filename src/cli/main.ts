import { Command } from "commander";
import { type CheckOptions, runCheck } from "./check";
import { EXIT, type ExitCode } from "./exit-codes";
import { type IdsOptions, type Io, runIds } from "./ids";
import { type RulesOptions, runRules } from "./rules";

export const VERSION = "1.0.0-alpha.0";

/** The exit code a command asked for; an action sets it and `main` returns it. */
type Outcome = { exit: ExitCode };

function terminalIo(): Io {
  return {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
    errRaw: (text) => process.stderr.write(text),
    cwd: process.cwd(),
    tty: Boolean(process.stderr.isTTY),
  };
}

export function buildProgram(outcome: Outcome = { exit: EXIT.done }, io: Io = terminalIo()): Command {
  const program = new Command();
  program
    .name("quiz")
    .description("Markdown in, one offline HTML quiz out.")
    .version(`fullmark ${VERSION}`, "--version", "print the version")
    .helpOption("-h, --help", "help for the command")
    .exitOverride();

  const noColor = () => "NO_COLOR" in process.env;

  program
    .command("check")
    .description("check quizzes under a profile: syntax errors, quality warnings, the brief beside the quiz")
    .argument("<files...>", "quiz .md files (globs are expanded)")
    .option("--profile <name>", "the check profile; overrides the quiz's profile:")
    .option("--config <toml>", "use this config file instead of the nearest fullmark.toml")
    .option("--strict", "warnings count as errors")
    .option(
      "--review <review.json>",
      "also fail until every flagged question changed (not available yet: it arrives with quiz review)",
    )
    .option("--json", "print one JSON object per file on stdout")
    .option("--plain", "no colours and no progress line, even in a terminal")
    .action(
      (
        files: string[],
        options: {
          profile?: string;
          config?: string;
          strict?: boolean;
          review?: string;
          json?: boolean;
          plain?: boolean;
        },
      ) => {
        const opts: CheckOptions = {
          profile: options.profile ?? null,
          config: options.config ?? null,
          strict: Boolean(options.strict),
          review: options.review ?? null,
          json: Boolean(options.json),
          plain: Boolean(options.plain) || noColor(),
        };
        outcome.exit = runCheck(files, opts, io);
      },
    );

  program
    .command("rules")
    .description("the rule catalogue: what a profile checks and why a quiz was held to a rule")
    .argument("[rule]", "a rule id, such as choice.correct-longest or custom.two-essays")
    .option("--profile <name>", "show the rules under this profile (default: default, or the quiz's with --for)")
    .option(
      "--for <file>",
      "resolve the config and the profile as check FILE would, and show where each value came from",
    )
    .option("--config <toml>", "use this config file instead of the nearest fullmark.toml")
    .option("--json", "print the rules as one JSON object on stdout")
    .option("--plain", "no colours, even in a terminal")
    .action(
      (
        rule: string | undefined,
        options: { profile?: string; for?: string; config?: string; json?: boolean; plain?: boolean },
      ) => {
        const opts: RulesOptions = {
          profile: options.profile ?? null,
          for: options.for ?? null,
          config: options.config ?? null,
          json: Boolean(options.json),
          plain: Boolean(options.plain) || noColor(),
        };
        outcome.exit = runRules(rule ?? null, opts, io);
      },
    );

  program
    .command("ids")
    .description("give every question without an id a random one, and change nothing else")
    .argument("<files...>", "quiz .md files (globs are expanded)")
    .option("--dry-run", "list the ids it would add, and write nothing")
    .option("--json", "print one JSON object per file on stdout")
    .option("--plain", "no progress line, even in a terminal")
    .action(async (files: string[], options: { dryRun?: boolean; json?: boolean; plain?: boolean }) => {
      const opts: IdsOptions = {
        dryRun: Boolean(options.dryRun),
        json: Boolean(options.json),
        plain: Boolean(options.plain) || "NO_COLOR" in process.env,
      };
      outcome.exit = await runIds(files, opts, io);
    });
  return program;
}

async function main(argv: string[]): Promise<number> {
  const outcome: Outcome = { exit: EXIT.done };
  try {
    await buildProgram(outcome).parseAsync(argv);
    return outcome.exit;
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    // --version and --help end the parse through exitOverride; they are not failures.
    if (code === "commander.version" || code === "commander.helpDisplayed" || code === "commander.help") {
      return EXIT.done;
    }
    if (code.startsWith("commander.")) return EXIT.usage;
    // Anything else is a bug: say so, with the command line, and the stack only on request.
    process.stderr.write(`this is a bug in fullmark: ${(error as Error).message}\n`);
    process.stderr.write(`command line: ${argv.slice(2).join(" ")}\n`);
    if (argv.includes("--debug")) process.stderr.write(`${(error as Error).stack ?? ""}\n`);
    return EXIT.usage;
  }
}

process.exitCode = await main(process.argv);
