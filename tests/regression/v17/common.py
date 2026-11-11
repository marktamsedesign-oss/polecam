import asyncio, json as _json
from playwright.async_api import async_playwright
import os as _os
CHROME = _os.environ.get('GESAA_CHROME') or None  # None: the Chromium that comes with Playwright (python -m playwright install chromium)
BASE={'latitude':7.0412,'longitude':125.0861,'accuracy':3.5}
# v2.15: the app has no default project; older tests that capture straight away get a test project seeded before load
TEST_PROJECT_JS = """(() => { try { const k='polecam.settings'; const s=JSON.parse(localStorage.getItem(k)||'{}');
  if (!s.project && !(s.projects||[]).length) { s.projects=['TEST']; s.project='TEST'; s.meta=Object.assign({TEST:{mode:'survey',purpose:'As-plan'}}, s.meta||{}); localStorage.setItem(k, JSON.stringify(s)); } } catch(e) {} })()"""
# v2.21: an unsaved record left by an earlier test run (context closed with a photo open) is offered at start; the older tests
# do not expect that question, so its draft is dropped before each load unless keep_draft=True (the v2.21 draft tests).
NO_DRAFT_JS = "try { localStorage.removeItem('polecam.draft'); } catch (e) {}"
# v2.26: a new phone gets the sample project once; the older tests start without it (keep_sample=True for the v2.26 tests)
NO_SAMPLE_JS = "try { const k='polecam.settings'; const s=JSON.parse(localStorage.getItem(k)||'{}'); if (!s.sampleDone) { s.sampleDone=true; localStorage.setItem(k, JSON.stringify(s)); } } catch (e) {}"
# v2.42.17: before Save, the app lists what is not set yet (owner, clamp…) with Save anyway; the older tests save without it (save_check=True for the v2.42.17 tests)
NO_SAVECHECK_JS = "try { const k='polecam.settings'; const s=JSON.parse(localStorage.getItem(k)||'{}'); if (s.saveCheck !== false) { s.saveCheck=false; localStorage.setItem(k, JSON.stringify(s)); } } catch (e) {}"
ADM_OPEN_JS = """document.addEventListener('DOMContentLoaded', () => { const f = () => document.querySelectorAll('#admin .group.shut').forEach(g => g.classList.remove('shut'));
  new MutationObserver(f).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] }); f(); });"""  # v2.28: older tests see every admin section open
