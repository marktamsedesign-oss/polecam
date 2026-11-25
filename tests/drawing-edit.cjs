/* (beta 7.14, View / Edit) What the Drawing's browser tests share: the Drawing opens in View every time (the owner: "The user need to click edit mode before going
   to select and do some editing"), so a test that selects, drags or changes anything on the plan turns Edit on first, as a person does: a click on Edit, the switch
   at the head of the Drawing's row of tools (shown with the template plan; waited for while the plan is being made). Not a test file: each spec requires it.
   Also: the chip of what was changed by hand (in Edit; 7.9-7.13's chip "… placed by hand · Back to automatic" was there), its list's Put all back, and More ›
   All automatic (the question that chip asked). */
'use strict';
const assert = require('node:assert/strict');

/** The switch as it is now: { on: shown, mode: 'view' | 'edit', … } (see window.__polecam.drwMode in app.js). */
const modeOf = (page) => page.evaluate(() => window.__polecam.drwMode());

/** Edit on, by a click on the switch's Edit (the plan's row shown first: up to 30 s while the plan is made). Returns the switch as it is then. */
async function editOn(page) {
  let M = await modeOf(page);
  for (let i = 0; i < 120 && !(M && M.on && M.edit); i++) { await page.waitForTimeout(250); M = await modeOf(page); }
  assert.ok(M && M.on && M.edit, `the View / Edit switch on the Drawing: ${JSON.stringify(M)}`);
  if (M.mode !== 'edit') { await page.click('#drawModeEdit'); await page.waitForTimeout(120); M = await modeOf(page); }
  assert.equal(M.mode, 'edit', 'Edit on'); return M;
}

/** View again, by a click on the switch's View. */
async function viewOn(page) {
  const M0 = await modeOf(page); assert.ok(M0 && M0.on && M0.view, `the switch: ${JSON.stringify(M0)}`);
  if (M0.mode !== 'view') { await page.click('#drawModeView'); await page.waitForTimeout(120); }
  const M = await modeOf(page); assert.equal(M.mode, 'view', 'View on'); return M;
}

/** The chip of what was changed by hand and its list (see window.__polecam.drwChg). */
const chgOf = (page) => page.evaluate(() => window.__polecam.drwChg());

/** Put all back from the chip's list (as Back to automatic on the 7.9-7.13 chip did): the list opened, Put all back, the question answered (yes: Put all back;
 *  else Cancel). Returns the question's title. */
async function putAllBack(page, yes) {
  let C = await chgOf(page); assert.ok(C.shown, 'the chip of what was changed by hand (Edit on)');
  if (!C.open) { await page.click('#drawChg'); await page.waitForTimeout(200); C = await chgOf(page); }
  assert.ok(C.open && C.allBack, `its list, with Put all back: ${JSON.stringify(C.list)}`);
  await page.click('#drawChgBox [data-c="all"]'); await page.waitForTimeout(300);
  const title = await page.evaluate(() => (document.getElementById('askBox').hidden ? null : document.getElementById('askTitle').textContent)); assert.ok(title, 'asked first');
  await page.evaluate((y) => { const B = [...document.querySelectorAll('#askBox .row button')]; (B.find((b) => b.textContent === (y ? 'Put all back' : 'Cancel')) || B.pop()).click(); }, yes !== false);
  await page.waitForTimeout(300); return title;
}

/** More › All automatic (Back to automatic for all, as the 7.9-7.13 chip asked it: the same question), the question left open for the test to answer. */
async function allAutomatic(page) {
  await page.click('#drawIcons [data-a="more"]'); await page.waitForTimeout(150); await page.click('#drawIcoPop [data-a="autoall"]'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.getElementById('askBox').hidden), false, 'asked first');
}

module.exports = { modeOf, editOn, viewOn, chgOf, putAllBack, allAutomatic };
