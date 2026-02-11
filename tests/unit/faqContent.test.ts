import { describe, expect, it } from 'vitest';
import { FAQ_CATEGORIES, FAQ_ENTRY_COUNT } from '../../src/creator/faqContent';

describe('faq content', () => {
  it('is comprehensive and grouped by category', () => {
    expect(FAQ_CATEGORIES.length).toBeGreaterThanOrEqual(8);
    expect(FAQ_ENTRY_COUNT).toBeGreaterThanOrEqual(70);
  });

  it('has unique non-empty category and entry ids', () => {
    const categoryIds = new Set<string>();
    const entryIds = new Set<string>();

    FAQ_CATEGORIES.forEach((category) => {
      expect(category.id.trim().length).toBeGreaterThan(0);
      expect(category.title.trim().length).toBeGreaterThan(0);
      expect(category.description.trim().length).toBeGreaterThan(0);
      expect(category.entries.length).toBeGreaterThan(0);
      expect(categoryIds.has(category.id)).toBe(false);
      categoryIds.add(category.id);

      category.entries.forEach((entry) => {
        expect(entry.id.trim().length).toBeGreaterThan(0);
        expect(entry.question.trim().length).toBeGreaterThan(0);
        expect(entry.answer.trim().length).toBeGreaterThan(0);
        expect(entryIds.has(entry.id)).toBe(false);
        entryIds.add(entry.id);
      });
    });
  });
});