async def launch(p, udir, video, geo=None, project=True, keep_draft=False, keep_sample=False, admin_folds=False, save_check=False):
    ctx=await p.chromium.launch_persistent_context(udir, executable_path=CHROME, viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True,
        permissions=['geolocation','camera'], geolocation=geo or BASE, accept_downloads=True,
        args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',f'--use-file-for-fake-video-capture={video}'])
    await ctx.route('https://tile.openstreetmap.org/**', lambda r: r.abort())
    await ctx.route('https://server.arcgisonline.com/**', lambda r: r.abort())
    await ctx.route('https://script.google.com/**', sheet_route)  # v2.23: companies come from the online sheet (a test may route its own after this)
    if project: await ctx.add_init_script(TEST_PROJECT_JS)
    if not keep_draft: await ctx.add_init_script(NO_DRAFT_JS)
    if not keep_sample: await ctx.add_init_script(NO_SAMPLE_JS)
    if not save_check: await ctx.add_init_script(NO_SAVECHECK_JS)
    if not admin_folds: await ctx.add_init_script(ADM_OPEN_JS)
    cur=dict(geo or BASE); state={'on':True}
    async def hb():
        while True:
            try:
                if state['on']: await ctx.set_geolocation(cur)
            except Exception: return
            await asyncio.sleep(1)
    task=asyncio.create_task(hb())
    pg=ctx.pages[0] if ctx.pages else await ctx.new_page()
    errs=[]
    pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
    await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
    return ctx, pg, errs, cur, state, task

# v2.4 UI helpers: dropdowns instead of chips, one export card at a time
async def pick(pg, sel, text):
    ok = await pg.evaluate("""([s,t])=>{const e=document.querySelector(s); const o=[...e.options].find(o=>o.text===t||o.value===t)||[...e.options].find(o=>o.text.includes(t)); if(!o) return false; e.value=o.value; e.dispatchEvent(new Event('change',{bubbles:true})); return true;}""", [sel, text])
    if not ok: raise Exception(f'no option {text} in {sel}')
async def picked(pg, sel):
    return await pg.evaluate("s=>{const e=document.querySelector(s); return e.selectedIndex>=0? e.options[e.selectedIndex].text : ''}", sel)
async def xclick(pg, sel):
    await pg.evaluate("s=>window.__polecam.showExport(s)", sel); await pg.click(sel)
async def skipscan(pg):
    # v2.6: the live ID reader may finish the ID step by itself before Skip is tapped
    try:
        if await pg.is_visible('#scanSkip'): await pg.click('#scanSkip', timeout=3000)
    except Exception: pass
# v2.8 Projects: "+ New project" form and a project dropdown
async def newproj(pg, cat='survey', name=None, purpose=None, kmz=None, notes=None, wait=500, close_projects=True):
    if await pg.is_visible('#newProj'): await pg.go_back(); await pg.wait_for_timeout(250)
    if await pg.is_hidden('#projects'): await pg.click('#projectBtn'); await pg.wait_for_timeout(200)
    await pg.click('#newProjBtn'); await pg.wait_for_timeout(250)
    await pg.select_option('#npCat', cat)
    if not purpose and cat == 'survey': purpose = 'As-plan'  # v2.15: the purpose is required
    if purpose: await pg.select_option('#npPurpose', purpose)
    if name is not None: await pg.fill('#npName', name)
    if kmz: await pg.set_input_files('#npKmzInput', kmz)
    if notes: await pg.fill('#npNotes', notes)
    await pg.click('#npCreate'); await pg.wait_for_timeout(wait)
async def openproj(pg, name):
    if await pg.is_hidden('#projects'): await pg.click('#projectBtn'); await pg.wait_for_timeout(200)
    await pick_project(pg, name)
    await pg.go_back(); await pg.wait_for_timeout(300)
# v2.22: the Projects screen is a task list (no dropdown): tap the project's row
async def pick_project(pg, name):
    if await pg.evaluate("__polecam.S.project") == name: return
    await pg.evaluate("() => { const s = document.getElementById('projSearch'); s.value = ''; s.dispatchEvent(new Event('input')); const all = [...document.querySelectorAll('#tmFilter .chip')].find(c => c.textContent.startsWith('All')); if (all) all.click(); }")
    ok = await pg.evaluate("n => { const b = [...document.querySelectorAll('#taskList .task')].find(x => x.dataset.name === n); if (b) b.click(); return !!b; }", name)
    if not ok: raise Exception(f'no project {name} in the task list')
    await pg.wait_for_timeout(300)
# v2.15: a company list is joined by its link or QR code only (no list files)
async def list_text(pg):
    return await pg.evaluate("__polecam.lastQr")
def list_from_file(path):
    import json as _j
    t = open(path).read()
    try:
        j = _j.loads(t); return j.get('data', t) if isinstance(j, dict) else t
    except Exception: return t
async def paste_list(pg, text, update=False, switch=False):
    if update or switch:
        await pg.click('#teamSwitch' if switch else '#teamUpdate'); await pg.wait_for_timeout(200); await pg.click('#askBox button:has-text("Paste link")')
    else: await pg.click('#pfPaste')
    await pg.wait_for_selector('#promptBox:not([hidden])', timeout=6000)
    await pg.fill('#promptInput', text); await pg.click('#promptYes'); await pg.wait_for_timeout(900)
# v2.22: in a PAT / cleanup / FAT record, Element details and On this pole are folded when the record opens
UNFOLD_JS = "() => ['idGroup', 'poleAttach'].forEach(id => { const g = document.getElementById(id); if (g && g.classList.contains('fold') && !g.classList.contains('open')) g.querySelector('h3').click(); })"
async def unfold(pg):
    await pg.evaluate(UNFOLD_JS)
# v2.22: record groups in the list are closed when there are two or more
async def open_groups(pg):
    await pg.evaluate("() => document.querySelectorAll('#listItems .lfold[aria-expanded=false]').forEach(b => b.click())")
async def open_groups_later(pg, ms=400):
    await pg.wait_for_timeout(ms); await open_groups(pg)

# v2.23: the admin's companies come only from the online Google Sheet: a mocked sheet for the tests
SHEET_MOCK = {'companies': [], 'admins': [], 'name': 'Test sheet'}
SHEET_URL = 'https://script.google.com/macros/s/TEST/exec'
async def sheet_route(route):
    if route.request.method == 'POST':
        return await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    return await route.fulfill(status=200, content_type='application/json', body=_json.dumps({'ok': True, 'name': SHEET_MOCK['name'], 'companies': SHEET_MOCK['companies'], 'admins': SHEET_MOCK['admins'], 'tasks': [], 'packs': [], 'scope': 'all', 'strict': False}))
async def sheet_companies(pg, names, admins=None):
    """In Administration: the sheet's companies (set the mock, the sheet URL and read key, Refresh)."""
    SHEET_MOCK['companies'] = list(names); SHEET_MOCK['admins'] = list(admins or [])
    await pg.fill('#admUrl', SHEET_URL); await pg.fill('#admReadKey', 'READ-KEY-TEST')
    await pg.click('#admCoRefresh'); await pg.wait_for_timeout(700)
# v2.23: the FAT starts only from a COMPLETED defect cleanup. From the open PAT (Projects screen): complete the PAT (form
# details filled if missing), start the cleanup, complete it, start the FAT. The FAT is then the open project.
async def fat_via_cleanup(pg):
    W = pg.wait_for_timeout
    async def answer(*labels):
        for _ in range(3):
            if not await pg.is_visible('#askBox'): return
            for l in labels:
                b = pg.locator(f'#askBox button:has-text("{l}")')
                if await b.count() and await b.first.is_visible(): await b.first.click(); await W(500); break
            else: await pg.click('#askBox button.primary'); await W(500)
    if await pg.is_hidden('#projects'): await pg.click('#projectBtn'); await W(300)
    if not await pg.evaluate("!!__polecam.S.meta[__polecam.S.project].completedAt"):
        await pg.evaluate("document.getElementById('curMore').open = true")
        for sel, val in (('#mSite', 'TEST SITE'), ('#mContractor', 'ABC Builders Inc.')):
            if not await pg.input_value(sel): await pg.fill(sel, val); await pg.dispatch_event(sel, 'change')
        await pg.click('#doneBtn'); await W(500); await answer('Complete and lock', 'Complete — no defects', 'Mark complete')
    await pg.click('#startCleanup'); await W(800); await answer('Continue')
    await W(800)
    for _ in range(4):
        if await pg.locator('section.sheet:not([hidden])').count() == 0: break
        await pg.go_back(); await W(300)
    if await pg.is_visible('#visitCard'): await pg.click('#vcClose'); await W(300)
    await pg.click('#projectBtn'); await W(300)
    await pg.click('#doneBtn'); await W(500); await answer('Mark complete')
    await pg.click('#startFat'); await W(800); await answer('Continue'); await W(600)
