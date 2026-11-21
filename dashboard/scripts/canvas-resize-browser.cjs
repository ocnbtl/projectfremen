const assert = require("node:assert/strict");
const { expect } = require("@playwright/test");

module.exports = async function checkResize(page, cards, layout, read) {
  const button = name => page.getByRole("button", { name, exact: true });
  const guides = page.locator(".react-flow__viewport-portal line");
  async function dragEdge(index, side, target, snapping) {
    const card = cards[index], original = layout[index];
    await card.click({ position: { x: 20, y: 20 } });
    const box = await card.boundingBox();
    const control = card.locator(".react-flow__resize-control.line." + side);
    const handle = await control.boundingBox();
    assert(handle);
    const horizontal = side === "right", axis = horizontal ? "x" : "y", size = horizontal ? "width" : "height";
    const zoom = box[size] / original[size];
    const x = handle.x + handle.width * (horizontal ? 0.5 : 0.25);
    const y = handle.y + handle.height * (horizontal ? 0.25 : 0.5);
    const distance = (target - original[axis] - original[size]) * zoom - 3;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (horizontal ? distance : 0), y + (horizontal ? 0 : distance), { steps: 8 });
    if (snapping) {
      const aligned = page.locator('.react-flow__viewport-portal line[' + axis + '1="' + target + '"][' + axis + '2="' + target + '"]');
      await expect(aligned).toHaveCount(1);
      await expect.poll(async () => (await card.boundingBox())[size] / zoom).toBeCloseTo(target - original[axis], 0);
    } else {
      await expect(guides).toHaveCount(0);
      await expect.poll(async () => (await card.boundingBox())[size]).toBeGreaterThan(box[size] + 10);
    }
    await page.mouse.up();
    await expect(guides).toHaveCount(0);
    await expect.poll(async () => (await read())[index][size]).toBeGreaterThan(original[size] + 10);
    const saved = (await read())[index];
    assert.equal(saved.x, original.x);
    assert.equal(saved.y, original.y);
    assert(Math.abs(saved.width / saved.height - original.width / original.height) < 1e-9);
    if (snapping) assert(Math.abs(saved[axis] + saved[size] - target) < 1e-7);
    else assert(Math.abs(saved[axis] + saved[size] - target) >= 1);
    await button("Undo").click();
    await expect.poll(async () => (await read())[index]).toEqual(original);
  }
  await dragEdge(0, "right", layout[1].x, true);
  await dragEdge(1, "bottom", layout[2].y, true);
  await button("Snap to align").click();
  await dragEdge(0, "right", layout[1].x, false);
  await button("Snap to align").click();
  console.log("PASS live right and bottom resize guides, saved media proportions, fixed corner, snap toggle and undo.");
};
