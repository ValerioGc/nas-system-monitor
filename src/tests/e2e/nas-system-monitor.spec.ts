import { expect, test, type Page } from '@playwright/test';

const backends = new WeakSet<Page>();

async function openInShell(
  page: Page,
  path = '/',
  processCount = 3,
  telemetryReady = Promise.resolve(),
  preferences: unknown = null,
) {
  if (!backends.has(page)) {
    backends.add(page);
    let saved = JSON.stringify(preferences);
    await page.route('**/api/documents/preferences', async (route) => {
      if (route.request().method() === 'PUT') {
        saved = route.request().postData() ?? 'null';
        await route.fulfill({ status: 204 });
        return;
      }
      await route.fulfill({ contentType: 'application/json', body: saved });
    });
  }
  await page.route('**/shell.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><iframe src="${path}" title="app" style="width:100%;height:95vh"></iframe>
<script>
  const process = (id, name, kind, cpu, essential) => ({
    id, name, process: '/usr/bin/' + name, ram: 40 + id, cpu, gpu: kind === 'user' ? 7 : null,
    state: 'sleeping', kind, started: 900, unit: name + '.service',
    canTerminate: !essential, canRestart: kind !== 'user',
  });
  const state = {
    processes: [
      process(10, 'firefox', 'user', 12, false),
      process(20, 'nas-os', 'nas', 4, true),
      process(30, 'cron', 'system', 0.5, false),
    ],
  };
  for (let id = 100; state.processes.length < ${processCount}; id++) {
    state.processes.push(process(id, 'worker-' + id, 'system', 0, false));
  }
  const sensor = (id, group, device, label, metric, value) => ({ id, group, device, label, metric, value });
  window.asked = [];
  const answers = {
    telemetry: () => ({
      metrics: { cpu: 21, cores: 8, physicalCores: 4, temperature: 48, ram: 3, ramTotal: 8, swap: 0, swapTotal: 2, load: 0.8, uptime: 7200 },
      processes: state.processes,
      sensors: [
        sensor('cpu-usage', 'cpu', 'CPU', 'usage', 'usage', 21),
        sensor('cpu-coretemp-temp-0', 'cpu', 'coretemp', 'Package id 0', 'temperature', 48),
        sensor('cpu-intel-rapl:0-tdp', 'cpu', 'package-0', 'power limit', 'tdp', 65),
        sensor('gpu0-usage', 'gpu', 'GPU 0 (amdgpu)', 'usage', 'usage', 9),
        sensor('ram-usage', 'ram', 'RAM', 'usage', 'usage', 37.5),
        sensor('disk-sda-usage', 'disk', 'sda (WDC)', 'activity', 'usage', 2),
        sensor('disk-sda-temp-0', 'disk', 'sda (WDC)', 'temp1', 'temperature', 35),
      ],
    }),
    'process-action': ({ id, action }) => {
      const found = state.processes.find((item) => item.id === id);
      if (action === 'terminate' && !found.canTerminate) throw new Error(found.name + ' keeps the NAS working: it can only be restarted');
      if (action === 'terminate') state.processes = state.processes.filter((item) => item.id !== id);
      return null;
    },
  };
  window.telemetry = answers.telemetry;
  addEventListener('message', ({ data, source }) => {
    if (!data || data.nas !== 1) return;
    if (data.type === 'ready') {
      source.postMessage({ nas: 1, type: 'context', context: {
        app: 'nas-system-monitor', locale: 'it', theme: 'dark', accent: '#3fd39b',
        palette: { background: '#172027', foreground: '#f2f7f5', surface: '#131f29', sunken: '#0e1922', hover: '#1c2d3b', border: '#24394a', muted: '#a4b6c3' },
      } }, location.origin);
      return;
    }
    if (!(data.type in answers)) return;
    window.asked.push([data.type, data.payload]);
    let answer;
    try {
      answer = { success: true, data: answers[data.type](data.payload) };
    } catch (error) {
      answer = { success: false, error: error.message };
    }
    source.postMessage(
      { nas: 1, type: data.type + '-result', requestId: data.requestId, ...answer },
      location.origin,
    );
  });
</script>`,
    }),
  );
  await page.route('**/api/telemetry', async (route) => {
    await telemetryReady;
    const json = await page.evaluate(() =>
      (window as unknown as { telemetry: () => unknown }).telemetry(),
    );
    await route.fulfill({ json });
  });
  await page.goto('/shell.html');
  return page.frameLocator('iframe');
}

const asked = (page: Page) =>
  page.evaluate(() => (window as unknown as { asked: [string, unknown][] }).asked);

test('the widget centers a themed spinner until its first telemetry reading arrives', async ({
  page,
}) => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const widget = await openInShell(page, '/?view=widget', 3, waiting);
    const loading = widget.getByTestId('widget_loading');
    await expect(loading).toBeVisible();
    await expect(widget.getByRole('status')).toHaveText('Caricamento in corso');
    await expect(loading).toHaveText('Caricamento in corso');
    await expect(widget.getByTestId('process_table')).toHaveCount(0);
    const spinner = loading.locator('[aria-hidden="true"]');
    await expect(spinner).toHaveCSS('width', '36px');
    await expect(widget.locator('body')).toHaveCSS('background-color', 'rgb(19, 31, 41)');
    const area = await loading.boundingBox();
    const ring = await spinner.boundingBox();
    expect(area!.height).toBeGreaterThan(500);
    expect(Math.abs(ring!.x + ring!.width / 2 - (area!.x + area!.width / 2))).toBeLessThan(2);
    expect(Math.abs(ring!.y + ring!.height / 2 - (area!.y + area!.height / 2))).toBeLessThan(40);
    await page.screenshot({ path: '/tmp/nas-monitor-widget-telemetry-loading.png' });
    release();
    await expect(loading).toHaveCount(0);
    await expect(widget.getByTestId('process_table')).toBeVisible();
  } finally {
    release();
  }
});

test('the process table scrolls while its title, description and filters stay visible', async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 480 },
    { width: 390, height: 650 },
  ]) {
    await page.setViewportSize(viewport);
    const app = await openInShell(page, '/', 80);
    await app.getByTestId('section_processes').click();
    await expect(app.getByTestId('process_count')).toHaveText('80 processi');
    const region = app.getByRole('region', { name: 'Processi', exact: true });
    const fixed = [
      region.getByRole('heading', { name: 'Processi', exact: true }),
      region.getByRole('paragraph').first(),
      app.getByTestId('process_filter_all'),
      app.getByTestId('process_count'),
      app.getByTestId('process_sort_name'),
    ];
    const before = await Promise.all(fixed.map((element) => element.boundingBox()));
    const rows = app.getByTestId('process_rows');
    const area = await rows.boundingBox();
    const heading = await app.getByTestId('process_sort_name').boundingBox();
    expect(area!.y).toBeGreaterThan(heading!.y + heading!.height);
    await page.mouse.move(area!.x + area!.width / 2, area!.y + 80);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => rows.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await app.getByTestId('process_table').evaluate((element) => element.scrollTop)).toBe(0);
    for (const [index, element] of fixed.entries()) {
      await expect(element).toBeInViewport({ ratio: 1 });
      expect((await element.boundingBox())?.y).toBe(before[index]?.y);
    }
    expect(await app.getByTestId('app_content').evaluate((element) => element.scrollTop)).toBe(0);
    await app.getByTestId('process_filter_user').click();
    await expect(app.getByTestId('process_count')).toHaveText('1 processi');
    await expect(app.getByTestId('process_10')).toBeVisible();
  }
});

test('the monitor shows the sensors part by part and chooses those of the widget', async ({
  page,
}) => {
  const app = await openInShell(page);

  await expect(app.getByRole('heading', { level: 1, name: 'Monitor' })).toBeVisible();
  await expect(app.getByTestId('summary_cores')).toHaveText('4');
  await expect(app.getByTestId('summary_threads')).toHaveText('8');
  await expect(app.getByTestId('summary_ram')).toHaveText('3 / 8 GB');
  await expect(app.getByTestId('summary_uptime')).toHaveText('2 h');
  expect(await asked(page)).not.toContainEqual(['system-telemetry', undefined]);
  await expect(app.getByTestId('group_cpu').locator('.sensor_card')).toHaveCount(3);
  await expect(app.getByTestId('group_gpu')).toContainText('9%');
  await expect(app.getByTestId('group_disk')).toContainText('35 °C');
  await expect(app.getByTestId('widget_count')).toHaveText('2 di 6 nel widget');

  await app.getByTestId('sensor_pin_disk-sda-temp-0').click();
  await expect(app.getByTestId('widget_count')).toHaveText('3 di 6 nel widget');
  await app.getByTestId('options_open').click();
  await app.getByTestId('options_list_system').click();
  await expect(app.getByTestId('options')).toContainText('sda (WDC) · Temperatura');
});

test('the processes are filtered, ended and restarted from their menu', async ({ page }) => {
  const app = await openInShell(page);

  await app.getByTestId('section_processes').click();
  await expect(app.getByTestId('process_count')).toHaveText('3 processi');
  await app.getByTestId('process_filter_user').click();
  await expect(app.getByTestId('process_count')).toHaveText('1 processi');
  await app.getByTestId('process_filter_all').click();

  await app.getByTestId('process_20').click({ button: 'right' });
  await expect(app.getByTestId('process_terminate')).toHaveCount(0);
  await expect(app.getByTestId('process_essential')).toHaveCount(0);
  await app.getByTestId('process_restart').click();
  await expect
    .poll(() => asked(page))
    .toContainEqual(['process-action', { id: 20, started: 900, action: 'restart' }]);

  await app.getByTestId('process_10').click({ button: 'right' });
  await app.getByTestId('process_terminate').click();
  await expect(app.getByTestId('process_10')).toHaveCount(0);
  await app.getByTestId('process_filter_user').click();
  const empty = app.getByTestId('process_empty');
  await expect(empty).toHaveText('Nessun processo');
  await expect(app.getByRole('status').and(empty)).toHaveText('Nessun processo');
  const content = app.getByTestId('process_empty_content');
  await expect(content.locator('.app_icon')).toBeVisible();
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 650 },
  ]) {
    await page.setViewportSize(viewport);
    const area = await empty.boundingBox();
    const message = await content.boundingBox();
    expect(Math.abs(message!.x + message!.width / 2 - (area!.x + area!.width / 2))).toBeLessThan(2);
    expect(Math.abs(message!.y + message!.height / 2 - (area!.y + area!.height / 2))).toBeLessThan(
      2,
    );
    await expect(content).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `/tmp/monitor-process-empty-${viewport.width}.png` });
  }
  await app.getByTestId('process_filter_all').click();
  await expect(empty).toHaveCount(0);
  await expect(app.getByTestId('process_20')).toBeVisible();
});

test('process memory settings persist and the shared tables preserve available GPU readings', async ({
  page,
}) => {
  const app = await openInShell(page);
  const sidebar = app.getByTestId('app_sidebar');
  await expect(sidebar).toHaveText(/Monitor\s+Processi\s+Impostazioni/);
  await expect(sidebar).not.toContainText('Sezioni');
  await expect(sidebar.locator('.brand')).toHaveCount(0);
  await app.getByTestId('section_processes').click();
  await expect(app.getByTestId('process_filter_all')).toHaveText('Tutti');
  await expect(
    app.getByTestId('process_filter_all').locator('..').getByRole('button').first(),
  ).toHaveText('Tutti');
  await expect(app.getByTestId('process_20').locator('.column_gpu')).toHaveText('0%');
  await expect(app.getByTestId('process_10').locator('.column_gpu')).toHaveText('7%');
  await expect(app.getByTestId('process_10').locator('.column_ram')).toHaveText('50 MB');

  await app.getByTestId('options_open').click();
  await expect(app.getByRole('dialog', { name: 'Impostazioni' })).toBeVisible();
  await expect(
    app.getByTestId('options_list_all').locator('..').getByRole('button').first(),
  ).toHaveText('Tutti');
  const saved = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/api/documents/preferences'),
  );
  await app.getByTestId('options_ram_unit').selectOption('percent');
  await app.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(app.getByTestId('process_10').locator('.column_ram')).toHaveText('0.6%');
  expect((await saved).postDataJSON()).toEqual(
    expect.objectContaining({ processMemoryUnit: 'percent' }),
  );

  await page.reload();
  await app.getByTestId('section_processes').click();
  await expect(app.getByTestId('process_10').locator('.column_ram')).toHaveText('0.6%');
  const widget = await openInShell(page, '/?view=widget');
  await expect(widget.getByTestId('process_10').locator('.column_ram')).toHaveText('0.6%');
});

test('settings keep a fixed size while sensors and the body scroll inside the dialog', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const selected = [
    'cpu-usage',
    'cpu-coretemp-temp-0',
    'cpu-intel-rapl:0-tdp',
    'gpu0-usage',
    'ram-usage',
    'disk-sda-temp-0',
  ];
  const app = await openInShell(page, '/', 3, Promise.resolve(), { widgetSensors: selected });
  await app.getByTestId('options_open').click();
  const dialog = app.getByRole('dialog', { name: 'Impostazioni' });
  const panel = dialog.locator('.modal');
  const before = await panel.boundingBox();
  expect(before?.height).toBe(600);
  const list = app.locator('.option_sensors');
  const listScrolled = await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(listScrolled).toBeGreaterThan(0);
  for (const id of [...selected].reverse()) {
    await app.getByTestId(`options_remove_${id}`).click();
  }
  await expect(app.getByTestId('options')).toContainText('Nessun sensore selezionato');
  const after = await panel.boundingBox();
  expect(after?.height).toBe(before?.height);
  expect(after?.width).toBe(before?.width);

  await page.setViewportSize({ width: 1280, height: 400 });
  const scrolled = await dialog.locator('.modal_body').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  await expect(dialog.getByRole('heading', { name: 'Impostazioni' })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Chiudi', exact: true })).toBeInViewport();
  await dialog.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('the widget folds its monitor and lists the processes chosen in the options', async ({
  page,
}) => {
  const widget = await openInShell(page, '/?view=widget', 3, Promise.resolve(), {
    widgetList: 'nas',
    widgetSensors: ['cpu-usage', 'gpu0-usage'],
  });

  await expect(widget.getByTestId('monitor_widget')).toBeVisible();
  await expect(widget.locator('.sensor_card')).toHaveCount(2);
  await expect(widget.getByTestId('process_20')).toBeVisible();
  await expect(widget.getByTestId('process_10')).toHaveCount(0);
  const fold = widget.getByTestId('widget_fold');
  await expect(fold).toHaveCSS('border-bottom-width', '0px');

  await fold.click();
  await expect(widget.getByTestId('widget_sensors')).toBeHidden();
  await expect(fold).toHaveCSS('border-bottom-width', '1px');
  await expect(fold).toHaveCSS('border-bottom-style', 'solid');

  await widget.getByTestId('process_20').click({ button: 'right' });
  await expect(widget.getByTestId('process_terminate')).toHaveCount(0);
});

test('the dark widget has a themed canvas and left-aligned process names', async ({ page }) => {
  const widget = await openInShell(page, '/?view=widget');
  const table = widget.getByTestId('process_table');
  await expect(table).toBeVisible();
  const colours = await table.evaluate((element) => ({
    background: getComputedStyle(document.body).backgroundColor,
    foreground: getComputedStyle(element).color,
    alignment: getComputedStyle(element.querySelector('td')!).textAlign,
  }));
  expect(colours.background).toBe('rgb(19, 31, 41)');
  expect(colours.foreground).toBe('rgb(242, 247, 245)');
  expect(colours.alignment).toBe('left');
});

test('only the content scrolls and the sidebar remains fully inside its column', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  const app = await openInShell(page);
  await expect(app.getByTestId('group_disk')).toBeVisible();
  const content = app.getByTestId('app_content');
  const sidebar = app.getByTestId('app_sidebar');
  const before = await sidebar.boundingBox();
  const scrolled = await content.evaluate((element) => {
    element.scrollTop = 300;
    return {
      top: element.scrollTop,
      documentTop: window.scrollY,
      scrollable: element.scrollHeight > element.clientHeight,
    };
  });
  const after = await sidebar.boundingBox();
  expect(scrolled.scrollable).toBe(true);
  expect(scrolled.top).toBeGreaterThan(0);
  expect(scrolled.documentTop).toBe(0);
  expect(after?.y).toBe(before?.y);
  await expect(sidebar).not.toContainText('I dati arrivano dal launcher');
  expect(await sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
});
