import type { Page, Locator } from '@playwright/test';

export class GenerationPreviewPage {
  readonly page: Page;
  readonly stepTitle: Locator;
  readonly backButton: Locator;
  readonly reviewOutlineButton: Locator;
  readonly editorTitle: Locator;
  readonly alwaysReviewCheckbox: Locator;
  readonly confirmOutlinesButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.stepTitle = page.locator('h2');
    this.backButton = page.getByRole('button', { name: /back/i });
    this.reviewOutlineButton = page.getByRole('button', {
      name: /tap to review/i,
    });
    this.editorTitle = page.getByRole('heading', {
      name: /scene outline/i,
    });
    this.alwaysReviewCheckbox = page.getByRole('checkbox', {
      name: /always review outlines before generation/i,
    });
    this.confirmOutlinesButton = page.getByRole('button', {
      name: /confirm and generate course/i,
    });
  }

  async goto() {
    await this.page.goto('/generation-preview');
  }

  async waitForRedirectToClassroom() {
    await this.page.waitForURL(/\/classroom\//, { timeout: 30_000 });
  }

  async waitForReviewOpportunity() {
    await this.reviewOutlineButton.waitFor({ state: 'visible' });
  }

  async openOutlineReview() {
    await this.reviewOutlineButton.click();
    await this.waitForEditor();
  }

  async waitForEditor() {
    await this.editorTitle.waitFor({ state: 'visible' });
  }

  async enableAlwaysReview() {
    await this.alwaysReviewCheckbox.check();
  }

  async confirmOutlines() {
    await this.confirmOutlinesButton.click();
  }
}
