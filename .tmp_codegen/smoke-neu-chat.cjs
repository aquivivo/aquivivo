const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });

  const logs = [];
  page.on('console', (msg) => logs.push(`[console:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));
  page.on('requestfailed', (request) => {
    logs.push(`[requestfailed] ${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`);
  });

  const url = 'http://127.0.0.1:5501/app/neu-social-app.html?portal=pulse';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3000);

  const initialState = await page.evaluate(() => {
    const q = (selector) => document.querySelector(selector);
    const visible = (el) =>
      !!el &&
      !el.hidden &&
      getComputedStyle(el).display !== 'none' &&
      getComputedStyle(el).visibility !== 'hidden';

    return {
      href: location.href,
      title: document.title,
      bodyClass: document.body.className,
      hasDock: !!q('#miniChatDock'),
      hasLauncher: !!q('#miniChatLauncher'),
      hasPanel: !!q('#miniChatPanel'),
      panelHidden: q('#miniChatPanel') ? q('#miniChatPanel').hidden : null,
      hasPulseList: !!q('#neuInboxList'),
      pulseListChildren: q('#neuInboxList') ? q('#neuInboxList').children.length : null,
      hasPulseHost: !!q('#neuInboxChatHost'),
      pulseHostHidden: q('#neuInboxChatHost') ? q('#neuInboxChatHost').hidden : null,
      pulseEmptyHidden: q('#neuInboxEmpty') ? q('#neuInboxEmpty').hidden : null,
      dockVisible: visible(q('#miniChatDock')),
      launcherVisible: visible(q('#miniChatLauncher')),
      bottomPulseVisible: visible(
        q('.bottom-nav-btn[data-bottom-target="pulse"], .bottom-nav-btn[data-portal-target="pulse"]'),
      ),
      bodyText: document.body.innerText.slice(0, 1200),
    };
  });

  if (await page.locator('#miniChatLauncher').count()) {
    await page.click('#miniChatLauncher');
    await page.waitForTimeout(500);
  }

  const afterLauncher = await page.evaluate(() => {
    const panel = document.querySelector('#miniChatPanel');
    const list = document.querySelector('#miniChatList');
    return {
      panelHidden: panel ? panel.hidden : null,
      panelText: panel ? panel.innerText.slice(0, 400) : '',
      dockListChildren: list ? list.children.length : null,
    };
  });

  await page.screenshot({
    path: '.tmp_codegen/neu-smoke-pulse-dock.png',
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        initialState,
        afterLauncher,
        logs,
      },
      null,
      2,
    ),
  );

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
