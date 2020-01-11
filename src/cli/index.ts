import assert from "assert";
import commander from "commander";

import { main } from "..";

async function start(): Promise<void> {
  const program = new commander.Command();

  program.option("-e, --event <id>", "event id", Number);
  program.option("-m, --matcher <pattern>", "matcher pattern", String, ".");
  program.option("-o, --output <file>", "output file", String, "donations.csv");
  program.option("-p, --prefix <url>", "prefix url", String, "https://gamesdonequick.com/tracker/");

  program.parse(process.argv);

  assert(program.event, new Error("An event ID must be specified"));
  assert(program.matcher, new Error("An matcher pattern must be specified"));
  assert(program.output, new Error("An output file must be specified"));
  assert(program.prefix, new Error("A prefix URL must be specified"));

  await main({
    matcherPattern: program.matcher,
    outputFile: program.output,
    prefixUrl: program.prefix,
    eventId: program.event,
  });
}

if (require.main === module) {
  start();
}
