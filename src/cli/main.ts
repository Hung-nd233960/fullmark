import { Command } from "commander";
import { EXIT } from "./exit-codes";

export const VERSION = "1.0.0-alpha.0";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("quiz")
    .description("Markdown in, one offline HTML quiz out.")
    .version(`fullmark ${VERSION}`, "--version", "print the version")
    .helpOption("-h, --help", "help for the command")
    .exitOverride();
  return program;
}

function main(argv: string[]): number {
  try {
    buildProgram().parse(argv);
    return EXIT.done;
  } catch (error) {
    const code = (error as { code?: string }).code;
    // --version and --help end the parse through exitOverride; they are not failures.
    if (code === "commander.version" || code === "commander.helpDisplayed" || code === "commander.help") {
      return EXIT.done;
    }
    return EXIT.usage;
  }
}

process.exitCode = main(process.argv);
