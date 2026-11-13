import assert from "node:assert/strict";
import test from "node:test";
import { imagePath, fitImage, previewAsset } from "../../.build/mods/muxcle-image-preview/model.js";

test("path input handles quoted paths without interpreting shell syntax", () => {
  assert.equal(imagePath(' "~/Pictures/a b.png" '), "~/Pictures/a b.png");
  assert.equal(imagePath("/tmp/$(touch NEVER).png"), "/tmp/$(touch NEVER).png");
  for (const path of ["https://example.test/image.png", "a.png\nb.png", "", "a\0.png", "a".repeat(4_097), null]) {
    assert.throws(() => imagePath(path));
  }
});

test("image fits the popup without cropping or stretching", () => {
  assert.deepEqual(fitImage(1600, 800, 800, 600), { width: 800, height: 400 });
  assert.deepEqual(fitImage(800, 1600, 800, 600), { width: 300, height: 600 });
  assert.deepEqual(fitImage(100, 50, 800, 600), { width: 800, height: 400 });
  for (const dimensions of [
    [0, 800, 800, 600],
    [-1, 800, 800, 600],
    [800, 800, 0, 600],
    [Infinity, 800, 800, 600],
  ]) {
    assert.throws(() => fitImage(...dimensions));
  }
});

test("only staged preview assets may reach the native image loader", () => {
  const name = `image-${"a".repeat(64)}.png`;
  assert.equal(
    previewAsset({ path: `/app/image-previews/${name}`, width: 1, height: 1 }, "/app"),
    `image-previews/${name}`,
  );
  for (const home of ["", null]) {
    assert.throws(() => previewAsset({ path: `/app/image-previews/${name}`, width: 1, height: 1 }, home));
  }
  for (const result of [
    { path: "https://example.test/a.png", width: 1, height: 1 },
    { path: "/tmp/random.png", width: 1, height: 1 },
    { path: `/tmp/image-${"a".repeat(64)}.png`, width: 1, height: 1 },
    { path: `/app/image-previews/${name}`, width: 0, height: 1 },
    { path: `/app/image-previews/${name}`, width: 5_001, height: 5_000 },
    null,
  ]) {
    assert.throws(() => previewAsset(result, "/app"));
  }
});
