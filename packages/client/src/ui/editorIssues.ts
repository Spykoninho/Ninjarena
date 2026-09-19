import type { MapIssue } from '@ninjarena/core';
import { Popover, button, element } from './editorToolbar';

// Le badge résume la validation en continu: la liste détaillée ne s'ouvre qu'à la demande.
export class EditorIssues {
  readonly badge: HTMLButtonElement;
  private readonly popover: Popover;
  private readonly list: HTMLElement;
  private readonly onFocus: (issue: MapIssue) => void;

  constructor(parent: HTMLElement, badgeParent: HTMLElement, onFocus: (issue: MapIssue) => void) {
    this.onFocus = onFocus;
    this.badge = button('', 'editor-badge', badgeParent, () => {
      this.popover.toggle();
    });
    this.popover = new Popover(parent, this.badge, 'editor-issues-panel');
    element('h2', 'editor-section-title', this.popover.root).textContent = 'Vérifications';
    this.list = element('ul', 'editor-issues', this.popover.root);
    this.setIssues([]);
  }

  setOpen(open: boolean): void {
    this.popover.setOpen(open);
  }

  setIssues(issues: MapIssue[]): void {
    const count = issues.length;
    this.badge.textContent = count === 0 ? 'Prête à jouer' : `${String(count)} à corriger`;
    this.badge.classList.toggle('is-clean', count === 0);
    this.list.replaceChildren();
    if (count === 0) {
      element('li', 'editor-issue editor-issue-clean', this.list).textContent =
        'La carte passe toutes les vérifications.';
      return;
    }
    for (const issue of issues) {
      const item = element('li', 'editor-issue', this.list);
      item.textContent = issue.message;
      if (issue.x === undefined || issue.y === undefined) continue;
      item.classList.add('editor-issue-located');
      item.addEventListener('click', () => {
        this.onFocus(issue);
      });
    }
  }
}
