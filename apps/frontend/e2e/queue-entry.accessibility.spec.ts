import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/ers/er-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'er-1', name: 'ER Teste', isDayOpen: true }),
    })
  })
  await page.route('**/api/telemetry/**', async (route) => {
    await route.fulfill({ status: 201 })
  })
})

test('supports keyboard tabs and passes axe in the queue-entry journey', async ({ page }) => {
  await page.goto('/fila/er-1')
  await expect(page.getByRole('heading', { name: 'Entrar na fila' })).toBeVisible()
  await expect(page.getByText('ER Teste')).toBeVisible()

  const loginTab = page.getByRole('tab', { name: 'Já tenho cadastro' })
  const registerTab = page.getByRole('tab', { name: 'Criar cadastro' })

  await loginTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(registerTab).toBeFocused()
  await expect(registerTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: 'Criar cadastro' })).toBeVisible()

  const registerScan = await new AxeBuilder({ page }).analyze()
  expect(registerScan.violations).toEqual([])

  await page.keyboard.press('Home')
  await expect(loginTab).toBeFocused()
  await expect(page.getByRole('tabpanel', { name: 'Já tenho cadastro' })).toBeVisible()

  const loginScan = await new AxeBuilder({ page }).analyze()
  expect(loginScan.violations).toEqual([])
})
