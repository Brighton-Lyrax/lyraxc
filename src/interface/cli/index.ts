import { createContainer } from '../../container.js';
import type { AgentEvent } from '../../application/events.js';
import { isAppError, toError } from '../../shared/errors.js';

/**
 * Minimal, dependency-free CLI.
 *
 * Usage:
 *   lyraxc "search for playwright docs on duckduckgo.com"
 *   lyraxc --url https://example.com "extract the page heading"
 *   lyraxc --help
 */
interface CliArgs {
  instruction: string;
  startUrl?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { instruction: '', help: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--url' || arg === '-u') {
      args.startUrl = argv[++i];
    } else if (arg) {
      rest.push(arg);
    }
  }
  args.instruction = rest.join(' ').trim();
  return args;
}

function printHelp(): void {
  console.log(`Lyraxc — human-like browser automation agent

Usage:
  lyraxc [options] "<instruction>"

Options:
  -u, --url <url>   Optional starting URL to open before acting.
  -h, --help        Show this help.

Examples:
  lyraxc "go to https://example.com and extract the main heading"
  lyraxc --url https://duckduckgo.com "search for playwright"
`);
}

/** Pretty-print streaming agent events to the terminal. */
function renderEvent(event: AgentEvent): void {
  switch (event.type) {
    case 'task:started':
      console.log(`\n▶  Task ${event.task.id}: ${event.task.instruction}`);
      break;
    case 'step:planned':
      console.log(`   • plan  #${event.stepIndex}: ${event.action.type}`);
      break;
    case 'step:executed': {
      const status = event.result.success ? 'ok' : `failed (${event.result.error})`;
      const obs = event.result.observation ? ` — ${event.result.observation.slice(0, 120)}` : '';
      console.log(`   ✓ done  #${event.stepIndex}: ${status}${obs}`);
      break;
    }
    case 'task:finished':
      console.log(`\n■  Status: ${event.task.status}`);
      if (event.task.summary) console.log(`   Summary: ${event.task.summary}`);
      if (event.task.error) console.log(`   Error: ${event.task.error}`);
      break;
    default:
      break;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.instruction) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const container = createContainer();
  try {
    const task = await container.orchestrator.run(
      { instruction: args.instruction, startUrl: args.startUrl },
      renderEvent,
    );
    await container.shutdown();
    process.exit(task.status === 'completed' ? 0 : 1);
  } catch (error) {
    const err = toError(error);
    console.error(`\n✗ ${err.message}`);
    if (isAppError(err) && err.details) {
      console.error(JSON.stringify(err.details, null, 2));
    }
    await container.shutdown();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
