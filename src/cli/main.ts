import { Command } from "commander";
import type { BuildOptions } from "./build";
import type { CheckOptions } from "./check";
import { EXIT, type ExitCode } from "./exit-codes";
import type { GradeOptions } from "./grade";
import type { IdsOptions, Io } from "./ids";
import type { InspectOptions } from "./inspect";
import type { NewOptions } from "./new";
import type { ReplayCommandOptions } from "./replay-command";
import type { RulesOptions } from "./rules";
import { seededIds } from "./seed";
import type { ServeOptions } from "./serve";

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
    // TEST-ONLY: a fixed seed makes `quiz ids` repeatable, for the golden files. Nothing else reads this variable.
    ...(process.env.FULLMARK_TEST_SEED ? { newId: seededIds(process.env.FULLMARK_TEST_SEED) } : {}),
  };
}

export function buildProgram(outcome: Outcome = { exit: EXIT.done }, io: Io = terminalIo()): Command {
  const program = new Command();
  program
    .name("quiz")
    .description("Markdown in, one offline HTML quiz out.")
    .version(`fullmark ${VERSION}`, "--version", "print the version")
    .option(
      "--acknowledgements",
      "print fullmark's licence and every third-party component shipped in the CLI or in its pages (top level only)",
    )
    .helpOption("-h, --help", "help for the command")
    .helpCommand("help [command]", "help for a command")
    .exitOverride();

  const noColor = () => "NO_COLOR" in process.env;

  program
    .command("check")
    .description("check quizzes under a profile: syntax errors, quality warnings, the brief beside the quiz")
    .argument("<files...>", "quiz .md files (globs are expanded)")
    .option("--profile <name>", "the check profile; overrides the quiz's profile")
    .option("--config <toml>", "use this config file instead of the nearest fullmark.toml")
    .option("--strict", "warnings count as errors")
    .option(
      "--review <review.json>",
      "also fail until every flagged question changed (not available yet: it arrives with quiz review)",
    )
    .option("--json", "print one JSON object per file on stdout")
    .option("--plain", "no colours and no progress line, even in a terminal")
    .action(
      async (
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
        outcome.exit = (await import("./check")).runCheck(files, opts, io);
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
      async (
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
        outcome.exit = (await import("./rules")).runRules(rule ?? null, opts, io);
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
      outcome.exit = await (await import("./ids")).runIds(files, opts, io);
    });

  program
    .command("grade")
    .description("re-grade attempts and write a report: score, wrong answers, and the essays laid out for a grader")
    .argument("<results...>", "results files (globs are expanded)")
    .requiredOption("--quiz <file>", "the quiz the attempts were taken on: it holds the answer key and the rubrics")
    .option("-o, --output <out>", "the report file; with several results files, a folder")
    .option("--grades <file>", "fold a filled-in grades file into the report (one results file only)")
    .option("--json", "write *-report.json and a *-grades.json template instead of Markdown, and print JSON")
    .option("--web", "grade by hand in a form (not available yet)")
    .option("--name <name>", "with --web: the human grader's name (not available yet)")
    .option("--plain", "no progress line, even in a terminal")
    .action(
      async (
        results: string[],
        options: {
          quiz: string;
          output?: string;
          grades?: string;
          json?: boolean;
          web?: boolean;
          name?: string;
          plain?: boolean;
        },
      ) => {
        const opts: GradeOptions = {
          quiz: options.quiz,
          output: options.output ?? null,
          grades: options.grades ?? null,
          json: Boolean(options.json),
          web: Boolean(options.web),
          name: options.name ?? null,
          plain: Boolean(options.plain) || noColor(),
        };
        outcome.exit = await (await import("./grade")).runGrade(results, opts, io);
      },
    );

  const LATER = ["watch", "serve", "port"] as const;
  program
    .command("build")
    .description("check a quiz, then write it as one offline HTML page")
    .argument("[files...]", "quiz .md files (globs are expanded); with --build-file, only those of its entries")
    .option(
      "-o, --output <out>",
      "the page to write (default: the quiz file with .html); with several files or a build file, a folder",
    )
    .option("--profile <name>", "the check profile; overrides the quiz's profile")
    .option("--config <toml>", "use this config file instead of the nearest fullmark.toml")
    .option("--strict", "warnings count as errors, and nothing is written")
    .option("--built-at <iso>", "pin the build time, so a build is byte-identical across runs (default: now)")
    .option("--build-file <build>", "build what a build file lists (TOML): its [[build]] entries, in order")
    .option("--json", "print one JSON object per file on stdout")
    .option("--open", "open the page after building (one file)")
    .option("--print", "write a printable exam paper (static HTML, black on white) instead of the page")
    .option("--seed <s>", "with --print: shuffle reproducibly; 1 to 8 letters or digits, printed as the paper code")
    .option("--answer-sheet", "with --print: a grid of boxes for the single-choice and true/false answers")
    .option(
      "--answers <mode>",
      "with --print: none (an exam paper), key (the answer key on a new page) or inline (a study sheet)",
    )
    .option("--materials <which>", "with --print: none leaves the materials page out")
    .option("--ui-lang <lang>", "the page's language for this build, en or vi (default: the quiz's ui_lang)")
    .option(
      "--fonts <which>",
      "which fonts the page embeds: quiz (the quiz's own), all or none (default: fonts in config.toml, else quiz)",
    )
    .option("--plain", "no colours and no progress line, even in a terminal")
    .option("--watch", "(not available yet)")
    .option("--serve", "(not available yet)")
    .option("--port <n>", "(not available yet)")
    .action(async (files: string[], options: Record<string, unknown>) => {
      const opts: BuildOptions = {
        profile: (options.profile as string | undefined) ?? null,
        config: (options.config as string | undefined) ?? null,
        strict: Boolean(options.strict),
        output: (options.output as string | undefined) ?? null,
        builtAt: (options.builtAt as string | undefined) ?? null,
        plain: Boolean(options.plain) || noColor(),
        json: Boolean(options.json),
        buildFile: (options.buildFile as string | undefined) ?? null,
        open: Boolean(options.open),
        uiLang: (options.uiLang as string | undefined) ?? null,
        print: Boolean(options.print),
        seed: (options.seed as string | undefined) ?? null,
        answerSheet: Boolean(options.answerSheet),
        answers: (options.answers as string | undefined) ?? null,
        materials: (options.materials as string | undefined) ?? null,
        later: LATER.filter(
          (name) => options[name.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase())] !== undefined,
        ),
        fonts: (options.fonts as string | undefined) ?? null,
        version: VERSION,
      };
      outcome.exit = await (await import("./build")).runBuild(files, opts, io);
    });

  program
    .command("replay")
    .description("write an attempt as a page already submitted: the answers, the explanations and the grades")
    .argument("<results...>", "results files (globs are expanded)")
    .requiredOption("--quiz <file>", "the quiz the attempts were taken on (read, not checked)")
    .option("--grades <file>", "show these grades for essays and code (default: RESULTS-grades.json beside it, if any)")
    .option(
      "-o, --output <out>",
      "the page to write (default: RESULTS with -replay.html); with several files, a folder",
    )
    .option("--built-at <iso>", "pin the build time, so a page is byte-identical across runs (default: now)")
    .option("--ui-lang <lang>", "the page's language, en or vi (default: the quiz's ui_lang)")
    .option("--fonts <which>", "which fonts the page embeds: quiz (the quiz's own), all or none")
    .option("--open", "open the page after writing it (the default for one file)")
    .option("--no-open", "do not open the page")
    .option("--json", "print one JSON object per file on stdout")
    .option("--plain", "no colours and no progress line, even in a terminal")
    .action(async (results: string[], options: Record<string, unknown>) => {
      const opts: ReplayCommandOptions = {
        quiz: (options.quiz as string | undefined) ?? null,
        grades: (options.grades as string | undefined) ?? null,
        output: (options.output as string | undefined) ?? null,
        builtAt: (options.builtAt as string | undefined) ?? null,
        uiLang: (options.uiLang as string | undefined) ?? null,
        fonts: (options.fonts as string | undefined) ?? null,
        plain: Boolean(options.plain) || noColor(),
        json: Boolean(options.json),
        open: options.open === true,
        noOpen: options.open === false,
        version: VERSION,
      };
      outcome.exit = await (await import("./replay-command")).runReplay(results, opts, io);
    });

  program
    .command("inspect")
    .description("summarise a quiz: question types, points, sections, tags, banks and where the right answers sit")
    .argument("<file>", "a quiz .md")
    .option("--profile <name>", "the check profile; overrides the quiz's profile")
    .option("--config <toml>", "use this config file instead of the nearest fullmark.toml")
    .option("--review <review.json>", "also count the kept, to-fix and to-drop questions (not available yet)")
    .option("--json", "print the summary as one JSON object on stdout")
    .option("--plain", "no colours, even in a terminal")
    .action(async (file: string, options: Record<string, unknown>) => {
      const opts: InspectOptions = {
        profile: (options.profile as string | undefined) ?? null,
        config: (options.config as string | undefined) ?? null,
        review: (options.review as string | undefined) ?? null,
        json: Boolean(options.json),
        plain: Boolean(options.plain) || noColor(),
      };
      outcome.exit = (await import("./inspect")).runInspect(file, opts, io);
    });

  program
    .command("stats")
    .description("progress across attempts at one quiz: score by date, tags, weakest tags, questions missed, criteria")
    .argument("<files...>", "two or more reports (*-report.json) or results files (globs are expanded)")
    .option("--quiz <file>", "the current quiz: names questions and tags, and grades results files of its version")
    .option("--json", "print the summary as one JSON object")
    .action(async (files: string[], options: { quiz?: string; json?: boolean }) => {
      const opts = { quiz: options.quiz ?? null, json: Boolean(options.json) };
      outcome.exit = (await import("./stats")).runStats(files, opts, io);
    });

  program
    .command("new")
    .description("start a quiz from a template (quiz template list) or from an existing quiz")
    .argument("[args...]", "TEMPLATE [PATH], or with --from only the PATH (default: the current folder)")
    .option("--from <file>", "start from this quiz .md and its assets, in place of a template")
    .option("--skeleton", "with --from: keep the structure and empty the content")
    .option("--json", "print the outcome as one JSON object")
    .action(async (args: string[], options: { from?: string; skeleton?: boolean; json?: boolean }) => {
      const opts: NewOptions = {
        from: options.from ?? null,
        skeleton: Boolean(options.skeleton),
        json: Boolean(options.json),
      };
      outcome.exit = await (await import("./new")).runNew(args, opts, io);
    });

  const template = program
    .command("template")
    .description("the templates you start quizzes from: built-in and your own");
  template
    .command("list")
    .description("every template and where it comes from")
    .option("--json", "print the templates as a JSON array")
    .action(async (options: { json?: boolean }) => {
      outcome.exit = (await import("./template")).runTemplateList(Boolean(options.json), io);
    });
  template
    .command("add")
    .description("store a quiz and its assets as your own template")
    .argument("<file>", "a quiz .md")
    .option("--as <name>", "the template's name: a slug (default: the file name, slugged)")
    .option("--skeleton", "store the structure without the content, as new --from --skeleton makes it")
    .option("--replace", "overwrite one of your templates of that name")
    .option("--json", "print the outcome as one JSON object")
    .action(async (file: string, options: { as?: string; skeleton?: boolean; replace?: boolean; json?: boolean }) => {
      outcome.exit = await (await import("./template")).runTemplateAdd(
        file,
        {
          as: options.as ?? null,
          skeleton: Boolean(options.skeleton),
          replace: Boolean(options.replace),
          json: Boolean(options.json),
        },
        io,
      );
    });
  template
    .command("rm")
    .description("delete one of your templates")
    .argument("<name>", "the template's name")
    .option("--yes", "do not ask first")
    .option("--json", "print the outcome as one JSON object (never asks: needs --yes)")
    .action(async (name: string, options: { yes?: boolean; json?: boolean }) => {
      outcome.exit = await (await import("./template")).runTemplateRemove(
        name,
        { yes: Boolean(options.yes), json: Boolean(options.json) },
        io,
      );
    });

  program
    .command("serve")
    .description("serve a quiz on 127.0.0.1 and write the results when the learner presses Submit (one submit only)")
    .argument("<file>", "the quiz .md (a built page is refused: use its Export button)")
    .option("--out <results>", "the results file (default: <quiz-id>-results-<time>.json next to the quiz)")
    .option("--timeout <seconds>", "how long to wait for a submit; 0 waits forever (default 1800)")
    .option("--open", "open the page in the default browser")
    .option("--port <n>", "the port on 127.0.0.1 (default: a free one)")
    .option("--profile <name>", "the check profile; overrides the quiz's profile")
    .option("--config <toml>", "use this config file instead of the nearest fullmark.toml")
    .option("--fonts <which>", "which fonts the page embeds: quiz (the quiz's own), all or none")
    .option("--focus", "tick Focus mode on the start screen")
    .option("--section <s>", "serve only this section (its slug or title)")
    .option("--autosave <progress>", "keep the attempt in progress in this file, so it resumes after a restart")
    .option("--json", "print a listening line, then the outcome, as JSON on stdout")
    .action(async (file: string, options: Record<string, unknown>) => {
      const opts: ServeOptions = {
        out: (options.out as string | undefined) ?? null,
        timeout: (options.timeout as string | undefined) ?? null,
        open: Boolean(options.open),
        port: (options.port as string | undefined) ?? null,
        json: Boolean(options.json),
        profile: (options.profile as string | undefined) ?? null,
        config: (options.config as string | undefined) ?? null,
        fonts: (options.fonts as string | undefined) ?? null,
        focus: Boolean(options.focus),
        section: (options.section as string | undefined) ?? null,
        autosave: (options.autosave as string | undefined) ?? null,
        version: VERSION,
      };
      outcome.exit = await (await import("./serve")).runServe(file, opts, io);
    });
  return program;
}

async function main(argv: string[]): Promise<number> {
  const outcome: Outcome = { exit: EXIT.done };
  try {
    const program = buildProgram(outcome);
    // no command: the help goes to stderr and the exit code is 2 (COMMANDS.md, Exit codes)
    // the notices sit in their own chunk, so no other command pays for them (test/cli-graph.test.ts)
    if (argv[2] === "--acknowledgements") {
      process.stdout.write((await import("./acknowledgements")).acknowledgements());
      return EXIT.done;
    }
    if (argv.length <= 2) {
      program.outputHelp({ error: true });
      return EXIT.usage;
    }
    await program.parseAsync(argv);
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
