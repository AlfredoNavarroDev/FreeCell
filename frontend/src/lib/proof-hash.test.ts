import { describe, expect, it } from "vitest";
import { computeProofHash } from "./proof-hash";

describe("computeProofHash", () => {
  it("calcula el SHA-256 en hex del contenido del archivo", async () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const file = new File([new TextEncoder().encode("hello")], "comprobante.png", {
      type: "image/png",
    });

    const hash = await computeProofHash(file);

    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("da hashes distintos para contenidos distintos", async () => {
    const fileA = new File([new TextEncoder().encode("a")], "a.png");
    const fileB = new File([new TextEncoder().encode("b")], "b.png");

    const [hashA, hashB] = await Promise.all([computeProofHash(fileA), computeProofHash(fileB)]);

    expect(hashA).not.toBe(hashB);
  });
});
