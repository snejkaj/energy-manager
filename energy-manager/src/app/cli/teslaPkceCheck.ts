import { computePkceChallenge, normalizeCodeVerifier } from "../auth/Pkce.js";

const args = parseArgs(process.argv.slice(2));
if (args.codeVerifier === null || args.expectedCodeChallenge === null) {
  fail('Usage: npm run tesla:pkce-check -- --code-verifier "..." --expected-code-challenge "..."');
}

const codeVerifier = normalizeCodeVerifier(args.codeVerifier);
const computedChallenge = computePkceChallenge(codeVerifier);
const matches = computedChallenge === args.expectedCodeChallenge;

process.stdout.write(`code verifier length: ${codeVerifier.length}\n`);
process.stdout.write(`computed code challenge: ${computedChallenge}\n`);
process.stdout.write(`expected code challenge: ${args.expectedCodeChallenge}\n`);
process.stdout.write(`match: ${matches ? "yes" : "no"}\n`);

if (!matches) {
  process.exit(1);
}

function parseArgs(argv: string[]): { codeVerifier: string | null; expectedCodeChallenge: string | null } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if ((current === "--code-verifier" || current === "--expected-code-challenge") && next !== undefined) {
      values.set(current, next);
      index += 1;
    }
  }
  return {
    codeVerifier: normalize(values.get("--code-verifier")),
    expectedCodeChallenge: normalize(values.get("--expected-code-challenge")),
  };
}

function normalize(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value.trim();
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
