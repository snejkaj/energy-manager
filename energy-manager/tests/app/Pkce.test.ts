import { describe, expect, it } from "vitest";

import { computePkceChallenge } from "../../src/app/auth/Pkce.js";

describe("PKCE", () => {
  it("computes the expected Tesla code challenge", () => {
    expect(computePkceChallenge(
      "3QkatVKGEyAlTa4v2Q4zF-aUmhOuiXQpjbkvmLFLnCdPLDaWyof8d_LkIv3TSin_igXdzs9g_2CeWgNpKO9rcQ",
    )).toBe("KtA5XI3Bam2X4DsPh616m-VdyQFHERwECAyBBUBEGKs");
  });
});
