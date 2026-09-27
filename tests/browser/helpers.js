import {expect} from '@playwright/test';

export async function choose(page, label, value) {
  const control=page.getByRole('combobox',{name:label,exact:true});
  await control.click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
  await expect(control).toHaveAttribute('data-value',value);
}

export async function navigate(page, name) {
  const button=page.getByRole('navigation',{name:'Event navigation'}).getByRole('button',{name:new RegExp(`^${name}(?: \\d+)?$`)});
  await button.click();
  await expect(button).toHaveAttribute('aria-current','page');
  await expect(page.locator('.clay-view-stage')).not.toHaveClass(/is-changing/);
}
